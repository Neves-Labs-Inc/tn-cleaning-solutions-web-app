// Mirrors the CASE block of payroll_error() in
// supabase/migrations/20261014130000_payroll_write_functions.sql; tests/payroll/errors.test.ts
// fails when the two drift.
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

const UNKNOWN_PAYROLL_MESSAGE = "Couldn't save. Try again.";

const PAYROLL_ERROR_MESSAGES: Record<PayrollErrorCode, string> = {
  not_admin: "Only an admin can change payroll.",
  period_not_ended: "This Pay period hasn't ended yet.",
  before_payroll_start: "This Pay period is before the Payroll start.",
  nothing_to_finalize: "There's no draft Pay run to finalize.",
  blocked: "Fix this Cleaner's problem sessions and Pay rate to finalize.",
  run_not_found: "This Pay run no longer exists. Reload and try again.",
  not_finalized: "Only a finalized, unpaid Pay run can go back to draft.",
  has_later_run:
    "This Cleaner has an off-cycle run in this period, so this run can't go back to draft.",
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
};

export function isPayrollErrorCode(value: unknown): value is PayrollErrorCode {
  return (PAYROLL_ERROR_CODES as readonly unknown[]).includes(value);
}

// For the per-target codes in a bulk result row (finalize_pay_runs), which aren't raised.
export function getPayrollErrorMessage(code: PayrollErrorCode): string {
  return PAYROLL_ERROR_MESSAGES[code];
}

export function toPayrollError(error: PostgrestLikeError): PayrollError {
  const { details } = error;
  if (!isPayrollErrorCode(details)) {
    return { code: null, message: UNKNOWN_PAYROLL_MESSAGE };
  }
  return { code: details, message: PAYROLL_ERROR_MESSAGES[details] };
}
