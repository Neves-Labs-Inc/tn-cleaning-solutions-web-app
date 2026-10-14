// Mirrors the CASE block of payroll_error() in the newest migration that defines it
// (supabase/migrations/20261014150000_payroll_mark_paid.sql); tests/payroll/errors.test.ts fails
// when the two drift.
export const PAYROLL_ERROR_CODES = [
  "not_admin",
  "period_not_ended",
  "before_payroll_start",
  "nothing_to_finalize",
  "blocked",
  "run_not_found",
  "not_finalized",
  "has_later_run",
  "run_paid",
  "amount_required",
  "reason_required",
  "appointment_not_on_run",
  "adjustment_not_found",
  "already_in_period",
  "run_not_empty",
  "no_stragglers",
  "draft_exists",
  "method_required",
  "paid_on_required",
  "paid_on_future",
  "paid_on_before_period_end",
  "not_paid",
] as const;

export type PayrollErrorCode = (typeof PAYROLL_ERROR_CODES)[number];

// code is null when the error isn't a payroll_error refusal; the caller logs the cause.
export type PayrollError = { code: PayrollErrorCode | null; message: string };

// The shape PostgREST returns: payroll_error puts the code in DETAIL (`details`).
export type PostgrestLikeError = {
  message: string;
  details?: string | null;
  hint?: string | null;
  code?: string;
};

export const UNKNOWN_PAYROLL_MESSAGE = "Couldn't save. Try again.";

const STATUS_FORBIDDEN = 403;
const STATUS_NOT_FOUND = 404;
const STATUS_CONFLICT = 409;
const STATUS_UNPROCESSABLE = 422;

// Every other code refuses the write in the run's or period's current state: 409.
const PAYROLL_ERROR_STATUSES: Partial<Record<PayrollErrorCode, number>> = {
  not_admin: STATUS_FORBIDDEN,
  run_not_found: STATUS_NOT_FOUND,
  adjustment_not_found: STATUS_NOT_FOUND,
  amount_required: STATUS_UNPROCESSABLE,
  reason_required: STATUS_UNPROCESSABLE,
  method_required: STATUS_UNPROCESSABLE,
  paid_on_required: STATUS_UNPROCESSABLE,
};

const PAYROLL_ERROR_MESSAGES: Record<PayrollErrorCode, string> = {
  not_admin: "Only an admin can change payroll.",
  period_not_ended: "This Pay period hasn't ended yet.",
  before_payroll_start: "This Pay period is before the Payroll start.",
  nothing_to_finalize: "There's no draft Pay run to finalize.",
  blocked: "Fix this Cleaner's problem sessions and Pay rate to finalize.",
  run_not_found: "This Pay run no longer exists. Reload and try again.",
  not_finalized: "This Pay run isn't finalized, or it's already paid.",
  has_later_run: "Undo her off-cycle run first.",
  run_paid: "This Pay run is paid and can't change.",
  amount_required: "Enter an amount other than $0",
  reason_required: "Add a reason",
  appointment_not_on_run: "That appointment isn't on this Pay run.",
  adjustment_not_found: "This Adjustment no longer exists. Reload and try again.",
  already_in_period: "This Cleaner already has a Pay run in this period.",
  run_not_empty:
    "This Pay run has shifts, Adjustments or problem sessions, so it can't be removed.",
  no_stragglers: "This Cleaner has no unpaid shifts after finalize in this period.",
  draft_exists: "This Cleaner already has an unpaid off-cycle run in this period.",
  method_required: "Enter a Payout method",
  paid_on_required: "Enter the paid date",
  paid_on_future: "The paid date can't be in the future",
  paid_on_before_period_end: "The paid date can't be before the Pay period ends",
  not_paid: "Only a paid Pay run's payout can be edited.",
};

export function isPayrollErrorCode(value: unknown): value is PayrollErrorCode {
  return (PAYROLL_ERROR_CODES as readonly unknown[]).includes(value);
}

// For the per-target codes in a bulk result row (finalize_pay_runs), which aren't raised.
export function getPayrollErrorMessage(code: PayrollErrorCode): string {
  return PAYROLL_ERROR_MESSAGES[code];
}

// The HTTP status a refusal maps to in a service Result.
export function getPayrollErrorStatus(code: PayrollErrorCode): number {
  return PAYROLL_ERROR_STATUSES[code] ?? STATUS_CONFLICT;
}

export function toPayrollError(error: PostgrestLikeError): PayrollError {
  const { details } = error;
  if (!isPayrollErrorCode(details)) {
    return { code: null, message: UNKNOWN_PAYROLL_MESSAGE };
  }
  return { code: details, message: PAYROLL_ERROR_MESSAGES[details] };
}
