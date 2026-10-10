// Relative import: node --test runs this file without the @/ alias.
import { formatBusinessTime } from "../schedule/business-time.ts";

// Mirrors the CASE block of clock_error() in
// supabase/migrations/20261010120000_clock_corrections.sql; tests/time-sheets/errors.test.ts fails
// when the two drift.
export const CLOCK_ERROR_CODES = [
  "not_admin",
  "session_not_found",
  "session_archived",
  "visit_cancelled",
  "clock_in_required",
  "clock_in_future",
  "clock_out_future",
  "clock_out_before_clock_in",
  "clock_out_required",
  "overlap",
  "session_open",
  "clocks_changed",
  "note_required",
] as const;

export type ClockErrorCode = (typeof CLOCK_ERROR_CODES)[number];
export type ClockErrorField = "clockIn" | "clockOut" | "note" | "form";
export type ClockError = { field: ClockErrorField; message: string };

// The shape PostgREST returns: clock_error puts the code in DETAIL (`details`) and the overlap's
// clashing assignment id in HINT (`hint`).
export type PostgrestLikeError = {
  message: string;
  details?: string | null;
  hint?: string | null;
  code?: string;
};

// The clashing session named in an overlap message; clocks are ISO instants.
export type OverlapSession = {
  clientName: string;
  clockIn: string;
  clockOut: string;
};

export const UNKNOWN_CLOCK_ERROR: ClockError = {
  field: "form",
  message: "Couldn't save. Try again.",
};

const CLOCK_ERRORS: Record<ClockErrorCode, ClockError> = {
  not_admin: { field: "form", message: "Only an admin can change clocks." },
  session_not_found: {
    field: "form",
    message: "This session no longer exists. Reload and try again.",
  },
  session_archived: {
    field: "form",
    message: "This Cleaner is no longer on the crew.",
  },
  visit_cancelled: {
    field: "form",
    message: "This visit is cancelled. Restore it first.",
  },
  clock_in_required: {
    field: "clockIn",
    message: "Add a clock-in to set a clock-out",
  },
  clock_in_future: {
    field: "clockIn",
    message: "Clock-in can't be in the future",
  },
  clock_out_future: {
    field: "clockOut",
    message: "Clock-out can't be in the future",
  },
  clock_out_before_clock_in: {
    field: "clockOut",
    message: "Clock-out must be after clock-in",
  },
  clock_out_required: {
    field: "clockOut",
    message: "Enter a clock-out. This visit ended more than an hour ago.",
  },
  overlap: { field: "clockIn", message: "Overlaps another session" },
  session_open: {
    field: "form",
    message: "Only a closed session can be acknowledged.",
  },
  clocks_changed: {
    field: "form",
    message: "The clocks changed since you opened this. Reload and try again.",
  },
  note_required: {
    field: "note",
    message: "Add a note saying why this length is fine",
  },
};

// The field and message for a code, so client-side checks say exactly what the server would.
export function getClockError(code: ClockErrorCode): ClockError {
  return CLOCK_ERRORS[code];
}

export function isClockErrorCode(value: unknown): value is ClockErrorCode {
  return (CLOCK_ERROR_CODES as readonly unknown[]).includes(value);
}

function formatOverlapMessage(session: OverlapSession): string {
  const clockIn = formatBusinessTime(new Date(session.clockIn));
  const clockOut = formatBusinessTime(new Date(session.clockOut));
  return `${CLOCK_ERRORS.overlap.message} (${session.clientName}, ${clockIn}–${clockOut})`;
}

// Anything that isn't a clock_error refusal gets the generic message; the caller logs the cause.
export function toClockError(
  error: PostgrestLikeError,
  overlap: OverlapSession | null = null,
): ClockError {
  const { details } = error;
  if (!isClockErrorCode(details)) return UNKNOWN_CLOCK_ERROR;

  let clockError = CLOCK_ERRORS[details];
  if (details === "overlap" && overlap) {
    clockError = { ...clockError, message: formatOverlapMessage(overlap) };
  }
  return clockError;
}

export function getOverlapAssignmentId(error: PostgrestLikeError): string | null {
  return error.details === "overlap" ? (error.hint ?? null) : null;
}
