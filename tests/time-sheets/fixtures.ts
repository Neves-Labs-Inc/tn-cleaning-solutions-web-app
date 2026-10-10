import type {
  AcknowledgementRow,
  AdminSessionRow,
  ClockCorrectionRow,
} from "../../src/lib/time-sheets/session-view.ts";

// The visit every fixture uses: Wed Oct 14, 2026, 9:00 AM–12:00 PM Eastern (EDT, UTC-4), so it
// runs 13:00Z–16:00Z, 180 minutes, and its flag grace ends at 17:00Z.
export const VISIT_DATE = "2026-10-14";
export const SCHEDULED_START = "2026-10-14T13:00:00.000Z";
export const SCHEDULED_END = "2026-10-14T16:00:00.000Z";
export const GRACE_END = "2026-10-14T17:00:00.000Z";

type RowOverrides = Partial<Omit<AdminSessionRow, "appointment">> & {
  appointment?: Partial<AdminSessionRow["appointment"]>;
};

export function sessionRow(overrides: RowOverrides = {}): AdminSessionRow {
  const { appointment, ...rest } = overrides;
  return {
    id: "assignment-1",
    employee_id: "cleaner-1",
    clocked_in_at: null,
    clocked_out_at: null,
    employee: { id: "cleaner-1", full_name: "Ana Souza" },
    clock_corrections: [],
    odd_duration_acknowledgements: [],
    ...rest,
    appointment: {
      id: "visit-1",
      scheduled_date: VISIT_DATE,
      scheduled_start_time: "09:00:00",
      scheduled_end_time: "12:00:00",
      status: "scheduled",
      manually_completed: false,
      client: { name: "Maple House" },
      job: { name: "Weekly clean" },
      ...appointment,
    },
  };
}

export function correction(overrides: Partial<ClockCorrectionRow> = {}): ClockCorrectionRow {
  return {
    id: "correction-1",
    appointment_employee_id: "assignment-1",
    corrected_by: "admin-1",
    corrected_by_name: "Franklin",
    corrected_at: "2026-10-14T18:00:00.000000+00:00",
    old_clock_in: null,
    old_clock_out: null,
    new_clock_in: "2026-10-14T13:00:00+00:00",
    new_clock_out: "2026-10-14T16:00:00+00:00",
    reason: null,
    ...overrides,
  };
}

export function acknowledgement(
  overrides: Partial<AcknowledgementRow> = {},
): AcknowledgementRow {
  return {
    id: "ack-1",
    appointment_employee_id: "assignment-1",
    acknowledged_by: "admin-1",
    acknowledged_by_name: "Franklin",
    acknowledged_at: "2026-10-14T18:00:00.000000+00:00",
    clock_in: "2026-10-14T13:00:00+00:00",
    clock_out: "2026-10-14T14:00:00+00:00",
    note: "Small job today",
    ...overrides,
  };
}
