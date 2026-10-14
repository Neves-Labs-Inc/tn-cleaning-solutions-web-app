import type {
  PayAdjustmentRow,
  PayCleaner,
  PayrollData,
  PayRunLineRow,
  PayRunRow,
  PaySessionRow,
} from "../../src/lib/payroll/payroll-data.ts";

export const OCT_5 = { start: "2026-10-05", end: "2026-10-18" };
export const OCT_19 = { start: "2026-10-19", end: "2026-11-01" };
// Toronto: Wed Oct 21, 2026, 11:00. Oct 5–18 has ended; Oct 19–Nov 1 is running.
export const NOW = new Date("2026-10-21T15:00:00Z");

export function cleaner(
  id: string,
  fullName: string,
  overrides: Partial<PayCleaner> = {},
): PayCleaner {
  return {
    id,
    fullName,
    isActive: true,
    defaultPayoutMethod: "e-Transfer",
    eTransferContact: null,
    ...overrides,
  };
}

export const ANA = cleaner("ana", "Ana Costa");
export const CARLA = cleaner("carla", "Carla Mendes", {
  defaultPayoutMethod: "Cash",
});
export const MARIA = cleaner("maria", "Maria Silva", {
  eTransferContact: "maria@example.com",
});

// A closed, payable, unclaimed 3h shift at $20/h, unless overridden.
export function session(
  id: string,
  employeeId: string,
  overrides: Partial<PaySessionRow> = {},
): PaySessionRow {
  return {
    employee_id: employeeId,
    period_start: OCT_5.start,
    appointment_id: `visit-${id}`,
    appointment_employee_id: id,
    scheduled_date: "2026-10-08",
    scheduled_start_time: "09:00:00",
    scheduled_end_time: "12:00:00",
    client_name: "Patel residence",
    job_name: "Standard clean",
    appointment_status: "completed",
    is_payable: true,
    clocked_in_at: "2026-10-08T13:00:00Z",
    clocked_out_at: "2026-10-08T16:00:00Z",
    state: "closed",
    is_open_shift: false,
    is_missing_clock: false,
    is_odd_duration: false,
    clocked_minutes: 180,
    base_rate_cents: 2000,
    pay_premium_cents: 0,
    effective_rate_cents: 2000,
    amount_cents: 6000,
    has_no_rate: false,
    pay_run_id: null,
    pay_run_kind: null,
    pay_run_status: null,
    ...overrides,
  };
}

export function missingClock(
  id: string,
  employeeId: string,
  overrides: Partial<PaySessionRow> = {},
): PaySessionRow {
  return session(id, employeeId, {
    clocked_in_at: null,
    clocked_out_at: null,
    state: "not_clocked",
    is_missing_clock: true,
    clocked_minutes: null,
    amount_cents: null,
    ...overrides,
  });
}

export function openShift(
  id: string,
  employeeId: string,
  overrides: Partial<PaySessionRow> = {},
): PaySessionRow {
  return session(id, employeeId, {
    clocked_out_at: null,
    state: "open",
    is_open_shift: true,
    clocked_minutes: null,
    amount_cents: null,
    ...overrides,
  });
}

export function noRate(
  id: string,
  employeeId: string,
  overrides: Partial<PaySessionRow> = {},
): PaySessionRow {
  return session(id, employeeId, {
    base_rate_cents: null,
    effective_rate_cents: null,
    amount_cents: null,
    has_no_rate: true,
    ...overrides,
  });
}

export function run(
  id: string,
  employeeId: string,
  overrides: Partial<PayRunRow> = {},
): PayRunRow {
  return {
    id,
    employee_id: employeeId,
    period_start: OCT_5.start,
    kind: "regular",
    status: "draft",
    paid_on: null,
    payout_method: null,
    ...overrides,
  };
}

// A session claimed by a run: the pay view reports the claim's run.
export function claimed(row: PaySessionRow, payRun: PayRunRow): PaySessionRow {
  return {
    ...row,
    pay_run_id: payRun.id,
    pay_run_kind: payRun.kind,
    pay_run_status: payRun.status,
  };
}

export function frozenLine(
  payRunId: string,
  appointmentEmployeeId: string,
  overrides: Partial<PayRunLineRow> = {},
): PayRunLineRow {
  return {
    pay_run_id: payRunId,
    appointment_employee_id: appointmentEmployeeId,
    scheduled_date: "2026-10-08",
    client_name: "Patel residence",
    job_name: "Standard clean",
    minutes: 180,
    rate_cents: 2000,
    amount_cents: 6000,
    ...overrides,
  };
}

export function adjustment(
  id: string,
  payRunId: string,
  amountCents: number,
  overrides: Partial<PayAdjustmentRow> = {},
): PayAdjustmentRow {
  return {
    id,
    pay_run_id: payRunId,
    amount_cents: amountCents,
    reason: "Gas money",
    appointment_employee_id: null,
    created_at: "2026-10-19T15:00:00Z",
    ...overrides,
  };
}

export function payrollData(overrides: Partial<PayrollData> = {}): PayrollData {
  return {
    sessions: [],
    runs: [],
    runLines: [],
    adjustments: [],
    cleaners: [ANA, CARLA, MARIA],
    editedSessionIds: [],
    ...overrides,
  };
}
