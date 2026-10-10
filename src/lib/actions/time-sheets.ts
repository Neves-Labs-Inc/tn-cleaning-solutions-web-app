"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  ClockCorrections,
  type OddDurationAcknowledgement,
  type SessionClocksCorrection,
} from "@/lib/time-sheets/clock-corrections";
import { MAX_CLOCK_TEXT_LENGTH } from "@/lib/time-sheets/clock-draft";
import { UNKNOWN_CLOCK_ERROR, type ClockError } from "@/lib/time-sheets/errors";

// Thin by design: check the input's shape, call the SQL function through the user-session client
// (so it sees the admin), revalidate. Every rule lives in correct_session_clocks and
// acknowledge_odd_duration (20261010120000).

export type ClockActionResult = { ok: true } | ({ ok: false } & ClockError);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REVALIDATED_PATHS = [
  "/solutions/time-tracking",
  "/solutions/time-sheets",
  "/solutions/appointments",
  "/solutions/invoices",
  "/solutions/dashboard",
];

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function isInstantOrNull(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" && !Number.isNaN(Date.parse(value)))
  );
}

function isShortText(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_CLOCK_TEXT_LENGTH;
}

// The UI only ever posts these shapes, so anything else is a bug or a forged call.
function refuseInput(action: string, assignmentId: unknown): ClockActionResult {
  console.warn(`${action}: malformed input`, { assignmentId });
  return { ok: false, ...UNKNOWN_CLOCK_ERROR };
}

// Called only with an appointment id read back from the database, never free text.
function revalidateClockViews(appointmentId: string | null): void {
  for (const path of REVALIDATED_PATHS) {
    revalidatePath(path);
  }
  if (appointmentId) {
    revalidatePath(`/solutions/appointments/${appointmentId}`);
  }
}

async function finish(
  result: Awaited<ReturnType<ClockCorrections["correct"]>>,
): Promise<ClockActionResult> {
  if (!result.ok) return result;

  revalidateClockViews(result.appointmentId);
  return { ok: true };
}

export async function correctSessionClocks(
  input: SessionClocksCorrection,
): Promise<ClockActionResult> {
  const { assignmentId, clockIn, clockOut, reason } = input;
  const isValid =
    isUuid(assignmentId) &&
    isInstantOrNull(clockIn) &&
    isInstantOrNull(clockOut) &&
    (reason === null || isShortText(reason));
  if (!isValid) return refuseInput("correctSessionClocks", assignmentId);

  const corrections = new ClockCorrections(await createClient());
  return finish(
    await corrections.correct({ assignmentId, clockIn, clockOut, reason }),
  );
}

export async function acknowledgeOddDuration(
  input: OddDurationAcknowledgement,
): Promise<ClockActionResult> {
  const { assignmentId, expectedClockIn, expectedClockOut, note } = input;
  const isValid =
    isUuid(assignmentId) &&
    isInstantOrNull(expectedClockIn) &&
    isInstantOrNull(expectedClockOut) &&
    isShortText(note);
  if (!isValid) return refuseInput("acknowledgeOddDuration", assignmentId);

  const corrections = new ClockCorrections(await createClient());
  return finish(
    await corrections.acknowledge({
      assignmentId,
      expectedClockIn,
      expectedClockOut,
      note,
    }),
  );
}
