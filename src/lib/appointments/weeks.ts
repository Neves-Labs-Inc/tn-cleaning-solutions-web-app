import {
  differenceInCalendarWeeks,
  eachWeekOfInterval,
  format,
  parse,
} from "date-fns";

import type { ScheduleAppointment } from "./overview.ts";
import {
  getWeekEnd,
  getWeekStart,
  MAX_LIST_WEEKS,
  parseDate,
  type DateRange,
} from "./range.ts";

// The appointments screen caches its range reads per Sunday-start week, so Week, List and
// Month share the weeks they overlap. This module maps a range to its weeks and back. Dates
// are business dates (yyyy-MM-dd) handled as local calendar days, never instants. Pure, like
// range.ts, so node:test, the server and the client all load it.

const DATE_FORMAT = "yyyy-MM-dd";
// A month touches at most six weeks.
const MAX_MONTH_WEEKS = 6;
// The longest List read, plus room for a month's edge weeks.
export const MAX_SPAN_WEEKS = MAX_LIST_WEEKS + MAX_MONTH_WEEKS;

// A run of whole weeks: a Sunday to the Saturday that ends the last week.
export type WeeksSpan = { from: string; to: string };

// One span read split by week start, every week of the span present.
export type AppointmentWeeks = Record<string, ScheduleAppointment[]>;

function toDay(date: string): Date {
  return parse(date, DATE_FORMAT, new Date());
}

function toDate(day: Date): string {
  return format(day, DATE_FORMAT);
}

// The Sunday week starts the range touches, in order. Week and List ranges are whole weeks;
// a Month's first and last weeks spill outside the month.
export function weeksForRange({ from, to }: DateRange): string[] {
  if (to === null) {
    throw new RangeError("weeksForRange needs a range with an end");
  }

  return eachWeekOfInterval({ start: toDay(from), end: toDay(to) }).map(
    toDate,
  );
}

// The weeks still to fetch, in order.
export function missingWeeks(
  weeks: string[],
  isCached: (week: string) => boolean,
): string[] {
  return weeks.filter((week) => !isCached(week));
}

// Strings compare correctly here: dates are yyyy-MM-dd and times HH:mm:ss.
function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

// The order listRangeAppointments returns: date, start time, then id.
function compareAppointments(
  left: ScheduleAppointment,
  right: ScheduleAppointment,
): number {
  return (
    compareText(left.scheduledDate, right.scheduledDate) ||
    compareText(left.startTime, right.startTime) ||
    compareText(left.id, right.id)
  );
}

// One list for the range from its cached weeks, as a single range read would return it.
export function mergeWeeks(
  chunks: ScheduleAppointment[][],
  { from, to }: DateRange,
): ScheduleAppointment[] {
  return chunks
    .flat()
    .filter(
      ({ scheduledDate }) =>
        scheduledDate >= from && (to === null || scheduledDate <= to),
    )
    .sort(compareAppointments);
}

// The days one read covers for these week starts (in order). Weeks between them that are
// already cached are read again: one read beats several.
export function getWeeksSpan(weeks: string[]): WeeksSpan {
  const firstWeek = weeks.at(0);
  const lastWeek = weeks.at(-1);
  if (firstWeek === undefined || lastWeek === undefined) {
    throw new RangeError("getWeeksSpan needs at least one week");
  }

  return { from: firstWeek, to: getWeekEnd(lastWeek) };
}

// Splits one span read into its weeks. A week with no appointments maps to an empty list, so
// the client caches it as read rather than missing. Keeps the read's order within each week.
export function bucketByWeek(
  appointments: ScheduleAppointment[],
  span: WeeksSpan,
): AppointmentWeeks {
  const dated = appointments.map((appointment) => ({
    appointment,
    week: getWeekStart(appointment.scheduledDate),
  }));
  return Object.fromEntries(
    weeksForRange(span).map((week) => [
      week,
      dated
        .filter((row) => row.week === week)
        .map((row) => row.appointment),
    ]),
  );
}

// A Sunday week start, or null for anything else.
function parseWeekStart(value: unknown): string | null {
  const date = typeof value === "string" ? parseDate(value) : null;
  return date !== null && getWeekStart(date) === date ? date : null;
}

// The span from one week start to another (both Sundays), or null when the input is malformed,
// backwards or longer than MAX_SPAN_WEEKS. Takes unknown: a server action's arguments are
// whatever the request carried.
export function parseWeeksSpan(
  firstWeek: unknown,
  lastWeek: unknown,
): WeeksSpan | null {
  const first = parseWeekStart(firstWeek);
  const last = parseWeekStart(lastWeek);
  if (first === null || last === null) return null;

  const weekCount =
    differenceInCalendarWeeks(toDay(last), toDay(first)) + 1;
  const isValidLength = weekCount >= 1 && weekCount <= MAX_SPAN_WEEKS;
  return isValidLength ? getWeeksSpan([first, last]) : null;
}
