// Relative imports: node --test runs this file without the @/ alias.
import type { Database } from "../../types/database.ts";
import { formatCents } from "../pricing/money.ts";
import { addDays, formatHoursMinutes, formatShortDate } from "./period.ts";

// Shapes a Cleaner's own paid Pay runs, as the My pay views return them, into what her My pay
// page shows: runs newest paid first (grouped by paid year when they span years), each with its
// labelled lines and Adjustments, and the hours of her last paid run.

type Views = Database["public"]["Views"];

export type MyPayRunRow = Views["pay_runs_employee_view"]["Row"];
export type MyPayLineRow = Views["pay_run_lines_employee_view"]["Row"];
export type MyPayAdjustmentRow = Views["pay_adjustments_employee_view"]["Row"];

export type MyPayLine = {
  id: string;
  clientName: string;
  dateLabel: string;
  hoursLabel: string;
  // The rate the line used, Job pay premium included.
  rateCents: number;
  amountCents: number;
};

export type MyPayAdjustment = {
  id: string;
  reason: string;
  // "Oct 6 · Smith residence" when the Adjustment points at one of the run's shifts.
  linkedLabel: string | null;
  amountLabel: string;
};

export type MyPaidRun = {
  id: string;
  periodLabel: string;
  isOffCycle: boolean;
  paidLabel: string;
  totalCents: number;
  minutes: number;
  lines: MyPayLine[];
  adjustments: MyPayAdjustment[];
};

export type MyPayYearGroup = {
  // Null when every run was paid in one year: no header then.
  yearLabel: string | null;
  runs: MyPaidRun[];
};

export type MyPay = {
  groups: MyPayYearGroup[];
  lastRun: { minutes: number; periodLabel: string } | null;
};

const DAYS_PER_PERIOD = 14;
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// U+2212, so a negative Adjustment reads as a true minus, not a hyphen.
const MINUS_SIGN = "−";

function getYear(day: string): string {
  return day.slice(0, 4);
}

// "Oct 20, 2026".
function formatLongDate(day: string): string {
  return `${formatShortDate(day)}, ${getYear(day)}`;
}

// "Tue, Oct 6". Days are calendar days, so the weekday is read in UTC.
function formatWeekdayDate(day: string): string {
  const weekday = WEEKDAY_NAMES[new Date(`${day}T00:00:00Z`).getUTCDay()];
  return `${weekday}, ${formatShortDate(day)}`;
}

function formatSignedCents(cents: number): string {
  const sign = cents < 0 ? MINUS_SIGN : "+";
  return `${sign}${formatCents(Math.abs(cents))}`;
}

// "Oct 5–18", "Oct 19 – Nov 1", "Dec 28, 2025 – Jan 10, 2026". The dash is spaced only when both
// sides carry a month.
export function formatPayPeriodRange(periodStart: string): string {
  const periodEnd = addDays(periodStart, DAYS_PER_PERIOD - 1);

  let label = `${formatLongDate(periodStart)} – ${formatLongDate(periodEnd)}`;
  if (getYear(periodStart) === getYear(periodEnd)) {
    label = `${formatShortDate(periodStart)} – ${formatShortDate(periodEnd)}`;
  }
  if (periodStart.slice(0, 7) === periodEnd.slice(0, 7)) {
    label = `${formatShortDate(periodStart)}–${Number(periodEnd.slice(8))}`;
  }
  return label;
}

// Newest paid first; a tie goes to the newest period, then regular before off-cycle.
function compareRuns(left: MyPayRunRow, right: MyPayRunRow): number {
  return (
    right.paid_on.localeCompare(left.paid_on) ||
    right.period_start.localeCompare(left.period_start) ||
    Number(left.kind === "off_cycle") - Number(right.kind === "off_cycle")
  );
}

function toLine(row: MyPayLineRow): MyPayLine {
  return {
    id: row.id,
    clientName: row.client_name,
    dateLabel: formatWeekdayDate(row.scheduled_date),
    hoursLabel: `${formatHoursMinutes(row.minutes)} h`,
    rateCents: row.rate_cents,
    amountCents: row.amount_cents,
  };
}

function toAdjustment(row: MyPayAdjustmentRow): MyPayAdjustment {
  const linkedLabel =
    row.linked_scheduled_date === null
      ? null
      : [formatShortDate(row.linked_scheduled_date), row.linked_client_name]
          .filter(Boolean)
          .join(" · ");

  return {
    id: row.id,
    reason: row.reason,
    linkedLabel,
    amountLabel: formatSignedCents(row.amount_cents),
  };
}

function toRun(
  row: MyPayRunRow,
  lines: MyPayLineRow[],
  adjustments: MyPayAdjustmentRow[],
): MyPaidRun {
  const runLines = lines
    .filter((line) => line.pay_run_id === row.id)
    .sort(
      (left, right) =>
        left.scheduled_date.localeCompare(right.scheduled_date) ||
        left.id.localeCompare(right.id),
    );
  const runAdjustments = adjustments
    .filter((adjustment) => adjustment.pay_run_id === row.id)
    .sort((left, right) => left.created_at.localeCompare(right.created_at));

  return {
    id: row.id,
    periodLabel: formatPayPeriodRange(row.period_start),
    isOffCycle: row.kind === "off_cycle",
    paidLabel: `Paid ${formatLongDate(row.paid_on)} by ${row.payout_method}`,
    totalCents: row.total_cents,
    minutes: runLines.reduce((total, line) => total + line.minutes, 0),
    lines: runLines.map(toLine),
    adjustments: runAdjustments.map(toAdjustment),
  };
}

function groupByPaidYear(rows: MyPayRunRow[], runs: MyPaidRun[]): MyPayYearGroup[] {
  const years = [...new Set(rows.map((row) => getYear(row.paid_on)))];
  if (years.length <= 1) {
    return runs.length === 0 ? [] : [{ yearLabel: null, runs }];
  }

  // rows and runs share one order, so a run's year is its row's.
  return years.map((year) => ({
    yearLabel: year,
    runs: runs.filter((_, index) => getYear(rows[index].paid_on) === year),
  }));
}

export function buildMyPay(input: {
  runs: MyPayRunRow[];
  lines: MyPayLineRow[];
  adjustments: MyPayAdjustmentRow[];
}): MyPay {
  const rows = [...input.runs].sort(compareRuns);
  const runs = rows.map((row) => toRun(row, input.lines, input.adjustments));
  const [newest] = runs;

  return {
    groups: groupByPaidYear(rows, runs),
    lastRun: newest
      ? { minutes: newest.minutes, periodLabel: newest.periodLabel }
      : null,
  };
}
