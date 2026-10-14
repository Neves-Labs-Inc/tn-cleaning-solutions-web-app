import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fetchMyPaidRuns,
  fetchPayPeriodData,
  fetchPayPeriodsOverview,
} from "../../src/lib/payroll/queries.ts";
import { createFakeSupabase } from "../time-sheets/fake-supabase.ts";
import { OCT_19, OCT_5, session } from "./fixtures.ts";

const NOV_2 = "2026-11-02";
const NOV_16 = "2026-11-16";
// Toronto: Tue Nov 3, 2026. Nov 2–15 is running.
const NOV_3 = new Date("2026-11-03T15:00:00Z");
const SESSION_COUNT = 1200;

function seedIds(prefix: string, count: number): string[] {
  return Array.from(
    { length: count },
    (_, index) => `${prefix}-${String(index).padStart(4, "0")}`,
  );
}

function runRow(id: string, periodStart: string) {
  return {
    id,
    employee_id: "ana",
    period_start: periodStart,
    kind: "regular",
    status: "paid",
    paid_on: "2026-10-20",
    payout_method: "Cash",
  };
}

function claimRow(id: string, payRunId: string, periodStart: string) {
  return {
    id: `line-${id}`,
    pay_run_id: payRunId,
    appointment_employee_id: id,
    scheduled_date: "2026-10-08",
    client_name: "Patel residence",
    job_name: "Standard clean",
    minutes: 180,
    rate_cents: 2000,
    amount_cents: 6000,
    pay_run: { period_start: periodStart },
  };
}

function adjustmentRow(id: string, payRunId: string, periodStart: string) {
  return {
    id,
    pay_run_id: payRunId,
    amount_cents: 1500,
    reason: "Gas money",
    appointment_employee_id: null,
    created_at: "2026-10-19T15:00:00Z",
    pay_run: { period_start: periodStart },
  };
}

function employeeRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    full_name: id,
    is_active: true,
    is_archived: false,
    default_payout_method: null,
    e_transfer_contact: null,
    ...overrides,
  };
}

function correctionRow(id: string, sessionId: string) {
  return { id, appointment_employee_id: sessionId };
}

function tables() {
  return {
    pay_period_sessions: [
      ...seedIds("a-oct5", SESSION_COUNT).map((id) => session(id, "ana")),
      session("b-oct19", "ana", { period_start: OCT_19.start }),
      session("c-nov16", "ana", { period_start: NOV_16 }),
    ],
    pay_runs: [
      runRow("r-oct5", OCT_5.start),
      runRow("r-oct19", OCT_19.start),
      runRow("r-nov16", NOV_16),
    ],
    pay_run_lines: [
      claimRow("a-oct5-0000", "r-oct5", OCT_5.start),
      claimRow("b-oct19", "r-oct19", OCT_19.start),
    ],
    pay_adjustments: [
      adjustmentRow("adj-oct5", "r-oct5", OCT_5.start),
      adjustmentRow("adj-oct19", "r-oct19", OCT_19.start),
    ],
    employees: [
      employeeRow("ana", {
        full_name: "Ana Costa",
        default_payout_method: "e-Transfer",
        e_transfer_contact: "ana@example.com",
      }),
      employeeRow("bea", { full_name: "Beatriz Lima", is_active: false }),
      employeeRow("carla", { full_name: "Carla Mendes", is_archived: true }),
    ],
    clock_corrections: [
      correctionRow("cc-1", "a-oct5-0001"),
      correctionRow("cc-2", "a-oct5-0001"),
      correctionRow("cc-3", "a-oct5-1150"),
      correctionRow("cc-4", "b-oct19"),
    ],
  };
}

describe("fetchPayPeriodData", () => {
  it("reads every pay view row of the period, past the 1000-row cap", async () => {
    const fake = createFakeSupabase(tables());

    const data = await fetchPayPeriodData(fake.db, OCT_5.start);

    assert.equal(data.sessions.length, SESSION_COUNT);
    assert.ok(data.sessions.every((row) => row.period_start === OCT_5.start));
  });

  it("reads only the period's runs, claims and Adjustments", async () => {
    const fake = createFakeSupabase(tables());

    const data = await fetchPayPeriodData(fake.db, OCT_5.start);

    assert.deepEqual(
      data.runs.map((item) => item.id),
      ["r-oct5"],
    );
    assert.deepEqual(data.runLines, [
      {
        pay_run_id: "r-oct5",
        appointment_employee_id: "a-oct5-0000",
        scheduled_date: "2026-10-08",
        client_name: "Patel residence",
        job_name: "Standard clean",
        minutes: 180,
        rate_cents: 2000,
        amount_cents: 6000,
      },
    ]);
    assert.deepEqual(data.adjustments, [
      {
        id: "adj-oct5",
        pay_run_id: "r-oct5",
        amount_cents: 1500,
        reason: "Gas money",
        appointment_employee_id: null,
        created_at: "2026-10-19T15:00:00Z",
      },
    ]);
  });

  it("returns each Cleaner's default Payout method and e-Transfer contact", async () => {
    const fake = createFakeSupabase(tables());

    const { cleaners } = await fetchPayPeriodData(fake.db, OCT_5.start);

    assert.deepEqual(cleaners, [
      {
        id: "ana",
        fullName: "Ana Costa",
        isActive: true,
        defaultPayoutMethod: "e-Transfer",
        eTransferContact: "ana@example.com",
      },
      {
        id: "bea",
        fullName: "Beatriz Lima",
        isActive: false,
        defaultPayoutMethod: null,
        eTransferContact: null,
      },
      {
        id: "carla",
        fullName: "Carla Mendes",
        isActive: false,
        defaultPayoutMethod: null,
        eTransferContact: null,
      },
    ]);
  });

  it("marks the period's sessions that have a Clock correction as edited", async () => {
    const fake = createFakeSupabase(tables());

    const data = await fetchPayPeriodData(fake.db, OCT_5.start);

    assert.deepEqual([...data.editedSessionIds].sort(), [
      "a-oct5-0001",
      "a-oct5-1150",
    ]);
  });

  it("throws when a read fails", async () => {
    const fake = createFakeSupabase(tables(), ["pay_adjustments"]);

    await assert.rejects(fetchPayPeriodData(fake.db, OCT_5.start), {
      message: "connection reset",
    });
  });
});

describe("fetchPayPeriodsOverview", () => {
  it("reads every period from the Payroll start through the running one", async () => {
    const fake = createFakeSupabase({
      ...tables(),
      pay_period_sessions: [
        session("a-oct5", "ana"),
        session("b-oct19", "ana", { period_start: OCT_19.start }),
        session("c-nov2", "ana", { period_start: NOV_2 }),
        session("d-nov16", "ana", { period_start: NOV_16 }),
      ],
    });

    const data = await fetchPayPeriodsOverview(fake.db, NOV_3);

    assert.deepEqual(
      data.sessions.map((row) => row.appointment_employee_id).sort(),
      ["a-oct5", "b-oct19", "c-nov2"],
    );
    assert.deepEqual(data.runs.map((item) => item.id).sort(), [
      "r-oct19",
      "r-oct5",
    ]);
    assert.equal(data.runLines.length, 2);
    assert.equal(data.adjustments.length, 2);
    assert.equal(data.cleaners.length, 3);
  });

  it("throws when a read fails", async () => {
    const fake = createFakeSupabase(tables(), ["pay_period_sessions"]);

    await assert.rejects(fetchPayPeriodsOverview(fake.db, NOV_3));
  });
});

describe("fetchMyPaidRuns", () => {
  it("reads every row of the three My pay views, past the 1000-row cap", async () => {
    const lineIds = seedIds("line", SESSION_COUNT);
    const fake = createFakeSupabase({
      pay_runs_employee_view: [
        {
          id: "r-oct5",
          period_start: OCT_5.start,
          kind: "regular",
          paid_on: "2026-10-20",
          payout_method: "Cash",
          total_cents: 6000,
        },
      ],
      pay_run_lines_employee_view: lineIds.map((id) => ({
        id,
        pay_run_id: "r-oct5",
        scheduled_date: "2026-10-08",
        client_name: "Patel residence",
        minutes: 180,
        rate_cents: 2000,
        amount_cents: 6000,
      })),
      pay_adjustments_employee_view: [
        {
          id: "adj-1",
          pay_run_id: "r-oct5",
          amount_cents: 1500,
          reason: "Gas money",
          linked_scheduled_date: null,
          linked_client_name: null,
          created_at: "2026-10-19T15:00:00Z",
        },
      ],
    });

    const data = await fetchMyPaidRuns(fake.db);

    assert.deepEqual(
      data.runs.map((row) => row.id),
      ["r-oct5"],
    );
    assert.equal(data.lines.length, SESSION_COUNT);
    assert.deepEqual(
      data.adjustments.map((row) => row.reason),
      ["Gas money"],
    );
  });

  it("throws when a view fails to load, for the error boundary", async () => {
    const fake = createFakeSupabase({}, ["pay_run_lines_employee_view"]);

    await assert.rejects(fetchMyPaidRuns(fake.db));
  });
});
