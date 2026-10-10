import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildSessionView } from "../../src/lib/time-sheets/session-view.ts";
import {
  summarizeCleanerMonth,
  summarizeCleaners,
} from "../../src/lib/time-sheets/summaries.ts";
import { sessionRow } from "./fixtures.ts";

const AFTER_GRACE = new Date("2026-10-14T20:00:00Z");
const ANA = { id: "ana", full_name: "Ana Souza" };
const BIA = { id: "bia", full_name: "Bia Lima" };
const CARLA = { id: "carla", full_name: "Carla Dias" };

function viewFor(cleaner: { id: string; full_name: string }, clockIn: string | null, clockOut: string | null) {
  const row = sessionRow({
    id: `${cleaner.id}-${clockIn}-${clockOut}`,
    employee_id: cleaner.id,
    employee: cleaner,
    clocked_in_at: clockIn,
    clocked_out_at: clockOut,
  });
  return buildSessionView(row, AFTER_GRACE);
}

describe("summarizeCleaners", () => {
  it("gives every Cleaner a row sorted by name, including ones with no sessions", () => {
    const views = [viewFor(BIA, "2026-10-14T13:00:00Z", "2026-10-14T16:00:00Z")];

    const rows = summarizeCleaners(views, [CARLA, BIA, ANA]);

    assert.deepEqual(
      rows.map((row) => row.cleaner.full_name),
      ["Ana Souza", "Bia Lima", "Carla Dias"],
    );
    assert.deepEqual(rows[0], {
      cleaner: ANA,
      sessionCount: 0,
      closedMinutes: 0,
      openCount: 0,
      flagCounts: { open_shift: 0, missing_clock: 0, odd_duration: 0 },
      flagTotal: 0,
    });
  });

  it("counts every session but only closed minutes, and tallies flags by kind", () => {
    const views = [
      viewFor(ANA, "2026-10-14T13:00:00Z", "2026-10-14T16:00:00Z"), // 180, fine
      viewFor(ANA, "2026-10-14T13:00:00Z", "2026-10-14T14:00:00Z"), // 60, odd
      viewFor(ANA, "2026-10-14T13:00:00Z", null), // open shift
      viewFor(ANA, null, null), // missing clock
      viewFor(BIA, "2026-10-14T13:00:00Z", "2026-10-14T16:00:00Z"),
    ];

    const [ana] = summarizeCleaners(views, [ANA]);

    assert.deepEqual(ana, {
      cleaner: ANA,
      sessionCount: 4,
      closedMinutes: 240,
      openCount: 1,
      flagCounts: { open_shift: 1, missing_clock: 1, odd_duration: 1 },
      flagTotal: 3,
    });
  });

  it("counts in-progress sessions as open without flagging them", () => {
    const row = sessionRow({ employee_id: ANA.id, employee: ANA, clocked_in_at: "2026-10-14T13:00:00Z" });
    const inProgress = buildSessionView(row, new Date("2026-10-14T15:00:00Z"));

    const [ana] = summarizeCleaners([inProgress], [ANA]);

    assert.equal(ana.openCount, 1);
    assert.equal(ana.flagTotal, 0);
    assert.equal(ana.closedMinutes, 0);
  });
});

function record(clockIn: string | null, clockOut: string | null) {
  return {
    id: `${clockIn}-${clockOut}`,
    clocked_in_at: clockIn,
    clocked_out_at: clockOut,
    appointments: {
      scheduled_date: "2026-10-14",
      clients: { name: "Maple House" },
      jobs: { name: "Weekly clean" },
    },
  };
}

describe("summarizeCleanerMonth", () => {
  it("counts every listed session but totals and averages closed ones only", () => {
    const records = [
      record("2026-10-14T13:00:00Z", "2026-10-14T16:00:00Z"), // 180
      record("2026-10-15T13:00:00Z", "2026-10-15T14:01:30Z"), // 61
      record("2026-10-16T13:00:00Z", null), // open
    ];

    assert.deepEqual(summarizeCleanerMonth(records), {
      count: 3,
      totalMinutes: 241,
      averageMinutes: 120,
    });
  });

  it("has no average when nothing is closed", () => {
    const records = [record("2026-10-16T13:00:00Z", null)];

    assert.deepEqual(summarizeCleanerMonth(records), {
      count: 1,
      totalMinutes: 0,
      averageMinutes: null,
    });
  });

  it("is empty for an empty month", () => {
    assert.deepEqual(summarizeCleanerMonth([]), {
      count: 0,
      totalMinutes: 0,
      averageMinutes: null,
    });
  });
});
