import { isCalendarDate } from "../dates/calendar.ts";
import {
  AMOUNT_TOO_LARGE_MESSAGE,
  parseDollarsToCents,
} from "../pricing/money.ts";

export type PayRateFieldErrors = {
  hourly_rate_cents?: string;
  effective_from?: string;
};

export type PayRateInput = {
  hourly_rate_cents: number;
  effective_from: string;
};

export type PayRateFormResult =
  | { success: true; data: PayRateInput }
  | { success: false; error: string; fieldErrors: PayRateFieldErrors };

export const FIX_FIELDS_MESSAGE = "Please correct the highlighted fields.";
export const INVALID_RATE_MESSAGE = "Enter a rate above $0.00.";
export const INVALID_DATE_MESSAGE = "Enter a real date.";
// Shown for the app's own check and for the partial unique index on live rates alike.
export const DUPLICATE_RATE_DATE_MESSAGE =
  "She already has a rate from this date. Edit that one instead.";

function readField(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

// The add and edit forms post the same two fields; the employee comes from the action, never the form.
export function parsePayRateForm(formData: FormData): PayRateFormResult {
  const rate = parseDollarsToCents(readField(formData, "hourly_rate_cents"));
  const effectiveFrom = readField(formData, "effective_from");
  const fieldErrors: PayRateFieldErrors = {};

  if ("error" in rate && rate.error === "too_large") {
    fieldErrors.hourly_rate_cents = AMOUNT_TOO_LARGE_MESSAGE;
  } else if ("error" in rate || rate.cents <= 0) {
    fieldErrors.hourly_rate_cents = INVALID_RATE_MESSAGE;
  }
  if (!isCalendarDate(effectiveFrom)) {
    fieldErrors.effective_from = INVALID_DATE_MESSAGE;
  }

  let result: PayRateFormResult;
  if ("error" in rate || Object.keys(fieldErrors).length > 0) {
    result = { success: false, error: FIX_FIELDS_MESSAGE, fieldErrors };
  } else {
    result = {
      success: true,
      data: { hourly_rate_cents: rate.cents, effective_from: effectiveFrom },
    };
  }
  return result;
}
