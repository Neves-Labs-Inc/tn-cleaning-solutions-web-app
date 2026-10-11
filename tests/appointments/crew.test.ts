import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  hasSessionHistory,
  planCrewChange,
  planFutureVisitCleanup,
  preservedSeriesDates,
  type ExistingAssignment,
  type FutureVisit,
} from "../../src/lib/appointments/crew.ts";

function assignment(
  overrides: Partial<ExistingAssignment> & Pick<ExistingAssignment, "id" | "employee_id">,
): ExistingAssignment {
  return { is_archived: false, hasHistory: false, hasClockIn: false, ...overrides };
}

const SCHEDULED = { status: "scheduled", manually_completed: false } as const;
const COMPLETED = { status: "completed", manually_completed: false } as const;

describe("planCrewChange", () => {
  it("archives a removed Cleaner whose session has history", () => {
    const plan = planCrewChange(
      [assignment({ id: "row-ana", employee_id: "ana", hasHistory: true })],
      [],
      SCHEDULED,
    );

    assert.deepEqual(plan, {
      archiveIds: ["row-ana"],
      deleteIds: [],
      insertEmployeeIds: [],
      shouldTurnOnManualCompletion: false,
    });
  });

  it("deletes a removed Cleaner who never clocked and was never edited", () => {
    const plan = planCrewChange(
      [assignment({ id: "row-ana", employee_id: "ana" })],
      [],
      SCHEDULED,
    );

    assert.deepEqual(plan, {
      archiveIds: [],
      deleteIds: ["row-ana"],
      insertEmployeeIds: [],
      shouldTurnOnManualCompletion: false,
    });
  });

  it("inserts a fresh row for a re-added Cleaner whose only row is archived", () => {
    const plan = planCrewChange(
      [
        assignment({
          id: "row-ana-old",
          employee_id: "ana",
          is_archived: true,
          hasHistory: true,
        }),
      ],
      ["ana"],
      SCHEDULED,
    );

    assert.deepEqual(plan, {
      archiveIds: [],
      deleteIds: [],
      insertEmployeeIds: ["ana"],
      shouldTurnOnManualCompletion: false,
    });
  });

  it("leaves live rows of submitted Cleaners untouched and adds new ones", () => {
    const plan = planCrewChange(
      [
        assignment({ id: "row-ana", employee_id: "ana", hasHistory: true }),
        assignment({ id: "row-bea", employee_id: "bea" }),
      ],
      ["ana", "bea", "cleo"],
      SCHEDULED,
    );

    assert.deepEqual(plan, {
      archiveIds: [],
      deleteIds: [],
      insertEmployeeIds: ["cleo"],
      shouldTurnOnManualCompletion: false,
    });
  });

  it("never archives or deletes an already archived row", () => {
    const plan = planCrewChange(
      [
        assignment({
          id: "row-ana-old",
          employee_id: "ana",
          is_archived: true,
          hasHistory: true,
        }),
        assignment({ id: "row-bea-old", employee_id: "bea", is_archived: true }),
      ],
      [],
      SCHEDULED,
    );

    assert.deepEqual(plan, {
      archiveIds: [],
      deleteIds: [],
      insertEmployeeIds: [],
      shouldTurnOnManualCompletion: false,
    });
  });

  it("treats a NULL archived flag as a live row", () => {
    const plan = planCrewChange(
      [assignment({ id: "row-ana", employee_id: "ana", is_archived: null })],
      ["ana"],
      SCHEDULED,
    );

    assert.deepEqual(plan, {
      archiveIds: [],
      deleteIds: [],
      insertEmployeeIds: [],
      shouldTurnOnManualCompletion: false,
    });
  });

  it("splits a mixed crew change into archive, delete and insert", () => {
    const plan = planCrewChange(
      [
        assignment({ id: "row-ana", employee_id: "ana", hasHistory: true }),
        assignment({ id: "row-bea", employee_id: "bea" }),
        assignment({ id: "row-cleo", employee_id: "cleo" }),
      ],
      ["cleo", "dina"],
      SCHEDULED,
    );

    assert.deepEqual(plan, {
      archiveIds: ["row-ana"],
      deleteIds: ["row-bea"],
      insertEmployeeIds: ["dina"],
      shouldTurnOnManualCompletion: false,
    });
  });
});

describe("planCrewChange Manual completion", () => {
  const clockedAna = assignment({
    id: "row-ana",
    employee_id: "ana",
    hasHistory: true,
    hasClockIn: true,
  });
  const clockedBea = assignment({
    id: "row-bea",
    employee_id: "bea",
    hasHistory: true,
    hasClockIn: true,
  });

  it("turns on when the last Cleaner with clocks leaves a completed appointment", () => {
    const plan = planCrewChange([clockedAna], ["cleo"], COMPLETED);

    assert.equal(plan.shouldTurnOnManualCompletion, true);
  });

  it("stays off while one Cleaner with clocks remains", () => {
    const plan = planCrewChange([clockedAna, clockedBea], ["bea"], COMPLETED);

    assert.equal(plan.shouldTurnOnManualCompletion, false);
  });

  it("stays off when the appointment is already a Manual completion", () => {
    const plan = planCrewChange([clockedAna], [], {
      status: "completed",
      manually_completed: true,
    });

    assert.equal(plan.shouldTurnOnManualCompletion, false);
  });

  it("stays off when the appointment isn't completed", () => {
    const plan = planCrewChange([clockedAna], [], {
      status: "in_progress",
      manually_completed: false,
    });

    assert.equal(plan.shouldTurnOnManualCompletion, false);
  });

  it("ignores an archived row's clocks when deciding", () => {
    const plan = planCrewChange(
      [{ ...clockedBea, is_archived: true }, clockedAna],
      ["bea"],
      COMPLETED,
    );

    assert.equal(plan.shouldTurnOnManualCompletion, true);
  });

  it("stays off when only a Cleaner who never clocked is removed", () => {
    const plan = planCrewChange(
      [clockedAna, assignment({ id: "row-bea", employee_id: "bea" })],
      ["ana", "cleo"],
      COMPLETED,
    );

    assert.equal(plan.shouldTurnOnManualCompletion, false);
  });
});

describe("hasSessionHistory", () => {
  const untouched = {
    clocked_in_at: null,
    clocked_out_at: null,
    correctionCount: 0,
    acknowledgementCount: 0,
  };

  it("is false for a session nobody clocked or edited", () => {
    assert.equal(hasSessionHistory(untouched), false);
  });

  it("is true once the Cleaner clocked in", () => {
    assert.equal(
      hasSessionHistory({ ...untouched, clocked_in_at: "2026-10-09T13:00:00Z" }),
      true,
    );
  });

  it("is true when only a clock-out is set", () => {
    assert.equal(
      hasSessionHistory({ ...untouched, clocked_out_at: "2026-10-09T16:00:00Z" }),
      true,
    );
  });

  it("is true when an admin correction cleared both clocks", () => {
    assert.equal(hasSessionHistory({ ...untouched, correctionCount: 1 }), true);
  });

  it("is true when an odd duration was acknowledged", () => {
    assert.equal(
      hasSessionHistory({ ...untouched, acknowledgementCount: 1 }),
      true,
    );
  });
});

describe("planFutureVisitCleanup", () => {
  const untouched = {
    clocked_in_at: null,
    clocked_out_at: null,
    correctionCount: 0,
    acknowledgementCount: 0,
  };

  function laterAppointment(
    overrides: Partial<FutureVisit> & Pick<FutureVisit, "id" | "scheduled_date">,
  ): FutureVisit {
    return {
      status: "scheduled",
      manually_completed: false,
      hasInvoiceLine: false,
      assignments: [],
      ...overrides,
    };
  }

  it("deletes scheduled appointments nobody clocked, edited or billed", () => {
    const plan = planFutureVisitCleanup([
      laterAppointment({ id: "visit-1", scheduled_date: "2026-10-20", assignments: [untouched] }),
      laterAppointment({ id: "visit-2", scheduled_date: "2026-10-27" }),
    ]);

    assert.deepEqual(plan, {
      deleteIds: ["visit-1", "visit-2"],
      preservedDates: [],
    });
  });

  it("keeps a completed appointment and preserves its date", () => {
    const plan = planFutureVisitCleanup([
      laterAppointment({ id: "visit-1", scheduled_date: "2026-10-20", status: "completed" }),
      laterAppointment({ id: "visit-2", scheduled_date: "2026-10-27" }),
    ]);

    assert.deepEqual(plan, {
      deleteIds: ["visit-2"],
      preservedDates: ["2026-10-20"],
    });
  });

  it("keeps a cancelled appointment and preserves its date", () => {
    const plan = planFutureVisitCleanup([
      laterAppointment({ id: "visit-1", scheduled_date: "2026-10-20", status: "cancelled" }),
    ]);

    assert.deepEqual(plan, { deleteIds: [], preservedDates: ["2026-10-20"] });
  });

  it("keeps an in-progress appointment so its date gets no twin", () => {
    const plan = planFutureVisitCleanup([
      laterAppointment({ id: "visit-1", scheduled_date: "2026-10-20", status: "in_progress" }),
    ]);

    assert.deepEqual(plan, { deleteIds: [], preservedDates: ["2026-10-20"] });
  });

  it("keeps a manually completed appointment", () => {
    const plan = planFutureVisitCleanup([
      laterAppointment({
        id: "visit-1",
        scheduled_date: "2026-10-20",
        status: "completed",
        manually_completed: true,
      }),
    ]);

    assert.deepEqual(plan, { deleteIds: [], preservedDates: ["2026-10-20"] });
  });

  it("keeps a scheduled appointment flagged manually completed", () => {
    const plan = planFutureVisitCleanup([
      laterAppointment({ id: "visit-1", scheduled_date: "2026-10-20", manually_completed: true }),
    ]);

    assert.deepEqual(plan, { deleteIds: [], preservedDates: ["2026-10-20"] });
  });

  it("keeps a scheduled appointment with an invoice line and preserves its date", () => {
    const plan = planFutureVisitCleanup([
      laterAppointment({ id: "visit-1", scheduled_date: "2026-10-20", hasInvoiceLine: true }),
      laterAppointment({ id: "visit-2", scheduled_date: "2026-10-27" }),
    ]);

    assert.deepEqual(plan, {
      deleteIds: ["visit-2"],
      preservedDates: ["2026-10-20"],
    });
  });

  it("keeps an appointment with a clock correction and preserves its date", () => {
    const plan = planFutureVisitCleanup([
      laterAppointment({
        id: "visit-1",
        scheduled_date: "2026-10-20",
        assignments: [untouched, { ...untouched, correctionCount: 2 }],
      }),
      laterAppointment({ id: "visit-2", scheduled_date: "2026-10-27", assignments: [untouched] }),
    ]);

    assert.deepEqual(plan, {
      deleteIds: ["visit-2"],
      preservedDates: ["2026-10-20"],
    });
  });

  it("keeps an appointment whose archived assignment still holds clocks", () => {
    const plan = planFutureVisitCleanup([
      laterAppointment({
        id: "visit-1",
        scheduled_date: "2026-10-20",
        assignments: [{ ...untouched, clocked_in_at: "2026-10-20T13:00:00Z" }],
      }),
    ]);

    assert.deepEqual(plan, { deleteIds: [], preservedDates: ["2026-10-20"] });
  });

  it("keeps an appointment with an odd-duration acknowledgement", () => {
    const plan = planFutureVisitCleanup([
      laterAppointment({
        id: "visit-1",
        scheduled_date: "2026-10-20",
        assignments: [{ ...untouched, acknowledgementCount: 1 }],
      }),
    ]);

    assert.deepEqual(plan, { deleteIds: [], preservedDates: ["2026-10-20"] });
  });
});

describe("preservedSeriesDates", () => {
  const laterAppointments = [
    { id: "visit-1", scheduled_date: "2026-10-20" },
    { id: "visit-2", scheduled_date: "2026-10-27" },
    { id: "visit-3", scheduled_date: "2026-11-03" },
  ];

  it("keeps the date of a planned delete the function skipped", () => {
    const dates = preservedSeriesDates(
      { deleteIds: ["visit-1", "visit-2"], preservedDates: [] },
      laterAppointments,
      new Set(["visit-2"]),
    );

    assert.deepEqual([...dates], ["2026-10-20"]);
  });

  it("frees the date of every planned delete that went through", () => {
    const dates = preservedSeriesDates(
      { deleteIds: ["visit-1", "visit-2"], preservedDates: [] },
      laterAppointments,
      new Set(["visit-1", "visit-2"]),
    );

    assert.deepEqual([...dates], []);
  });

  it("keeps the dates the plan already preserved", () => {
    const dates = preservedSeriesDates(
      { deleteIds: ["visit-2"], preservedDates: ["2026-11-03"] },
      laterAppointments,
      new Set(),
    );

    assert.deepEqual([...dates].sort(), ["2026-10-27", "2026-11-03"]);
  });
});
