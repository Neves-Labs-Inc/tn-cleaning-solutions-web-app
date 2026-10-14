import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  describeSkippedDrafts,
  getAddCleanerCandidates,
  getAdjustmentAccess,
  getRunActionKind,
} from "../../src/lib/payroll/period-actions.ts";
import {
  buildPeriodView,
  type PeriodRun,
} from "../../src/lib/payroll/period-view.ts";
import {
  ANA,
  CARLA,
  claimed,
  cleaner,
  MARIA,
  missingClock,
  noRate,
  NOW,
  OCT_5,
  payrollData,
  run,
  session,
} from "./fixtures.ts";
import type { PayrollData } from "../../src/lib/payroll/payroll-data.ts";

function runsOf(overrides: Partial<PayrollData>): PeriodRun[] {
  return buildPeriodView(payrollData(overrides), OCT_5, NOW).runs;
}

function only<T>(items: T[]): T {
  assert.equal(items.length, 1, `expected one item, got ${items.length}`);
  return items[0];
}

// Ana's regular run finalized with one shift, plus an off-cycle run in the given status.
function withOffCycle(status: "draft" | "finalized" | "paid"): PeriodRun[] {
  const regular = run("r-ana", "ana", { status: "finalized" });
  const offCycle = run("r-off", "ana", { kind: "off_cycle", status });
  return runsOf({
    sessions: [claimed(session("s1", "ana"), regular)],
    runs: [regular, offCycle],
  });
}

function findRun(runs: PeriodRun[], kind: PeriodRun["kind"]): PeriodRun {
  return only(runs.filter((item) => item.kind === kind));
}

describe("getRunActionKind", () => {
  it("disables Finalize for a draft with a Missing clock", () => {
    const carla = only(runsOf({ sessions: [missingClock("s1", "carla")] }));

    assert.equal(getRunActionKind(carla, true, false), "draft_blocked");
  });

  it("keeps Finalize for a draft with only an Odd duration", () => {
    const ana = only(
      runsOf({ sessions: [session("s1", "ana", { is_odd_duration: true })] }),
    );

    assert.equal(getRunActionKind(ana, true, false), "draft_ready");
  });

  it("offers nothing but a disabled Finalize while the period runs", () => {
    const ana = only(runsOf({ sessions: [session("s1", "ana")] }));

    assert.equal(getRunActionKind(ana, false, false), "running");
  });

  it("offers Remove from period on an empty added draft", () => {
    const ana = only(runsOf({ runs: [run("r-ana", "ana")] }));

    assert.equal(getRunActionKind(ana, true, false), "draft_empty_added");
  });

  it("offers Undo finalize on a finalized regular run with no off-cycle run", () => {
    const regular = run("r-ana", "ana", { status: "finalized" });
    const ana = only(
      runsOf({
        sessions: [claimed(session("s1", "ana"), regular)],
        runs: [regular],
      }),
    );

    assert.equal(getRunActionKind(ana, true, false), "finalized");
  });

  it("blocks Undo finalize on a regular run once an off-cycle run exists", () => {
    const regular = findRun(withOffCycle("paid"), "regular");

    assert.equal(
      getRunActionKind(regular, true, true),
      "finalized_undo_blocked",
    );
  });

  it("still offers Undo finalize on the off-cycle run itself", () => {
    const offCycle = findRun(withOffCycle("finalized"), "off_cycle");

    assert.equal(getRunActionKind(offCycle, true, true), "finalized");
  });

  it("offers nothing on a paid run", () => {
    const paid = run("r-ana", "ana", { status: "paid" });
    const ana = only(runsOf({ runs: [paid] }));

    assert.equal(getRunActionKind(ana, true, false), "paid");
  });
});

describe("getAdjustmentAccess", () => {
  it("sends new Adjustments to the unpaid off-cycle run, not the finalized regular one", () => {
    const runs = withOffCycle("draft");

    assert.deepEqual(
      getAdjustmentAccess(findRun(runs, "regular"), true, true),
      { canAdd: false, canDelete: true },
    );
    assert.deepEqual(
      getAdjustmentAccess(findRun(runs, "off_cycle"), true, true),
      { canAdd: true, canDelete: true },
    );
  });

  it("lets the regular run take Adjustments again once the off-cycle run is paid", () => {
    const regular = findRun(withOffCycle("paid"), "regular");

    assert.deepEqual(getAdjustmentAccess(regular, true, false), {
      canAdd: true,
      canDelete: true,
    });
  });

  it("allows no Adjustment changes while the period runs", () => {
    const ana = only(runsOf({ sessions: [session("s1", "ana")] }));

    assert.deepEqual(getAdjustmentAccess(ana, false, false), {
      canAdd: false,
      canDelete: false,
    });
  });

  it("allows no Adjustment changes on a paid run", () => {
    const ana = only(
      runsOf({ runs: [run("r-ana", "ana", { status: "paid" })] }),
    );

    assert.deepEqual(getAdjustmentAccess(ana, true, false), {
      canAdd: false,
      canDelete: false,
    });
  });
});

describe("describeSkippedDrafts", () => {
  it("names each blocked draft with its reason and leaves out ready ones", () => {
    const runs = runsOf({
      sessions: [
        session("s1", "ana"),
        missingClock("s2", "carla"),
        noRate("s3", "maria"),
      ],
    });

    assert.equal(
      describeSkippedDrafts(runs),
      "2 blocked, will be skipped: Carla (1 Missing clock), Maria (no Pay rate)",
    );
  });

  it("is null when no selected draft is blocked", () => {
    const runs = runsOf({ sessions: [session("s1", "ana")] });

    assert.equal(describeSkippedDrafts(runs), null);
  });
});

describe("getAddCleanerCandidates", () => {
  it("lists Cleaners with no run, active ones first, then by name", () => {
    const zoe = cleaner("zoe", "Zoe Alves");
    const inactiveCarla = { ...CARLA, isActive: false };
    const runs = runsOf({
      cleaners: [ANA, inactiveCarla, MARIA, zoe],
      sessions: [session("s1", "ana")],
    });

    assert.deepEqual(
      getAddCleanerCandidates([ANA, inactiveCarla, zoe, MARIA], runs),
      [
        { id: "maria", name: "Maria Silva", isActive: true },
        { id: "zoe", name: "Zoe Alves", isActive: true },
        { id: "carla", name: "Carla Mendes", isActive: false },
      ],
    );
  });

  it("is empty when everyone already has a run", () => {
    const runs = runsOf({
      sessions: [
        session("s1", "ana"),
        session("s2", "carla"),
        session("s3", "maria"),
      ],
    });

    assert.deepEqual(getAddCleanerCandidates([ANA, CARLA, MARIA], runs), []);
  });
});
