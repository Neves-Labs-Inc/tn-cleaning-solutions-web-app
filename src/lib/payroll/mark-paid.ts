// Relative imports: node --test runs this file without the @/ alias.
import { isCalendarDate } from "../dates/calendar.ts";
import { formatCents, parseDollarsToCents } from "../pricing/money.ts";
import {
  describeMarkPaidResult,
  toBulkOutcome,
  type BulkResultRow,
} from "./bulk-result.ts";
import type { SplitPart } from "./action-input.ts";
import { getPayrollErrorMessage, type PayrollErrorCode } from "./errors.ts";
import { pluralize } from "./format.ts";
import type { PayoutPart } from "./payroll-data.ts";
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

// ---- Split payout: the part rows' checks and copy -------------------------------------------

// One part row as typed: the amount is dollars text until it is read.
export type PartDraft = { method: string; amount: string };

export type PartRowError = { method: string | null; amount: string | null };

export type SplitSumLine = { text: string; tone: "muted" | "destructive" };

const CENTS_PER_DOLLAR = 100;
const MIN_SPLIT_PARTS = 2;
const AMOUNT_ABOVE_ZERO_MESSAGE = "Enter an amount above $0.00.";
const AMOUNT_SHAPE_MESSAGE = "Enter an amount like 200.00.";
const TWO_DECIMALS = /^\d*(?:\.\d{0,2})?$/;
const NEGATIVE_AMOUNT = /^\s*-/;
const SPLIT_REFUSAL_CODES: PayrollErrorCode[] = [
  "split_too_few_parts",
  "split_part_not_positive",
  "split_duplicate_method",
  "split_sum_mismatch",
];

// Dollars text as cents; null for blank, a sign, a third decimal or anything that isn't a plain
// amount. Zero reads as 0 (the row message says why it fails).
export function parsePartAmount(text: string): number | null {
  const trimmed = text.trim();
  if (!TWO_DECIMALS.test(trimmed)) return null;

  const parsed = parseDollarsToCents(trimmed);
  return "cents" in parsed ? parsed.cents : null;
}

function methodKey(method: string): string {
  return method.trim().toLowerCase();
}

function partAmountError(amount: string): string | null {
  const cents = parsePartAmount(amount);

  let error: string | null = null;
  if (amount.trim() === "") {
    error = null;
  } else if (NEGATIVE_AMOUNT.test(amount) || cents === 0) {
    error = AMOUNT_ABOVE_ZERO_MESSAGE;
  } else if (cents === null) {
    error = AMOUNT_SHAPE_MESSAGE;
  }
  return error;
}

// Each row's own messages, shown at once like methodError. A blank amount has none: the
// "left to assign" line carries it.
export function partRowErrors(parts: PartDraft[]): PartRowError[] {
  return parts.map((part, index) => {
    const firstSame = parts.findIndex(
      (other) => methodKey(other.method) === methodKey(part.method),
    );

    let method: string | null = null;
    if (part.method.trim() === "") {
      method = `Enter a method for part ${index + 1}.`;
    } else if (firstSame < index) {
      method = `Part ${index + 1} repeats part ${firstSame + 1}'s method.`;
    }
    return { method, amount: partAmountError(part.amount) };
  });
}

function sumPartCents(parts: PartDraft[]): number {
  return parts.reduce(
    (sum, part) => sum + (parsePartAmount(part.amount) ?? 0),
    0,
  );
}

// The live line under the rows: "$340.00 left to assign", "$60.00 over", "$0.00 left to assign".
export function splitSumLine(
  totalCents: number,
  partCents: number,
): SplitSumLine {
  const left = totalCents - partCents;
  return left < 0
    ? { text: `${formatCents(-left)} over`, tone: "destructive" }
    : { text: `${formatCents(left)} left to assign`, tone: "muted" };
}

// The line for these drafts against the run's total.
export function splitSumLineFor(
  parts: PartDraft[],
  totalCents: number,
): SplitSumLine {
  return splitSumLine(totalCents, sumPartCents(parts));
}

// Confirm is enabled only when the SQL would accept the parts: two or more, each method named and
// distinct, each amount above $0, adding up to the run's total exactly.
export function canConfirmSplit(
  parts: PartDraft[],
  totalCents: number,
): boolean {
  const hasNoRowError = partRowErrors(parts).every(
    (error) => error.method === null && error.amount === null,
  );
  const hasEveryAmount = parts.every(
    (part) => (parsePartAmount(part.amount) ?? 0) > 0,
  );
  return (
    parts.length >= MIN_SPLIT_PARTS &&
    hasNoRowError &&
    hasEveryAmount &&
    sumPartCents(parts) === totalCents
  );
}

// What the server action takes: trimmed methods, amounts in cents. Call after canConfirmSplit.
export function toSplitParts(parts: PartDraft[]): SplitPart[] {
  return parts.map((part) => ({
    method: part.method.trim(),
    amountCents: parsePartAmount(part.amount) ?? 0,
  }));
}

// A stored split as editable rows, amounts as "340.00".
export function partsToDrafts(parts: PayoutPart[]): PartDraft[] {
  return parts.map((part) => ({
    method: part.method,
    amount: (part.amount_cents / CENTS_PER_DOLLAR).toFixed(2),
  }));
}

// A split refusal comes back as its message only; these four belong in the parts area, anything
// else in the form Alert (null).
export function splitRefusalMessage(serverMessage: string): string | null {
  const isSplitRefusal = SPLIT_REFUSAL_CODES.some(
    (code) => getPayrollErrorMessage(code) === serverMessage,
  );
  return isSplitRefusal ? serverMessage : null;
}
