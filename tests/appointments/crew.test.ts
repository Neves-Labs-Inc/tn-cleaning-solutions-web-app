import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  hasSessionHistory,
  planCrewChange,
  planFutureVisitCleanup,
  type ExistingAssignment,
} from "../../src/lib/appointments/crew.ts";

function assignment(
  overrides: Partial<ExistingAssignment> & Pick<ExistingAssignment, "id" | "employee_id">,
): ExistingAssignment {
  return { is_archived: false, hasHistory: false, ...overrides };
}

describe("planCrewChange", () => {
  it("archives a removed Cleaner whose session has history", () => {
    const plan = planCrewChange(
      [assignment({ id: "row-ana", employee_id: "ana", hasHistory: true })],
      [],
    );

    assert.deepEqual(plan, {
      archiveIds: ["row-ana"],
      deleteIds: [],
      insertEmployeeIds: [],
    });
  });

  it("deletes a removed Cleaner who never clocked and was never edited", () => {
    const plan = planCrewChange(
      [assignment({ id: "row-ana", employee_id: "ana" })],
      [],
    );

    assert.deepEqual(plan, {
      archiveIds: [],
      deleteIds: ["row-ana"],
      insertEmployeeIds: [],
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
    );

    assert.deepEqual(plan, {
      archiveIds: [],
      deleteIds: [],
      insertEmployeeIds: ["ana"],
    });
  });

  it("leaves live rows of submitted Cleaners untouched and adds new ones", () => {
    const plan = planCrewChange(
      [
        assignment({ id: "row-ana", employee_id: "ana", hasHistory: true }),
        assignment({ id: "row-bea", employee_id: "bea" }),
      ],
      ["ana", "bea", "cleo"],
    );

    assert.deepEqual(plan, {
      archiveIds: [],
      deleteIds: [],
      insertEmployeeIds: ["cleo"],
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
    );

    assert.deepEqual(plan, {
      archiveIds: [],
      deleteIds: [],
      insertEmployeeIds: [],
    });
  });

  it("treats a NULL archived flag as a live row", () => {
    const plan = planCrewChange(
      [assignment({ id: "row-ana", employee_id: "ana", is_archived: null })],
      ["ana"],
    );

    assert.deepEqual(plan, {
      archiveIds: [],
      deleteIds: [],
      insertEmployeeIds: [],
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
    );

    assert.deepEqual(plan, {
      archiveIds: ["row-ana"],
      deleteIds: ["row-bea"],
      insertEmployeeIds: ["dina"],
    });
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

  it("deletes scheduled visits nobody clocked or edited", () => {
    const plan = planFutureVisitCleanup([
      { id: "visit-1", scheduled_date: "2026-10-20", assignments: [untouched] },
      { id: "visit-2", scheduled_date: "2026-10-27", assignments: [] },
    ]);

    assert.deepEqual(plan, {
      deleteIds: ["visit-1", "visit-2"],
      preservedDates: [],
    });
  });

  it("keeps a visit with a clock correction and preserves its date", () => {
    const plan = planFutureVisitCleanup([
      {
        id: "visit-1",
        scheduled_date: "2026-10-20",
        assignments: [untouched, { ...untouched, correctionCount: 2 }],
      },
      { id: "visit-2", scheduled_date: "2026-10-27", assignments: [untouched] },
    ]);

    assert.deepEqual(plan, {
      deleteIds: ["visit-2"],
      preservedDates: ["2026-10-20"],
    });
  });

  it("keeps a visit whose archived assignment still holds clocks", () => {
    const plan = planFutureVisitCleanup([
      {
        id: "visit-1",
        scheduled_date: "2026-10-20",
        assignments: [{ ...untouched, clocked_in_at: "2026-10-20T13:00:00Z" }],
      },
    ]);

    assert.deepEqual(plan, {
      deleteIds: [],
      preservedDates: ["2026-10-20"],
    });
  });

  it("keeps a visit with an odd-duration acknowledgement", () => {
    const plan = planFutureVisitCleanup([
      {
        id: "visit-1",
        scheduled_date: "2026-10-20",
        assignments: [{ ...untouched, acknowledgementCount: 1 }],
      },
    ]);

    assert.deepEqual(plan, {
      deleteIds: [],
      preservedDates: ["2026-10-20"],
    });
  });
});
