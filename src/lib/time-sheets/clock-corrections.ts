import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import {
  getOverlapAssignmentId,
  isClockErrorCode,
  toClockError,
  type ClockError,
  type OverlapSession,
  type PostgrestLikeError,
} from "@/lib/time-sheets/errors";

// Server-only: it takes the user-session client, so get_user_role() and auth.uid() inside the SQL
// functions see the signed-in admin (ADR 0001). Never hand it a service-role client.

export type ClockCorrectionResult =
  | { ok: true; appointmentId: string | null }
  | ({ ok: false } & ClockError);

export type SessionClocksCorrection = {
  assignmentId: string;
  clockIn: string | null;
  clockOut: string | null;
  reason: string | null;
};

export type OddDurationAcknowledgement = {
  assignmentId: string;
  expectedClockIn: string | null;
  expectedClockOut: string | null;
  note: string;
};

type Logger = {
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export class ClockCorrections {
  readonly #db: SupabaseClient<Database>;
  readonly #logger: Logger;

  constructor(db: SupabaseClient<Database>, logger: Logger = console) {
    this.#db = db;
    this.#logger = logger;
  }

  async correct(input: SessionClocksCorrection): Promise<ClockCorrectionResult> {
    const { error } = await this.#db.rpc("correct_session_clocks", {
      assignment_id: input.assignmentId,
      new_clock_in: input.clockIn,
      new_clock_out: input.clockOut,
      reason: input.reason,
    });
    return this.#settle("correct", input.assignmentId, error);
  }

  async acknowledge(
    input: OddDurationAcknowledgement,
  ): Promise<ClockCorrectionResult> {
    const { error } = await this.#db.rpc("acknowledge_odd_duration", {
      assignment_id: input.assignmentId,
      expected_clock_in: input.expectedClockIn,
      expected_clock_out: input.expectedClockOut,
      note: input.note,
    });
    return this.#settle("acknowledge", input.assignmentId, error);
  }

  async #settle(
    operation: string,
    assignmentId: string,
    error: PostgrestLikeError | null,
  ): Promise<ClockCorrectionResult> {
    if (error) return this.#fail(operation, assignmentId, error);

    return { ok: true, appointmentId: await this.#findAppointmentId(assignmentId) };
  }

  async #fail(
    operation: string,
    assignmentId: string,
    error: PostgrestLikeError,
  ): Promise<ClockCorrectionResult> {
    const overlapId = getOverlapAssignmentId(error);
    const overlap = overlapId ? await this.#findOverlapSession(overlapId) : null;
    const clockError = toClockError(error, overlap);

    // A refusal is the admin's to fix (4xx); anything else is ours (5xx).
    const level = isClockErrorCode(error.details) ? "warn" : "error";
    this.#logger[level](`Clock corrections ${operation} failed`, {
      assignmentId,
      code: error.details ?? error.code,
      message: error.message,
    });
    return { ok: false, ...clockError };
  }

  // Only for revalidating the visit page; a failed read just skips that one path.
  async #findAppointmentId(assignmentId: string): Promise<string | null> {
    const { data, error } = await this.#db
      .from("appointment_employees")
      .select("appointment_id")
      .eq("id", assignmentId)
      .maybeSingle();
    if (error) {
      this.#logger.warn("Clock corrections: appointment lookup failed", {
        assignmentId,
        message: error.message,
      });
    }
    return data?.appointment_id ?? null;
  }

  // Without it the message still says "Overlaps another session", just without the details.
  async #findOverlapSession(assignmentId: string): Promise<OverlapSession | null> {
    const { data, error } = await this.#db
      .from("appointment_employees")
      .select("clocked_in_at, clocked_out_at, appointments!inner(clients!inner(name))")
      .eq("id", assignmentId)
      .maybeSingle();
    if (error) {
      this.#logger.warn("Clock corrections: overlap lookup failed", {
        assignmentId,
        message: error.message,
      });
    }

    let session: OverlapSession | null = null;
    if (data?.clocked_in_at && data.clocked_out_at) {
      session = {
        clientName: data.appointments.clients.name,
        clockIn: data.clocked_in_at,
        clockOut: data.clocked_out_at,
      };
    }
    return session;
  }
}
