// Relative imports: node --test runs this file without the @/ alias.
import { isCalendarDate } from "../dates/calendar.ts";
import { formatCents } from "../pricing/money.ts";
import {
  describeMarkPaidResult,
  toBulkOutcome,
  type BulkResultRow,
} from "./bulk-result.ts";
import { getPayrollErrorMessage } from "./errors.ts";
import { pluralize } from "./format.ts";
import { formatShortDate } from "./period.ts";
import { getFirstName } from "./period-actions.ts";
import type { PeriodRun } from "./period-view.ts";

// The Mark paid and Edit payout dialogs' checks and copy. Pure. mark_pay_runs_paid and
// update_pay_run_payout enforce the same rules (check_payout); these say so before the submit.

// One mark_pay_runs_paid row, by Pay run.
export type MarkPaidRow = BulkResultRow & { payRunId: string };

const OK_CODE = "ok";
const PAID_ON_REQUIRED_MESSAGE = "Enter the paid date.";
const PAID_ON_FUTURE_MESSAGE = "Paid date can't be in the future.";

function paidOnBeforePeriodEndMessage(periodEnd: string): string {
  return `Paid date can't be before the period ends (${formatShortDate(periodEnd)}).`;
}

// Dates are yyyy-MM-dd, so string order is calendar order.
export function paidOnError(
  paidOn: string,
  periodEnd: string,
  businessDate: string,
): string | null {
  let error: string | null = null;
  if (!isCalendarDate(paidOn)) {
    error = PAID_ON_REQUIRED_MESSAGE;
  } else if (paidOn > businessDate) {
    error = PAID_ON_FUTURE_MESSAGE;
  } else if (paidOn < periodEnd) {
    error = paidOnBeforePeriodEndMessage(periodEnd);
  }
  return error;
}

// The SQL's paid-date refusals, in the dialog's words; null for any other code.
function toPaidOnMessage(code: string, periodEnd: string): string | null {
  const messages: Record<string, string> = {
    paid_on_required: PAID_ON_REQUIRED_MESSAGE,
    paid_on_future: PAID_ON_FUTURE_MESSAGE,
    paid_on_before_period_end: paidOnBeforePeriodEndMessage(periodEnd),
  };
  return messages[code] ?? null;
}

const PAID_ON_CODES = [
  "paid_on_required",
  "paid_on_future",
  "paid_on_before_period_end",
] as const;

// Edit payout gets a refusal as its message only (PayrollWriter's Result); a paid-date one goes
// under Paid on in the dialog's words, anything else stays in the form Alert (null).
export function paidOnFieldError(
  serverMessage: string,
  periodEnd: string,
): string | null {
  const code = PAID_ON_CODES.find(
    (item) => getPayrollErrorMessage(item) === serverMessage,
  );
  return code === undefined ? null : toPaidOnMessage(code, periodEnd);
}

// Shown at once under a blank method, so it's clear why Confirm is disabled.
export function methodError(method: string, firstName: string): string | null {
  return method.trim() === "" ? methodRequiredMessage(firstName) : null;
}

function methodRequiredMessage(firstName: string): string {
  return `Enter how you paid ${firstName}.`;
}

// "Mark 3 paid · $1,624.00", or "Mark paid · $812.50" for one run.
export function markPaidSubmitLabel(count: number, totalCents: number): string {
  const verb = count === 1 ? "Mark paid" : `Mark ${count} paid`;
  return `${verb} · ${formatCents(totalCents)}`;
}

export type PayableRuns = { ready: PeriodRun[]; blocked: PeriodRun[] };

// The finalized runs among these: ready to mark paid, or blocked by what the page already knows
// (the SQL may still refuse a ready one that gained a blocker since). Drafts and paid runs drop out.
export function payableRuns(runs: PeriodRun[]): PayableRuns {
  const finalized = runs.filter((run) => run.status === "finalized");
  return {
    ready: finalized.filter((run) => run.blockedReason === null),
    blocked: finalized.filter((run) => run.blockedReason !== null),
  };
}

export type BlockerLink = { label: string; href: string };

// Where to fix what blocks a run: its first clock problem on Time Sheets, else the Cleaner's
// Pay rate. null when nothing blocks it.
export function getBlockerLink(run: PeriodRun): BlockerLink | null {
  const [problem] = run.problemSessions;
  const [noRateLine] = run.noRateLines;

  let link: BlockerLink | null = null;
  if (problem !== undefined) {
    link = { label: "Fix on Time Sheets", href: problem.href };
  } else if (noRateLine !== undefined) {
    link = { label: "Add a Pay rate", href: noRateLine.href };
  }
  return link;
}

// The dialog's description, counting what Confirm will pay apart from what's skipped:
// "2 runs · 1 skipped · Pay period Oct 5–18", or "Ana Souza · Pay period Oct 5–18 · Off-cycle"
// for one run.
export function describeMarkPaidTarget(
  runs: PeriodRun[],
  periodLabel: string,
): string {
  const period = `Pay period ${periodLabel}`;
  const [only] = runs;
  const { ready, blocked } = payableRuns(runs);

  let parts: (string | null)[] = [
    ready.length > 0 ? pluralize(ready.length, "run") : null,
    blocked.length > 0 ? `${blocked.length} skipped` : null,
    period,
  ];
  if (runs.length === 1) {
    parts = [
      only.cleaner.name,
      period,
      only.kind === "off_cycle" ? "Off-cycle" : null,
    ];
  }
  return parts.filter((part) => part !== null).join(" · ");
}

// "Marked Ana paid" for one run, "Marked 3 paid" for several.
export function markPaidSuccessText(paidRuns: PeriodRun[]): string {
  const [only] = paidRuns;
  return paidRuns.length === 1
    ? `Marked ${getFirstName(only.cleaner.name)} paid`
    : `Marked ${paidRuns.length} paid`;
}

export type MarkPaidFeedback = {
  paidRuns: PeriodRun[];
  // "Marked 3 paid · 1 blocked: Ana: 1 Missing clock", for the toast or the form Alert.
  text: string;
  paidOnError: string | null;
  // By Pay run id.
  methodErrors: Record<string, string>;
  // A refusal no field can show (blocked, not_finalized…): the form Alert carries the text.
  hasUnplacedRefusal: boolean;
};

// Reads a mark_pay_runs_paid result against the runs that were submitted.
export function readMarkPaidRows(
  rows: MarkPaidRow[],
  runs: PeriodRun[],
  periodEnd: string,
): MarkPaidFeedback {
  const runsById = new Map(runs.map((run) => [run.runId, run]));
  const firstNameOf = (row: MarkPaidRow): string => {
    const run = runsById.get(row.payRunId);
    return run === undefined ? row.payRunId : getFirstName(run.cleaner.name);
  };
  const refused = rows.filter((row) => row.code !== OK_CODE);
  const paidOnMessages = refused.flatMap((row) => {
    const message = toPaidOnMessage(row.code, periodEnd);
    return message === null ? [] : [message];
  });
  const methodRefusals = refused.filter(
    (row) => row.code === "method_required",
  );

  return {
    paidRuns: rows.flatMap((row) => {
      const run = runsById.get(row.payRunId);
      return row.code === OK_CODE && run !== undefined ? [run] : [];
    }),
    text: describeMarkPaidResult(
      rows.map((row) => toBulkOutcome(row, firstNameOf(row))),
    ),
    paidOnError: paidOnMessages[0] ?? null,
    methodErrors: Object.fromEntries(
      methodRefusals.map((row) => [
        row.payRunId,
        methodRequiredMessage(firstNameOf(row)),
      ]),
    ),
    hasUnplacedRefusal:
      refused.length > paidOnMessages.length + methodRefusals.length,
  };
}
