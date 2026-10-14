// Relative imports: node --test runs this file without the @/ alias.
import { isCalendarDate } from "../dates/calendar.ts";
import { getBusinessDate } from "../schedule/business-time.ts";

// Pay period math, mirrored from the SQL in the Payroll schema migration (payroll_settings(),
// pay_period_start(), pay_period_has_ended()). Days are yyyy-MM-dd calendar days computed in UTC,
// so the process zone and DST never shift one; only "today" comes from Toronto business time.

// Mirrors payroll_settings(); tests/payroll/period.test.ts fails if they drift. Changing either
// is a deploy.
export const PAY_PERIOD_ANCHOR = "2026-10-05";
export const PAYROLL_START = "2026-10-05";

export type PayPeriod = { start: string; end: string };

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_PERIOD = 14;
const MINUTES_PER_HOUR = 60;
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

function toUtcMillis(day: string): number {
  const [year, month, date] = day.split("-").map(Number);
  return Date.UTC(year, month - 1, date);
}

export function addDays(day: string, days: number): string {
  return new Date(toUtcMillis(day) + days * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

// Day must be a well-formed calendar day.
export function getPayPeriod(day: string): PayPeriod {
  const daysSinceAnchor = Math.round(
    (toUtcMillis(day) - toUtcMillis(PAY_PERIOD_ANCHOR)) / MS_PER_DAY,
  );
  // floor, like the SQL, so days before the anchor round down too.
  const index = Math.floor(daysSinceAnchor / DAYS_PER_PERIOD);
  const start = addDays(PAY_PERIOD_ANCHOR, index * DAYS_PER_PERIOD);
  return { start, end: addDays(start, DAYS_PER_PERIOD - 1) };
}

// True once the Toronto Business date is after the period's last day.
export function isPeriodEnded(period: PayPeriod, now: Date): boolean {
  return getBusinessDate(now) > period.end;
}

// From the Payroll start through the running period, newest first; empty before the start.
export function listPayPeriods(now: Date): PayPeriod[] {
  const running = getPayPeriod(getBusinessDate(now));
  const count =
    Math.floor(
      (toUtcMillis(running.start) - toUtcMillis(PAYROLL_START)) /
        (DAYS_PER_PERIOD * MS_PER_DAY),
    ) + 1;
  return Array.from({ length: Math.max(count, 0) }, (_, back) =>
    getPayPeriod(addDays(running.start, -back * DAYS_PER_PERIOD)),
  );
}

// Finalize opens the Monday after the period ends.
export function finalizeOpensOn(period: PayPeriod): string {
  return addDays(period.end, 1);
}

// The period a `[periodStart]` route param names: a real period start on or after the Payroll
// start, else null.
export function parsePeriodParam(
  value: string | string[] | undefined,
): PayPeriod | null {
  const day = Array.isArray(value) ? value[0] : value;
  if (day === undefined || !isCalendarDate(day)) return null;

  const period = getPayPeriod(day);
  return period.start === day && day >= PAYROLL_START ? period : null;
}

function formatMonthDay(day: string): { month: string; date: number } {
  const [, month, date] = day.split("-").map(Number);
  return { month: MONTH_NAMES[month - 1], date };
}

// "Oct 5", for line and straggler labels.
export function formatShortDate(day: string): string {
  const { month, date } = formatMonthDay(day);
  return `${month} ${date}`;
}

// "Oct 5–18" or "Oct 19–Nov 1".
export function formatPeriodLabel(period: PayPeriod): string {
  const start = formatMonthDay(period.start);
  const end = formatMonthDay(period.end);
  const endLabel =
    start.month === end.month ? `${end.date}` : `${end.month} ${end.date}`;
  return `${start.month} ${start.date}–${endLabel}`;
}

// 425 -> "7:05".
export function formatHoursMinutes(minutes: number): string {
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const rest = minutes % MINUTES_PER_HOUR;
  return `${hours}:${String(rest).padStart(2, "0")}`;
}

// 425 -> "7.08".
export function formatDecimalHours(minutes: number): string {
  return (minutes / MINUTES_PER_HOUR).toFixed(2);
}
