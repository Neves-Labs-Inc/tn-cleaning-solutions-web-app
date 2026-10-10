// Relative imports: node --test runs this file without the @/ alias.
import {
  fromBusinessWallClock,
  getBusinessDate,
  toBusinessWallClock,
} from "../schedule/business-time.ts";
import { getClockError, type ClockErrorCode } from "./errors.ts";
import type { FixAction, SessionView } from "./session-view.ts";

// The inline fix forms' drafts. Each clock is an Eastern wall-clock date and time; the date
// defaults to the visit's. Validation mirrors correct_session_clocks' order for instant feedback,
// but the server stays the authority (overlap is checked only there).

export type DraftField = { date: string; time: string };
export type ClockDraft = { clockIn: DraftField; clockOut: DraftField };
export type ClockDraftMode = FixAction;
export type ClockDraftErrors = { clockIn?: string; clockOut?: string };
export type ClockInstants = { clockIn: string | null; clockOut: string | null };

type DraftCheck = {
  field: keyof ClockDraftErrors;
  message: string;
  hasFailed: boolean;
};

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;
const CLOSE_NEEDS_CLOCK_OUT = "Enter a clock-out to close the shift";

function padTwo(value: number): string {
  return String(value).padStart(2, "0");
}

function toDraftField(instant: string | null, fallbackDate: string): DraftField {
  if (instant === null) return { date: fallbackDate, time: "" };

  const date = new Date(instant);
  const wallClock = toBusinessWallClock(date);
  return {
    date: getBusinessDate(date),
    time: `${padTwo(wallClock.getHours())}:${padTwo(wallClock.getMinutes())}`,
  };
}

// Null for an empty time; a malformed field also reads as empty (the inputs never send one).
function toInstant(field: DraftField): Date | null {
  if (!DAY_PATTERN.test(field.date) || !TIME_PATTERN.test(field.time)) return null;

  const [year, month, day] = field.date.split("-").map(Number);
  const [hour, minute] = field.time.split(":").map(Number);
  return fromBusinessWallClock(new Date(year, month - 1, day, hour, minute));
}

function isSameField(left: DraftField, right: DraftField): boolean {
  return left.date === right.date && left.time === right.time;
}

// Clock-out defaults to the scheduled end once it has passed, else stays empty for the admin.
function prefillClockOut(view: SessionView, now: Date): DraftField {
  const hasEnded = Date.parse(view.scheduledEnd) <= now.getTime();
  return hasEnded
    ? toDraftField(view.scheduledEnd, view.scheduledDate)
    : toDraftField(null, view.scheduledDate);
}

export function prefillClockDraft(view: SessionView, mode: ClockDraftMode, now: Date): ClockDraft {
  let draft: ClockDraft = {
    clockIn: toDraftField(view.clockIn, view.scheduledDate),
    clockOut: toDraftField(view.clockOut, view.scheduledDate),
  };
  if (mode === "add") {
    draft = {
      clockIn: toDraftField(view.scheduledStart, view.scheduledDate),
      clockOut: prefillClockOut(view, now),
    };
  } else if (mode === "close") {
    draft = { ...draft, clockOut: prefillClockOut(view, now) };
  }
  return draft;
}

function serverCheck(code: ClockErrorCode, hasFailed: boolean): DraftCheck {
  const { field, message } = getClockError(code);
  // Every code checked here belongs to a clock field.
  return { field: field === "clockOut" ? "clockOut" : "clockIn", message, hasFailed };
}

// At most one message per field: the first check that fails for it, in the server's order.
export function validateClockDraft(
  draft: ClockDraft,
  mode: ClockDraftMode,
  view: SessionView,
  now: Date,
): ClockDraftErrors {
  const clockIn = toInstant(draft.clockIn);
  const clockOut = toInstant(draft.clockOut);
  // Both clocks empty clears the session.
  if (mode === "edit" && clockIn === null && clockOut === null) return {};

  const nowTime = now.getTime();
  const checks: DraftCheck[] = [
    { field: "clockOut", message: CLOSE_NEEDS_CLOCK_OUT, hasFailed: mode === "close" && !clockOut },
    serverCheck("clock_in_required", clockOut !== null && clockIn === null),
    serverCheck("clock_in_future", clockIn !== null && clockIn.getTime() > nowTime),
    serverCheck("clock_out_future", clockOut !== null && clockOut.getTime() > nowTime),
    serverCheck(
      "clock_out_before_clock_in",
      clockIn !== null && clockOut !== null && clockOut.getTime() <= clockIn.getTime(),
    ),
    serverCheck(
      "clock_out_required",
      mode === "add" && clockOut === null && nowTime >= Date.parse(view.graceEnd),
    ),
  ];

  return checks
    .filter((check) => check.hasFailed)
    .reduce<ClockDraftErrors>(
      (errors, check) => (errors[check.field] ? errors : { ...errors, [check.field]: check.message }),
      {},
    );
}

// ISO instants for the write path. `current` is the session's clocks (a SessionView fits): a
// field the admin left as prefilled returns the database string untouched, because
// re-serializing would drop its seconds and microseconds, turning an unchanged clock into a
// change. It is required so no caller can skip that.
export function draftToInstants(draft: ClockDraft, current: ClockInstants): ClockInstants {
  const resolve = (field: DraftField, currentValue: string | null) => {
    const isUnchanged =
      currentValue !== null && isSameField(field, toDraftField(currentValue, field.date));
    return isUnchanged ? currentValue : (toInstant(field)?.toISOString() ?? null);
  };

  return {
    clockIn: resolve(draft.clockIn, current.clockIn),
    clockOut: resolve(draft.clockOut, current.clockOut),
  };
}
