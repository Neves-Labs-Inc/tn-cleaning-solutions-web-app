// Relative imports: node --test runs this file without the @/ alias.
import { formatCents } from "../pricing/money.ts";
import { formatBusinessTime } from "../schedule/business-time.ts";
import {
  formatHoursMinutes,
  formatShortDate,
  type PayPeriod,
} from "./period.ts";
import type { PeriodRow } from "./period-summary.ts";
import type {
  PeriodRun,
  PeriodStatus,
  PeriodView,
  ProblemSession,
} from "./period-view.ts";

// Copy the Payroll screens show, built from the view module's shapes. Pure.

export type RunStateTone = "muted" | "destructive" | "warning" | "paid";

// The one state line a run's ledger action area shows.
export type RunStateLine = { tone: RunStateTone; text: string };

// Shown when a session's appointment has no Job or client name.
export const NO_JOB_LABEL = "No Job";
export const NO_CLIENT_LABEL = "No client";

// U+2212, so a deduction reads as a minus rather than a hyphen.
const MINUS_SIGN = "−";
const MISSING_CLOCK_NOTE =
  "Never clocked in. Enter her clocks, or take her off the crew if she didn't work";
// Finalize always opens on the Monday after the period ends.
const FINALIZE_WEEKDAY = "Mon";
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

// 2200 -> "+$22.00", -1250 -> "−$12.50", 0 -> "$0.00".
export function formatSignedCents(cents: number): string {
  let sign = "";
  if (cents > 0) {
    sign = "+";
  } else if (cents < 0) {
    sign = MINUS_SIGN;
  }
  return `${sign}${formatCents(Math.abs(cents))}`;
}

function getYear(day: string): string {
  return day.slice(0, 4);
}

// "Mon Oct 12", for ledger and straggler dates. In UTC, so the process zone never shifts it.
export function formatDayLabel(day: string): string {
  const weekday = WEEKDAY_NAMES[new Date(`${day}T00:00:00Z`).getUTCDay()];
  return `${weekday} ${formatShortDate(day)}`;
}

// "Oct 20, 2026".
export function formatLongDate(day: string): string {
  return `${formatShortDate(day)}, ${getYear(day)}`;
}

// "Oct 5 – Oct 18, 2026", or "Dec 28, 2026 – Jan 10, 2027" across a year.
export function formatPeriodRange(period: PayPeriod): string {
  const start =
    getYear(period.start) === getYear(period.end)
      ? formatShortDate(period.start)
      : formatLongDate(period.start);
  return `${start} – ${formatLongDate(period.end)}`;
}

// "Mon Oct 19".
export function formatFinalizeOpens(day: string): string {
  return `${FINALIZE_WEEKDAY} ${formatShortDate(day)}`;
}

// "Oct 5 – Oct 18, 2026 · 4 Cleaners · 61:30 clocked".
export function describePeriodHeader(view: PeriodView): string {
  const cleanerCount = new Set(view.runs.map((item) => item.cleaner.id)).size;
  return [
    formatPeriodRange(view.period),
    pluralize(cleanerCount, "Cleaner"),
    `${formatHoursMinutes(view.totals.minutes)} clocked`,
  ].join(" · ");
}

export function describeProblemSession(
  problem: Pick<ProblemSession, "kind" | "clockedInAt">,
): string {
  if (problem.kind === "missing_clock") return MISSING_CLOCK_NOTE;

  const clockIn =
    problem.clockedInAt === null
      ? ""
      : ` ${formatBusinessTime(new Date(problem.clockedInAt))}`;
  return `Clocked in${clockIn}, no clock-out`;
}

// "Paid Oct 20, 2026 by e-Transfer".
export function describePaidRun(
  run: Pick<PeriodRun, "paidOn" | "payoutMethod">,
): string {
  const parts = [
    "Paid",
    run.paidOn === null ? null : formatLongDate(run.paidOn),
    run.payoutMethod === null ? null : `by ${run.payoutMethod}`,
  ];
  return parts.filter((part) => part !== null).join(" ");
}

function countOddDurations(run: PeriodRun): number {
  return [...run.lines, ...run.noRateLines].filter(
    (line) => line.isOddDuration,
  ).length;
}

function getDraftStateLine(
  run: PeriodRun,
  status: PeriodStatus,
): RunStateLine {
  const oddCount = countOddDurations(run);

  const opensOn = status.finalizeOpensOn;

  // A blocker leads even while the period runs, so the line never contradicts the Blocked pill.
  let line: RunStateLine = { tone: "muted", text: "Ready to finalize" };
  if (opensOn !== null && run.blockedReason !== null) {
    line = {
      tone: "destructive",
      text: `${run.blockedReason} from ${formatFinalizeOpens(opensOn)}`,
    };
  } else if (opensOn !== null) {
    line = {
      tone: "muted",
      text: `Can finalize from ${formatFinalizeOpens(opensOn)}`,
    };
  } else if (run.blockedReason !== null) {
    line = { tone: "destructive", text: run.blockedReason };
  } else if (oddCount > 0) {
    line = {
      tone: "warning",
      text: `${pluralize(oddCount, "Odd duration warning")}, finalizing is allowed`,
    };
  }
  return line;
}

export function getRunStateLine(
  run: PeriodRun,
  status: PeriodStatus,
): RunStateLine {
  let line: RunStateLine = { tone: "paid", text: describePaidRun(run) };
  if (run.status === "draft") {
    line = getDraftStateLine(run, status);
  } else if (run.status === "finalized" && run.blockedReason !== null) {
    line = { tone: "destructive", text: run.blockedReason };
  } else if (run.status === "finalized") {
    line = { tone: "muted", text: "Finalized · not paid yet" };
  }
  return line;
}

// A running period says when it can be finalized; an ended one keeps its Cleaner caption.
export function formatPeriodRowCaption(row: PeriodRow): string {
  const opensOn = row.status.finalizeOpensOn;
  return opensOn === null
    ? row.caption
    : `Running · finalize from ${formatFinalizeOpens(opensOn)}`;
}
