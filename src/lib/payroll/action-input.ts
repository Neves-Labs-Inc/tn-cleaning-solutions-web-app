// Relative imports: node --test runs this file without the @/ alias.
import { isCalendarDate } from "../dates/calendar.ts";
import { MAX_PAYOUT_METHOD_LENGTH } from "../employees/employee-form.ts";
import {
  AMOUNT_TOO_LARGE_MESSAGE,
  parseDollarsToCents,
  type ParsedDollars,
} from "../pricing/money.ts";

// What the Payroll server actions accept from the page, parsed before any SQL runs. Pure. The SQL
// functions check every rule again; this gives the form its field errors.

export type AdjustmentFieldErrors = {
  amount?: string;
  reason?: string;
  appointment?: string;
};

export type AdjustmentInput = {
  amountCents: number;
  reason: string;
  // The session it points at, or null for one about the whole run.
  appointmentEmployeeId: string | null;
};

export type AdjustmentFormResult =
  | { success: true; data: AdjustmentInput }
  | { success: false; fieldErrors: AdjustmentFieldErrors };

export type RunTarget = { employeeId: string; periodStart: string };

export type MarkPaidItem = { runId: string; payoutMethod: string };

export type MarkPaidRequest = { items: MarkPaidItem[]; paidOn: string };

export type PayoutEdit = MarkPaidItem & { paidOn: string };

// One mark_pay_runs_paid call takes one savepoint per run; no period has anywhere near this many.
const MAX_MARK_PAID_ITEMS = 200;

export const ADJUSTMENT_AMOUNT_ERROR = "Enter an amount, e.g. 20 or -12.50";
export const ADJUSTMENT_REASON_ERROR = "Add a reason the Cleaner will see";
export const MAX_REASON_LENGTH = 500;
const REASON_TOO_LONG_ERROR = `Keep the reason under ${MAX_REASON_LENGTH} characters`;
const APPOINTMENT_ERROR = "Pick an appointment from the list";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// A hyphen-minus, or U+2212, which the ledger shows on a deduction and a copy-paste brings along.
const LEADING_MINUS = /^[-−]/;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

// "20" -> 2000, "-12.50" or "−12.50" -> -1250. parseDollarsToCents takes no sign, so one leading
// minus is stripped here; the cap applies to the size either way.
export function parseSignedDollarsToCents(raw: string): ParsedDollars {
  const trimmed = raw.trim();
  const isNegative = LEADING_MINUS.test(trimmed);
  const parsed = parseDollarsToCents(isNegative ? trimmed.slice(1) : trimmed);

  let result: ParsedDollars = parsed;
  if ("cents" in parsed && isNegative) {
    // `|| 0` keeps "-0" from becoming -0.
    result = { cents: -parsed.cents || 0 };
  }
  return result;
}

function readField(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function getAmountError(amount: ParsedDollars): string | null {
  let error: string | null = null;
  if ("error" in amount && amount.error === "too_large") {
    error = AMOUNT_TOO_LARGE_MESSAGE;
  } else if ("error" in amount || amount.cents === 0) {
    error = ADJUSTMENT_AMOUNT_ERROR;
  }
  return error;
}

function getReasonError(reason: string): string | null {
  let error: string | null = null;
  if (reason === "") {
    error = ADJUSTMENT_REASON_ERROR;
  } else if (reason.length > MAX_REASON_LENGTH) {
    error = REASON_TOO_LONG_ERROR;
  }
  return error;
}

// The Add Adjustment form posts amount, reason and appointment_employee_id (blank for the whole run).
export function parseAdjustmentForm(formData: FormData): AdjustmentFormResult {
  const amount = parseSignedDollarsToCents(readField(formData, "amount"));
  const reason = readField(formData, "reason");
  const appointment = readField(formData, "appointment_employee_id");

  const amountError = getAmountError(amount);
  const reasonError = getReasonError(reason);
  const appointmentError =
    appointment === "" || isUuid(appointment) ? null : APPOINTMENT_ERROR;
  const fieldErrors: AdjustmentFieldErrors = {
    ...(amountError === null ? {} : { amount: amountError }),
    ...(reasonError === null ? {} : { reason: reasonError }),
    ...(appointmentError === null ? {} : { appointment: appointmentError }),
  };

  let result: AdjustmentFormResult;
  if ("error" in amount || Object.keys(fieldErrors).length > 0) {
    result = { success: false, fieldErrors };
  } else {
    result = {
      success: true,
      data: {
        amountCents: amount.cents,
        reason,
        appointmentEmployeeId: appointment === "" ? null : appointment,
      },
    };
  }
  return result;
}

// A Cleaner and a Pay period from the page. null when either isn't well formed; the SQL normalizes
// the date to its Pay period and checks it has ended.
export function parseRunTarget(input: {
  employeeId: unknown;
  periodStart: unknown;
}): RunTarget | null {
  const { employeeId, periodStart } = input;
  const isValid = isUuid(employeeId) && isDateText(periodStart);
  return isValid ? { employeeId, periodStart } : null;
}

// Blank passes: the SQL refuses it per run (method_required), so the dialog can name that run.
function isPayoutMethodText(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_PAYOUT_METHOD_LENGTH;
}

function parseMarkPaidItem(value: unknown): MarkPaidItem | null {
  const item =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const { runId, payoutMethod } = item;
  const isValid = isUuid(runId) && isPayoutMethodText(payoutMethod);
  return isValid ? { runId, payoutMethod } : null;
}

// Mark paid from the page: each run with its method, one paid date. null when anything is
// malformed or a run is listed twice; the SQL checks the payout rules.
export function parseMarkPaidRequest(
  items: unknown,
  paidOn: unknown,
): MarkPaidRequest | null {
  const raw = Array.isArray(items) ? items : [];
  const parsed = raw.flatMap((value) => {
    const item = parseMarkPaidItem(value);
    return item === null ? [] : [item];
  });
  const runIds = new Set(parsed.map((item) => item.runId));
  const isValid =
    isDateText(paidOn) &&
    parsed.length > 0 &&
    parsed.length === raw.length &&
    runIds.size === parsed.length &&
    parsed.length <= MAX_MARK_PAID_ITEMS;
  return isValid ? { items: parsed, paidOn } : null;
}

// Edit payout from the page. null when anything is malformed.
export function parsePayoutEdit(input: {
  runId: unknown;
  payoutMethod: unknown;
  paidOn: unknown;
}): PayoutEdit | null {
  const item = parseMarkPaidItem(input);
  const { paidOn } = input;
  return item !== null && isDateText(paidOn) ? { ...item, paidOn } : null;
}

// A yyyy-MM-dd calendar date, from a caller that may send anything.
export function isDateText(value: unknown): value is string {
  return typeof value === "string" && isCalendarDate(value);
}
