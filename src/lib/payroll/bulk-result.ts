// Relative import: node --test runs this file without the @/ alias.
import {
  getPayrollErrorMessage,
  isPayrollErrorCode,
  UNKNOWN_PAYROLL_MESSAGE,
} from "./errors.ts";
import { describeClockProblems, type BlockerCounts } from "./period-view.ts";

// The one-line result of a bulk Finalize or Mark paid:
// "<Done verb> N · M blocked: <Name>: <reason>, …". Pure.

// A blocked run carries its counts per kind; any other refusal carries a readable message.
export type BulkRefusal = { blockers: BlockerCounts } | { message: string };

export type BulkOutcome = {
  cleanerName: string;
  refusal: BulkRefusal | null;
};

// One row of finalize_pay_runs or mark_pay_runs_paid: code 'ok', or a payroll_error code with
// the blocked counts in detail.
export type BulkResultRow = {
  code: string;
  message: string | null;
  detail: unknown;
};

const OK_CODE = "ok";
const NO_RATE_REASON = "no Pay rate";

function readCount(detail: unknown, key: string): number {
  const value =
    typeof detail === "object" && detail !== null
      ? (detail as Record<string, unknown>)[key]
      : undefined;
  return typeof value === "number" ? value : 0;
}

function toRefusal(row: BulkResultRow): BulkRefusal {
  let refusal: BulkRefusal = { message: UNKNOWN_PAYROLL_MESSAGE };
  if (row.code === "blocked") {
    refusal = {
      blockers: {
        openShifts: readCount(row.detail, "open_shift"),
        missingClocks: readCount(row.detail, "missing_clock"),
        noRateLines: readCount(row.detail, "no_rate"),
      },
    };
  } else if (isPayrollErrorCode(row.code)) {
    refusal = { message: getPayrollErrorMessage(row.code) };
  }
  return refusal;
}

export function toBulkOutcome(
  row: BulkResultRow,
  cleanerName: string,
): BulkOutcome {
  return {
    cleanerName,
    refusal: row.code === OK_CODE ? null : toRefusal(row),
  };
}

// "1 Open shift and 1 Missing clock", "no Pay rate", or both joined with "and".
export function describeRefusal(refusal: BulkRefusal): string {
  if ("message" in refusal) return refusal.message;

  const clockProblems = describeClockProblems(refusal.blockers);
  const noRate = refusal.blockers.noRateLines > 0 ? NO_RATE_REASON : "";
  return [clockProblems, noRate].filter((part) => part !== "").join(" and ");
}

function describeBulkResult(doneText: string, outcomes: BulkOutcome[]): string {
  const refused = outcomes.flatMap((outcome) =>
    outcome.refusal === null
      ? []
      : [`${outcome.cleanerName}: ${describeRefusal(outcome.refusal)}`],
  );
  return refused.length === 0
    ? doneText
    : `${doneText} · ${refused.length} blocked: ${refused.join(", ")}`;
}

function countDone(outcomes: BulkOutcome[]): number {
  return outcomes.filter((outcome) => outcome.refusal === null).length;
}

// "Finalized 2 · 2 blocked: Carla: 1 Missing clock, Maria: 1 Open shift"
export function describeFinalizeResult(outcomes: BulkOutcome[]): string {
  return describeBulkResult(`Finalized ${countDone(outcomes)}`, outcomes);
}

// "Marked 3 paid · 1 blocked: Ana: 1 Missing clock"
export function describeMarkPaidResult(outcomes: BulkOutcome[]): string {
  return describeBulkResult(`Marked ${countDone(outcomes)} paid`, outcomes);
}
