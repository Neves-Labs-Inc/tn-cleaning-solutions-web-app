import type { Tables } from "@/types/database";
// Relative import: node --test runs this file without the @/ alias.
import { fromBusinessWallClock } from "../schedule/business-time.ts";

// The time-sheet rules for one session (one appointment_employees row: one Cleaner on one
// visit). Pure: `now` is always passed in. A future Pay run preview reuses these flags as
// warnings that never block.

export const FLAG_GRACE_HOURS = 1;
export const ODD_LOW_RATIO = 0.5;
export const ODD_HIGH_RATIO = 1.5;

export const FLAG_KINDS = ["open_shift", "missing_clock", "odd_duration"] as const;
export type FlagKind = (typeof FLAG_KINDS)[number];

export type SessionState = "upcoming" | "not_clocked" | "in_progress" | "open" | "closed";
export type FixAction = "edit" | "close" | "add";

export type ClockCorrectionRow = Tables<"clock_corrections">;
export type AcknowledgementRow = Tables<"odd_duration_acknowledgements">;
export type AppointmentStatus = Tables<"appointments">["status"];

// The shape fetchAdminSessions reads. Clocks are the database's strings, kept to the microsecond.
export type AdminSessionRow = {
  id: string;
  employee_id: string;
  clocked_in_at: string | null;
  clocked_out_at: string | null;
  appointment: {
    id: string;
    scheduled_date: string;
    scheduled_start_time: string;
    scheduled_end_time: string;
    status: AppointmentStatus;
    manually_completed: boolean;
    client: { name: string } | null;
    job: { name: string } | null;
  };
  employee: { id: string; full_name: string };
  clock_corrections: ClockCorrectionRow[];
  odd_duration_acknowledgements: AcknowledgementRow[];
};

export type SessionView = {
  assignmentId: string;
  appointmentId: string;
  cleanerId: string;
  cleanerName: string;
  clientName: string;
  jobName: string;
  scheduledDate: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  // ISO instants of the visit's Eastern wall-clock start and end, and end + FLAG_GRACE_HOURS.
  scheduledStart: string;
  scheduledEnd: string;
  graceEnd: string;
  appointmentStatus: AppointmentStatus;
  isManualCompletion: boolean;
  // Untouched database strings: pass these, never a re-serialized Date, back to the write path.
  clockIn: string | null;
  clockOut: string | null;
  state: SessionState;
  flags: FlagKind[];
  isEdited: boolean;
  isAcknowledged: boolean;
  clockedMinutes: number | null;
  scheduledMinutes: number;
  oddRatioPercent: number | null;
  fixAction: FixAction | null;
  // Newest first.
  corrections: ClockCorrectionRow[];
  acknowledgements: AcknowledgementRow[];
};

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MICROS_PER_MS = 1000;
const MICRO_DIGITS = 6;
const MS_DIGITS = 3;
const PERCENT = 100;
const FRACTION_PATTERN = /\.(\d+)/;

// Timestamps arrive with microseconds that Date drops; the database compares to the microsecond,
// so acknowledgement matching does too.
function toEpochMicros(timestamp: string): number {
  const fraction = FRACTION_PATTERN.exec(timestamp)?.[1] ?? "";
  const subMillis = fraction.padEnd(MICRO_DIGITS, "0").slice(MS_DIGITS, MICRO_DIGITS);
  return Date.parse(timestamp) * MICROS_PER_MS + Number(subMillis);
}

export function isSameInstant(left: string | null, right: string | null): boolean {
  if (left === null || right === null) return left === right;

  return toEpochMicros(left) === toEpochMicros(right);
}

// "HH:mm[:ss]" on a yyyy-MM-dd date, read as Eastern wall clock.
function toScheduledInstant(date: string, time: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute, second = 0] = time.split(":").map(Number);
  return fromBusinessWallClock(new Date(year, month - 1, day, hour, minute, second));
}

function newestFirst<T>(rows: T[], getTime: (row: T) => string): T[] {
  return [...rows].sort((a, b) => toEpochMicros(getTime(b)) - toEpochMicros(getTime(a)));
}

function getState(row: AdminSessionRow, graceEnd: Date, now: Date): SessionState {
  const isPastGrace = now.getTime() >= graceEnd.getTime();

  let state: SessionState = isPastGrace ? "not_clocked" : "upcoming";
  if (row.clocked_in_at && row.clocked_out_at) {
    state = "closed";
  } else if (row.clocked_in_at) {
    state = isPastGrace ? "open" : "in_progress";
  }
  return state;
}

function getFixAction(state: SessionState, scheduledStart: Date, now: Date): FixAction | null {
  let fixAction: FixAction | null = null;
  if (state === "closed") {
    fixAction = "edit";
  } else if (state === "open" || state === "in_progress") {
    fixAction = "close";
  } else if (scheduledStart.getTime() <= now.getTime()) {
    fixAction = "add";
  }
  return fixAction;
}

// Whole minutes of Clocked time between two clocks, never negative.
export function getClockedMinutes(clockIn: string, clockOut: string): number {
  const elapsed = Date.parse(clockOut) - Date.parse(clockIn);
  return Math.max(0, Math.floor(elapsed / MS_PER_MINUTE));
}

export function buildSessionView(row: AdminSessionRow, now: Date): SessionView {
  const { appointment } = row;
  const scheduledStart = toScheduledInstant(
    appointment.scheduled_date,
    appointment.scheduled_start_time,
  );
  const scheduledEnd = toScheduledInstant(appointment.scheduled_date, appointment.scheduled_end_time);
  const graceEnd = new Date(scheduledEnd.getTime() + FLAG_GRACE_HOURS * MS_PER_HOUR);
  const scheduledMinutes = Math.round(
    (scheduledEnd.getTime() - scheduledStart.getTime()) / MS_PER_MINUTE,
  );

  const state = getState(row, graceEnd, now);
  const clockedMinutes =
    row.clocked_in_at && row.clocked_out_at
      ? getClockedMinutes(row.clocked_in_at, row.clocked_out_at)
      : null;
  // A visit with no scheduled length has no ratio to judge.
  const ratio =
    clockedMinutes !== null && scheduledMinutes > 0 ? clockedMinutes / scheduledMinutes : null;
  const isOddLength = ratio !== null && (ratio < ODD_LOW_RATIO || ratio > ODD_HIGH_RATIO);

  const acknowledgements = newestFirst(
    row.odd_duration_acknowledgements,
    (ack) => ack.acknowledged_at,
  );
  const hasMatchingAcknowledgement = acknowledgements.some(
    (ack) =>
      isSameInstant(ack.clock_in, row.clocked_in_at) &&
      isSameInstant(ack.clock_out, row.clocked_out_at),
  );

  const flags = FLAG_KINDS.filter(
    (kind) =>
      (kind === "open_shift" && state === "open") ||
      (kind === "missing_clock" && state === "not_clocked") ||
      (kind === "odd_duration" && isOddLength && !hasMatchingAcknowledgement),
  );

  return {
    assignmentId: row.id,
    appointmentId: appointment.id,
    cleanerId: row.employee.id,
    cleanerName: row.employee.full_name,
    clientName: appointment.client?.name ?? "Unknown client",
    jobName: appointment.job?.name ?? "Unknown job",
    scheduledDate: appointment.scheduled_date,
    scheduledStartTime: appointment.scheduled_start_time,
    scheduledEndTime: appointment.scheduled_end_time,
    scheduledStart: scheduledStart.toISOString(),
    scheduledEnd: scheduledEnd.toISOString(),
    graceEnd: graceEnd.toISOString(),
    appointmentStatus: appointment.status,
    isManualCompletion: appointment.manually_completed,
    clockIn: row.clocked_in_at,
    clockOut: row.clocked_out_at,
    state,
    flags,
    isEdited: row.clock_corrections.length > 0,
    isAcknowledged: isOddLength && hasMatchingAcknowledgement,
    clockedMinutes,
    scheduledMinutes,
    oddRatioPercent: ratio === null ? null : Math.round(ratio * PERCENT),
    fixAction: getFixAction(state, scheduledStart, now),
    corrections: newestFirst(row.clock_corrections, (item) => item.corrected_at),
    acknowledgements,
  };
}
