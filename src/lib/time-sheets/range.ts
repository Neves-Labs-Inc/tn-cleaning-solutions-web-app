// Relative import: node --test runs this file without the @/ alias.
import { getBusinessDate } from "../schedule/business-time.ts";

// Dates here are calendar days (yyyy-MM-dd) with no time zone; the arithmetic runs in UTC so the
// process zone and DST never shift a day. Only "today" comes from Eastern business time.

export type DayRange = { from: string; to: string };

export type WeekRange = DayRange & {
  isWeek: boolean;
  isThisWeek: boolean;
  label: string;
  prev: DayRange;
  next: DayRange | null;
};

export type WeekRangeParams = {
  from?: string | string[];
  to?: string | string[];
};

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_WEEK = 7;
const MONDAY = 1;
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function firstParam(param: string | string[] | undefined): string | undefined {
  return Array.isArray(param) ? param[0] : param;
}

// Only for days already known to be well-formed: this module's own output or a checked param.
function toUtcDate(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date));
}

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// False for malformed strings and for days that don't exist ("2026-02-30").
function isRealDay(value: string | undefined): value is string {
  if (value === undefined || !DAY_PATTERN.test(value)) return false;

  return formatDay(toUtcDate(value)) === value;
}

function addDays(day: string, days: number): string {
  return formatDay(new Date(toUtcDate(day).getTime() + days * MS_PER_DAY));
}

function daysBetween(from: string, to: string): number {
  const elapsed = toUtcDate(to).getTime() - toUtcDate(from).getTime();
  return Math.round(elapsed / MS_PER_DAY);
}

function weekContaining(day: string): DayRange {
  const weekday = toUtcDate(day).getUTCDay();
  const daysSinceMonday = (weekday - MONDAY + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  const monday = addDays(day, -daysSinceMonday);
  return { from: monday, to: addDays(monday, DAYS_PER_WEEK - 1) };
}

// "Oct 5 – 11, 2026", "Sep 28 – Oct 4, 2026" or "Dec 28, 2026 – Jan 3, 2027".
function formatRangeLabel(from: string, to: string): string {
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [toYear, toMonth, toDay] = to.split("-").map(Number);
  const fromMonthName = MONTH_NAMES[fromMonth - 1];
  const toMonthName = MONTH_NAMES[toMonth - 1];

  let label = `${fromMonthName} ${fromDay}, ${fromYear} – ${toMonthName} ${toDay}, ${toYear}`;
  if (fromYear === toYear && fromMonth === toMonth) {
    label = `${fromMonthName} ${fromDay} – ${toDay}, ${toYear}`;
  } else if (fromYear === toYear) {
    label = `${fromMonthName} ${fromDay} – ${toMonthName} ${toDay}, ${toYear}`;
  }
  return label;
}

function requestedRange(params: WeekRangeParams, today: string): DayRange | null {
  const from = firstParam(params.from);
  const to = firstParam(params.to);
  if (!isRealDay(from) || !isRealDay(to)) return null;

  // Both are yyyy-MM-dd, so string order is date order.
  return from <= to && from <= today ? { from, to } : null;
}

// The admin Time sheet's range from `from`/`to` search params. An invalid range, or one starting
// after today, falls back to the current Monday–Sunday week. A range may end after today.
export function resolveWeekRange(params: WeekRangeParams, now: Date): WeekRange {
  const today = getBusinessDate(now);
  const thisWeek = weekContaining(today);
  const { from, to } = requestedRange(params, today) ?? thisWeek;

  const length = daysBetween(from, to) + 1;
  const next = { from: addDays(from, length), to: addDays(to, length) };
  const isMonday = toUtcDate(from).getUTCDay() === MONDAY;

  return {
    from,
    to,
    isWeek: isMonday && length === DAYS_PER_WEEK,
    isThisWeek: from === thisWeek.from && to === thisWeek.to,
    label: formatRangeLabel(from, to),
    prev: { from: addDays(from, -length), to: addDays(to, -length) },
    next: next.from <= today ? next : null,
  };
}
