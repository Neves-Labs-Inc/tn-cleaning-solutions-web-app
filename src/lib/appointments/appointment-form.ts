import { isCalendarDate, isClockTime } from "../dates/calendar.ts";
import {
  AMOUNT_TOO_LARGE_MESSAGE,
  parseDollarsToCents,
} from "../pricing/money.ts";
import {
  INTERVAL_CAPS,
  type Interval,
  type IntervalUnit,
} from "./recurrence.ts";

export type AppointmentFieldErrors = {
  client_id?: string;
  job_id?: string;
  location_id?: string;
  scheduled_date?: string;
  scheduled_start_time?: string;
  scheduled_end_time?: string;
  price_override?: string;
  recurrence_interval_count?: string;
  recurrence_interval_unit?: string;
  recurrence_end_date?: string;
  recurrence_max_occurrences?: string;
};

export type ParsedUpdateAppointmentInput = {
  client_id: string;
  job_id: string;
  location_id: string | null;
  scheduled_date: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  price_override_cents: number | null;
  notes: string;
  employee_ids: string[];
};

export type ParsedCreateAppointmentInput = ParsedUpdateAppointmentInput & {
  is_recurring: boolean;
  recurrence_interval: Interval | null;
  recurrence_end_date: string | null;
  recurrence_max_occurrences: number | null;
};

export type ParsedUpdateRecurrenceInput = {
  edit_scope: "occurrence" | "series" | "future";
  recurrence_series_id: string | null;
  recurrence_interval: Interval | null;
  recurrence_end_date: string | null;
  recurrence_max_occurrences: number | null;
};

export type AppointmentFormResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors: AppointmentFieldErrors };

const FIX_FIELDS_MESSAGE = "Please correct the highlighted fields.";
const INVALID_END_DATE_MESSAGE = "Enter a valid end date.";
const MAX_OCCURRENCES_MESSAGE =
  "Max occurrences must be a whole number greater than zero.";

const WHOLE_NUMBER = /^\d+$/;

function readField(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function uniqueIds(values: FormDataEntryValue[]): string[] {
  return Array.from(new Set(values.map(String).filter(Boolean)));
}

function isIntervalUnit(value: string): value is IntervalUnit {
  return Object.hasOwn(INTERVAL_CAPS, value);
}

// Reads "every N units". Writes its errors into fieldErrors; only the unit error shows when the unit is bad.
function parseInterval(
  formData: FormData,
  fieldErrors: AppointmentFieldErrors,
): Interval | null {
  const unit = readField(formData, "recurrence_interval_unit");
  const countRaw = readField(formData, "recurrence_interval_count");
  if (!isIntervalUnit(unit)) {
    fieldErrors.recurrence_interval_unit = "Select a repeat unit.";
    return null;
  }

  const cap = INTERVAL_CAPS[unit];
  const count = Number(countRaw);
  // Digits only: Number() alone would accept "1e1" or "0x10".
  const isCountValid = WHOLE_NUMBER.test(countRaw) && count >= 1 && count <= cap;
  if (!isCountValid) {
    fieldErrors.recurrence_interval_count = `Enter a whole number from 1 to ${cap}.`;
  }
  return isCountValid ? { unit, count } : null;
}

// Minutes from start to end; callers pass only values isClockTime accepted.
function compareTimes(start: string, end: string): number {
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  return endHour * 60 + endMinute - (startHour * 60 + startMinute);
}

function parsePositiveInt(raw: string): number | null | "invalid" {
  if (!raw) return null;

  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : "invalid";
}

function toFormResult<T>(
  fieldErrors: AppointmentFieldErrors,
  data: T,
): AppointmentFormResult<T> {
  const hasErrors = Object.keys(fieldErrors).length > 0;
  return hasErrors
    ? { success: false, error: FIX_FIELDS_MESSAGE, fieldErrors }
    : { success: true, data };
}

// The fields a one-off visit and its edit share. Writes its errors into fieldErrors.
function parseVisitFields(
  formData: FormData,
  fieldErrors: AppointmentFieldErrors,
): ParsedUpdateAppointmentInput {
  const clientId = readField(formData, "client_id");
  const jobId = readField(formData, "job_id");
  const scheduledDate = readField(formData, "scheduled_date");
  const startTime = readField(formData, "scheduled_start_time");
  const endTime = readField(formData, "scheduled_end_time");
  const priceOverride = readField(formData, "price_override");

  if (!clientId) {
    fieldErrors.client_id = "Client is required.";
  }
  if (!jobId) {
    fieldErrors.job_id = "Job is required.";
  }
  if (!isCalendarDate(scheduledDate)) {
    fieldErrors.scheduled_date = "Enter a valid date.";
  }

  const isStartValid = isClockTime(startTime);
  const isEndValid = isClockTime(endTime);
  if (!isStartValid) {
    fieldErrors.scheduled_start_time = "Enter a valid start time.";
  }
  if (!isEndValid) {
    fieldErrors.scheduled_end_time = "Enter a valid end time.";
  }
  if (isStartValid && isEndValid && compareTimes(startTime, endTime) <= 0) {
    fieldErrors.scheduled_end_time = "End time must be after start time.";
  }

  // An empty override means no override, so it is never parsed.
  const parsedOverride = priceOverride
    ? parseDollarsToCents(priceOverride)
    : null;
  if (parsedOverride && "error" in parsedOverride) {
    fieldErrors.price_override =
      parsedOverride.error === "too_large"
        ? AMOUNT_TOO_LARGE_MESSAGE
        : "Enter a valid dollar amount.";
  }

  return {
    client_id: clientId,
    job_id: jobId,
    location_id: readField(formData, "location_id") || null,
    scheduled_date: scheduledDate,
    scheduled_start_time: startTime,
    scheduled_end_time: endTime,
    price_override_cents:
      parsedOverride && "cents" in parsedOverride ? parsedOverride.cents : null,
    notes: readField(formData, "notes"),
    employee_ids: uniqueIds(formData.getAll("employee_ids")),
  };
}

export function parseCreateAppointmentFormData(
  formData: FormData,
): AppointmentFormResult<ParsedCreateAppointmentInput> {
  const fieldErrors: AppointmentFieldErrors = {};
  const visit = parseVisitFields(formData, fieldErrors);

  const isRecurring = formData.get("is_recurring") === "on";
  const endDateRaw = readField(formData, "recurrence_end_date");
  const maxOccurrences = parsePositiveInt(
    readField(formData, "recurrence_max_occurrences"),
  );

  let interval: Interval | null = null;
  if (isRecurring) {
    interval = parseInterval(formData, fieldErrors);

    if (endDateRaw && !isCalendarDate(endDateRaw)) {
      fieldErrors.recurrence_end_date = INVALID_END_DATE_MESSAGE;
    } else if (
      endDateRaw &&
      isCalendarDate(visit.scheduled_date) &&
      endDateRaw < visit.scheduled_date
    ) {
      fieldErrors.recurrence_end_date =
        "End date must be on or after the appointment date.";
    }

    if (maxOccurrences === "invalid") {
      fieldErrors.recurrence_max_occurrences = MAX_OCCURRENCES_MESSAGE;
    }
  }

  return toFormResult(fieldErrors, {
    ...visit,
    is_recurring: isRecurring,
    recurrence_interval: interval,
    recurrence_end_date: endDateRaw || null,
    recurrence_max_occurrences:
      maxOccurrences === "invalid" ? null : maxOccurrences,
  });
}

export function parseUpdateAppointmentFormData(
  formData: FormData,
): AppointmentFormResult<ParsedUpdateAppointmentInput> {
  const fieldErrors: AppointmentFieldErrors = {};
  const visit = parseVisitFields(formData, fieldErrors);
  return toFormResult(fieldErrors, visit);
}

export function parseUpdateRecurrenceFormData(
  formData: FormData,
): AppointmentFormResult<ParsedUpdateRecurrenceInput> {
  const fieldErrors: AppointmentFieldErrors = {};
  const editScopeRaw = readField(formData, "edit_scope");
  const endDateRaw = readField(formData, "recurrence_end_date");
  const maxOccurrences = parsePositiveInt(
    readField(formData, "recurrence_max_occurrences"),
  );

  const editScope: ParsedUpdateRecurrenceInput["edit_scope"] =
    editScopeRaw === "series" || editScopeRaw === "future"
      ? editScopeRaw
      : "occurrence";

  const interval =
    editScope === "occurrence" ? null : parseInterval(formData, fieldErrors);

  if (endDateRaw && !isCalendarDate(endDateRaw)) {
    fieldErrors.recurrence_end_date = INVALID_END_DATE_MESSAGE;
  }
  if (maxOccurrences === "invalid") {
    fieldErrors.recurrence_max_occurrences = MAX_OCCURRENCES_MESSAGE;
  }

  return toFormResult(fieldErrors, {
    edit_scope: editScope,
    recurrence_series_id: readField(formData, "recurrence_series_id") || null,
    recurrence_interval: interval,
    recurrence_end_date: endDateRaw || null,
    recurrence_max_occurrences:
      maxOccurrences === "invalid" ? null : maxOccurrences,
  });
}
