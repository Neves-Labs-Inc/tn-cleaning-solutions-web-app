// Pure date generation for a recurring Series: "every N days / weeks / months".
// Dates are yyyy-MM-dd strings; arithmetic runs in UTC so no visit shifts a day.

export type IntervalUnit = "day" | "week" | "month";

export type Interval = { unit: IntervalUnit; count: number };

export const INTERVAL_CAPS: Record<IntervalUnit, number> = {
  day: 365,
  week: 52,
  month: 24,
};

const MAX_DATES = 365;
const DEFAULT_HORIZON_MONTHS = 6;
const DAYS_PER_WEEK = 7;

const SINGLE_LABELS: Record<IntervalUnit, string> = {
  day: "Daily",
  week: "Weekly",
  month: "Monthly",
};

function parseDate(dateString: string): Date {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

// Clamps to the target month's last day, so Jan 31 + 1 month is Feb 28/29.
function addMonths(date: Date, amount: number): Date {
  const firstOfTarget = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1),
  );
  const lastDayOfTarget = new Date(
    Date.UTC(
      firstOfTarget.getUTCFullYear(),
      firstOfTarget.getUTCMonth() + 1,
      0,
    ),
  ).getUTCDate();
  firstOfTarget.setUTCDate(Math.min(date.getUTCDate(), lastDayOfTarget));
  return firstOfTarget;
}

// Always offset from the anchor (never the previous date) so month-end clamps don't drift.
function occurrenceAt(anchor: Date, interval: Interval, index: number): Date {
  const steps = index * interval.count;
  let date: Date;
  if (interval.unit === "month") {
    date = addMonths(anchor, steps);
  } else if (interval.unit === "week") {
    date = addDays(anchor, steps * DAYS_PER_WEEK);
  } else {
    date = addDays(anchor, steps);
  }
  return date;
}

type RecurrenceInput = {
  anchorDate: string;
  interval: Interval;
  endDate: string | null;
  maxOccurrences: number | null;
};

// Dates from the firstIndex-th occurrence on; max occurrences and the 365 cap count only returned dates.
function generateDates(input: RecurrenceInput, firstIndex: number): string[] {
  const { anchorDate, interval, endDate, maxOccurrences } = input;
  const anchor = parseDate(anchorDate);
  const isOpenEnded = endDate === null && maxOccurrences === null;
  const lastDate = isOpenEnded
    ? formatDate(addMonths(anchor, DEFAULT_HORIZON_MONTHS))
    : endDate;
  const limit = Math.min(maxOccurrences ?? MAX_DATES, MAX_DATES);

  const dates: string[] = [];
  for (let index = firstIndex; dates.length < limit; index++) {
    const date = formatDate(occurrenceAt(anchor, interval, index));
    if (lastDate !== null && date > lastDate) break;
    dates.push(date);
  }
  return dates;
}

export function recurrenceDates(input: RecurrenceInput): string[] {
  return generateDates(input, 0);
}

// The dates after the anchor, for a "This and following" edit where the anchor visit already exists.
export function followingRecurrenceDates(input: RecurrenceInput): string[] {
  return generateDates(input, 1);
}

export function intervalLabel(interval: Interval): string {
  return interval.count === 1
    ? SINGLE_LABELS[interval.unit]
    : `Every ${interval.count} ${interval.unit}s`;
}
