import { isCalendarDate } from "../dates/calendar.ts";
import {
  AMOUNT_TOO_LARGE_MESSAGE,
  parseDollarsToCents,
} from "../pricing/money.ts";

export type ClientJobPricingFieldErrors = {
  job_id?: string;
  hourly_rate_cents?: string;
  effective_from?: string;
};

// What an edit may change. A rate's job is fixed once created: an edit never moves it.
export type RateChange = {
  hourly_rate_cents: number;
  effective_from: string;
  notes: string | null;
};

export type NewRate = RateChange & { job_id: string };

export type RateFormResult<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: string;
      fieldErrors: ClientJobPricingFieldErrors;
    };

const FIX_FIELDS_MESSAGE = "Please correct the highlighted fields.";
function readField(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function parseRateFields(
  formData: FormData,
  fieldErrors: ClientJobPricingFieldErrors,
): RateFormResult<RateChange> {
  const rate = parseDollarsToCents(readField(formData, "hourly_rate_cents"));
  const effectiveFrom = readField(formData, "effective_from");
  const errors = { ...fieldErrors };

  if ("error" in rate) {
    errors.hourly_rate_cents =
      rate.error === "too_large"
        ? AMOUNT_TOO_LARGE_MESSAGE
        : "Enter a valid hourly rate in dollars.";
  }
  if (!isCalendarDate(effectiveFrom)) {
    errors.effective_from = "Enter a valid date.";
  }

  let result: RateFormResult<RateChange>;
  if ("error" in rate || Object.keys(errors).length > 0) {
    result = { success: false, error: FIX_FIELDS_MESSAGE, fieldErrors: errors };
  } else {
    result = {
      success: true,
      data: {
        hourly_rate_cents: rate.cents,
        effective_from: effectiveFrom,
        notes: readField(formData, "notes") || null,
      },
    };
  }
  return result;
}

export function parseNewRateForm(formData: FormData): RateFormResult<NewRate> {
  const jobId = readField(formData, "job_id");
  const fields = parseRateFields(
    formData,
    jobId ? {} : { job_id: "Job is required." },
  );

  return fields.success
    ? { success: true, data: { job_id: jobId, ...fields.data } }
    : fields;
}

// Any posted job_id is ignored, so the server can't be used to move a rate either.
export function parseRateChangeForm(
  formData: FormData,
): RateFormResult<RateChange> {
  return parseRateFields(formData, {});
}
