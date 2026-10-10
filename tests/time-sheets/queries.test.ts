import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fetchAdminSessions,
  fetchAppointmentCrew,
  fetchCleanerSessions,
} from "../../src/lib/time-sheets/queries.ts";
import { createFakeSupabase } from "./fake-supabase.ts";

const LIVE_COUNT = 1500;
const EXCLUDED_EACH = 300;
const WEEK = { from: "2026-10-12", to: "2026-10-18" };
const MONTH = { start: "2026-10-01", end: "2026-10-31" };
const BIA_ID = "b1a00000-0000-4000-8000-000000000002";

type AdminSeed = {
  id: string;
  employeeId?: string;
  isArchived?: boolean | null;
  date?: string;
  status?: string;
  isVisitArchived?: boolean;
};

function adminRow(seed: AdminSeed) {
  const employeeId = seed.employeeId ?? "ana";
  return {
    id: seed.id,
    employee_id: employeeId,
    is_archived: seed.isArchived ?? false,
    clocked_in_at: null,
    clocked_out_at: null,
    appointment: {
      id: `visit-${seed.id}`,
      scheduled_date: seed.date ?? "2026-10-14",
      scheduled_start_time: "09:00:00",
      scheduled_end_time: "12:00:00",
      status: seed.status ?? "scheduled",
      manually_completed: false,
      is_archived: seed.isVisitArchived ?? false,
      client: { name: "Maple House" },
      job: { name: "Weekly clean" },
    },
    employee: { id: employeeId, full_name: employeeId },
    clock_corrections: [],
    odd_duration_acknowledgements: [],
  };
}

function seedIds(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}-${String(index).padStart(4, "0")}`);
}

// Excluded rows sort first, so a fetcher that filtered after reading would need extra pages.
function adminTable() {
  return [
    ...seedIds("a-archived", EXCLUDED_EACH).map((id) => adminRow({ id, isArchived: true })),
    ...seedIds("b-cancelled", EXCLUDED_EACH).map((id) => adminRow({ id, status: "cancelled" })),
    ...seedIds("c-visit-archived", EXCLUDED_EACH).map((id) => adminRow({ id, isVisitArchived: true })),
    ...seedIds("d-before", EXCLUDED_EACH / 2).map((id) => adminRow({ id, date: "2026-10-11" })),
    ...seedIds("d-after", EXCLUDED_EACH / 2).map((id) => adminRow({ id, date: "2026-10-19" })),
    adminRow({ id: "e-null-archived", isArchived: null }),
    adminRow({ id: "e-first-day", date: WEEK.from }),
    adminRow({ id: "e-last-day", date: WEEK.to }),
    adminRow({ id: "e-bia", employeeId: BIA_ID }),
    ...seedIds("f-live", LIVE_COUNT).map((id) => adminRow({ id })),
  ];
}

describe("fetchAdminSessions", () => {
  it("reads every live session in the range past the 1000-row cap", async () => {
    const fake = createFakeSupabase({ appointment_employees: adminTable() });

    const rows = await fetchAdminSessions(fake.db, WEEK);

    assert.equal(rows.length, LIVE_COUNT + 4);
    assert.equal(new Set(rows.map((row) => row.id)).size, rows.length);
  });

  it("leaves out archived assignments, archived visits, cancelled visits and other dates", async () => {
    const fake = createFakeSupabase({ appointment_employees: adminTable() });

    const ids = (await fetchAdminSessions(fake.db, WEEK)).map((row) => row.id);

    assert.deepEqual(
      ids.filter((id) => !id.startsWith("f-live")),
      ["e-bia", "e-first-day", "e-last-day", "e-null-archived"],
    );
  });

  it("filters in the query, so only matching rows are paged through", async () => {
    const fake = createFakeSupabase({ appointment_employees: adminTable() });

    await fetchAdminSessions(fake.db, WEEK);

    assert.deepEqual(
      fake.requests.map((request) => request.range),
      [
        [0, 999],
        [1000, 1999],
      ],
    );
  });

  it("narrows to one Cleaner when given", async () => {
    const fake = createFakeSupabase({ appointment_employees: adminTable() });

    const rows = await fetchAdminSessions(fake.db, WEEK, BIA_ID);

    assert.deepEqual(
      rows.map((row) => row.id),
      ["e-bia"],
    );
  });

  it("treats a blank Cleaner id as no filter", async () => {
    for (const blank of ["", "   "]) {
      const fake = createFakeSupabase({ appointment_employees: adminTable() });

      const rows = await fetchAdminSessions(fake.db, WEEK, blank);

      assert.equal(rows.length, LIVE_COUNT + 4, JSON.stringify(blank));
    }
  });

  it("returns no sessions, without querying, for a Cleaner id that isn't a UUID", async () => {
    const fake = createFakeSupabase({ appointment_employees: adminTable() });

    const rows = await fetchAdminSessions(fake.db, WEEK, "abc");

    assert.deepEqual(rows, []);
    assert.equal(fake.requests.length, 0);
  });

  it("stops after one request when the first page is short", async () => {
    const fake = createFakeSupabase({ appointment_employees: [adminRow({ id: "only" })] });

    const rows = await fetchAdminSessions(fake.db, WEEK);

    assert.equal(rows.length, 1);
    assert.equal(fake.requests.length, 1);
  });

  it("throws when the read fails", async () => {
    const fake = createFakeSupabase({}, ["appointment_employees"]);

    await assert.rejects(fetchAdminSessions(fake.db, WEEK));
  });
});

type CleanerSeed = {
  id: string;
  employeeId?: string;
  clockIn?: string | null;
  isArchived?: boolean;
  date?: string;
  status?: string;
  isVisitArchived?: boolean | null;
};

function cleanerRow(seed: CleanerSeed) {
  return {
    id: seed.id,
    employee_id: seed.employeeId ?? "ana",
    is_archived: seed.isArchived ?? false,
    clocked_in_at: seed.clockIn === undefined ? "2026-10-14T13:00:00+00:00" : seed.clockIn,
    clocked_out_at: null,
    appointments: {
      scheduled_date: seed.date ?? "2026-10-14",
      status: seed.status ?? "completed",
      is_archived: seed.isVisitArchived === undefined ? false : seed.isVisitArchived,
      clients: { name: "Maple House" },
      jobs: { name: "Weekly clean" },
    },
  };
}

function cleanerTable() {
  return [
    ...seedIds("a-archived", EXCLUDED_EACH).map((id) => cleanerRow({ id, isArchived: true })),
    ...seedIds("b-cancelled", EXCLUDED_EACH).map((id) => cleanerRow({ id, status: "cancelled" })),
    ...seedIds("c-visit-archived", EXCLUDED_EACH).map((id) =>
      cleanerRow({ id, isVisitArchived: true }),
    ),
    ...seedIds("d-unclocked", EXCLUDED_EACH).map((id) => cleanerRow({ id, clockIn: null })),
    cleanerRow({ id: "e-before", date: "2026-09-30" }),
    cleanerRow({ id: "e-after", date: "2026-11-01" }),
    cleanerRow({ id: "e-bia", employeeId: "bia" }),
    cleanerRow({ id: "e-visit-archived-null", isVisitArchived: null }),
    ...seedIds("f-live", LIVE_COUNT).map((id) => cleanerRow({ id })),
  ];
}

describe("fetchCleanerSessions", () => {
  it("reads every clocked session of hers in the month past the 1000-row cap", async () => {
    const fake = createFakeSupabase({ appointment_employees_employee_view: cleanerTable() });

    const records = await fetchCleanerSessions(fake.db, "ana", MONTH);

    assert.equal(records.length, LIVE_COUNT + 1);
    assert.equal(new Set(records.map((record) => record.id)).size, records.length);
  });

  it("leaves out unclocked, archived, cancelled, other-month and other-Cleaner rows", async () => {
    const fake = createFakeSupabase({ appointment_employees_employee_view: cleanerTable() });

    const ids = (await fetchCleanerSessions(fake.db, "ana", MONTH)).map((record) => record.id);

    assert.deepEqual(
      ids.filter((id) => !id.startsWith("f-live")),
      ["e-visit-archived-null"],
    );
  });

  it("filters in the query, so only matching rows are paged through", async () => {
    const fake = createFakeSupabase({ appointment_employees_employee_view: cleanerTable() });

    await fetchCleanerSessions(fake.db, "ana", MONTH);

    assert.deepEqual(
      fake.requests.map((request) => request.range),
      [
        [0, 999],
        [1000, 1999],
      ],
    );
  });

  it("returns the time-sheet record shape", async () => {
    const fake = createFakeSupabase({
      appointment_employees_employee_view: [cleanerRow({ id: "only" })],
    });

    const [record] = await fetchCleanerSessions(fake.db, "ana", MONTH);

    assert.equal(record.id, "only");
    assert.equal(record.clocked_in_at, "2026-10-14T13:00:00+00:00");
    assert.equal(record.appointments.scheduled_date, "2026-10-14");
    assert.equal(record.appointments.clients.name, "Maple House");
    assert.equal(record.appointments.jobs.name, "Weekly clean");
  });

  it("throws when the read fails", async () => {
    const fake = createFakeSupabase({}, ["appointment_employees_employee_view"]);

    await assert.rejects(fetchCleanerSessions(fake.db, "ana", MONTH));
  });
});

const VISIT_ID = "a1000000-0000-4000-8000-000000000001";

function crewRow(id: string, appointmentId: string, isArchived: boolean | null = false) {
  return { ...adminRow({ id, isArchived }), appointment_id: appointmentId, admin_notes: "" };
}

describe("fetchAppointmentCrew", () => {
  it("reads the visit's live crew, leaving out archived assignments and other visits", async () => {
    const fake = createFakeSupabase({
      appointment_employees: [
        crewRow("c-live", VISIT_ID),
        crewRow("a-archived", VISIT_ID, true),
        crewRow("b-null-archived", VISIT_ID, null),
        crewRow("d-other-visit", "other-visit"),
      ],
    });

    const rows = await fetchAppointmentCrew(fake.db, VISIT_ID);

    assert.deepEqual(
      rows.map((row) => row.id),
      ["b-null-archived", "c-live"],
    );
  });

  it("throws when the read fails", async () => {
    const fake = createFakeSupabase({}, ["appointment_employees"]);

    await assert.rejects(fetchAppointmentCrew(fake.db, VISIT_ID));
  });
});
