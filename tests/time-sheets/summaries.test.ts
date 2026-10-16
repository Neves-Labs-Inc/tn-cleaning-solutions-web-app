import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildSessionView } from "../../src/lib/time-sheets/session-view.ts";
import {
  filterSummariesByName,
  summarizeCleanerMonth,
  summarizeCleaners,
} from "../../src/lib/time-sheets/summaries.ts";
import { sessionRow } from "./fixtures.ts";

const AFTER_GRACE = new Date("2026-10-14T20:00:00Z");
const ANA = { id: "ana", full_name: "Ana Souza" };
const BIA = { id: "bia", full_name: "Bia Lima" };
const CARLA = { id: "carla", full_name: "Carla Dias" };

function viewFor(
  cleaner: { id: string; full_name: string },
  clockIn: string | null,
  clockOut: string | null,
  isArchived = false,
) {
  const row = sessionRow({
    id: `${cleaner.id}-${clockIn}-${clockOut}-${isArchived}`,
    employee_id: cleaner.id,
    is_archived: isArchived,
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

  it("leaves Removed sessions out of counts, minutes, open shifts and flags", () => {
    const views = [
      viewFor(ANA, "2026-10-14T13:00:00Z", "2026-10-14T16:00:00Z"), // 180, counted
      viewFor(ANA, "2026-10-14T13:00:00Z", "2026-10-14T15:15:00Z", true), // removed, 135
      viewFor(ANA, "2026-10-14T13:00:00Z", null, true), // removed open shift
      viewFor(ANA, null, null, true), // removed, never clocked
    ];

    const [ana] = summarizeCleaners(views, [ANA]);

    assert.deepEqual(ana, {
      cleaner: ANA,
      sessionCount: 1,
      closedMinutes: 180,
      openCount: 0,
      flagCounts: { open_shift: 0, missing_clock: 0, odd_duration: 0 },
      flagTotal: 0,
    });
  });

  it("keeps a Cleaner whose sessions were all removed, at zero", () => {
    const views = [viewFor(ANA, "2026-10-14T13:00:00Z", "2026-10-14T16:00:00Z", true)];

    const [ana] = summarizeCleaners(views, [ANA]);

    assert.equal(ana.sessionCount, 0);
    assert.equal(ana.closedMinutes, 0);
  });
});

function record(clockIn: string | null, clockOut: string | null, isRemoved = false) {
  return {
    id: `${clockIn}-${clockOut}-${isRemoved}`,
    clocked_in_at: clockIn,
    clocked_out_at: clockOut,
    is_removed: isRemoved,
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

  it("totals and averages the minutes between the displayed clock times", () => {
    const records = [
      record("2026-10-14T13:00:40Z", "2026-10-14T16:00:10Z"), // 180
      record("2026-10-15T13:00:50Z", "2026-10-15T13:01:10Z"), // 1
    ];

    assert.deepEqual(summarizeCleanerMonth(records), {
      count: 2,
      totalMinutes: 181,
      averageMinutes: 90,
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

  it("leaves her Removed sessions out of the count, total and average", () => {
    const records = [
      record("2026-10-14T13:00:00Z", "2026-10-14T16:00:00Z"), // 180
      record("2026-10-15T13:00:00Z", "2026-10-15T14:00:00Z", true), // removed, 60
      record("2026-10-16T13:00:00Z", null, true), // removed, never clocked out
    ];

    assert.deepEqual(summarizeCleanerMonth(records), {
      count: 1,
      totalMinutes: 180,
      averageMinutes: 180,
    });
  });

  it("is zero with no average for a month holding only Removed sessions", () => {
    const records = [record("2026-10-15T13:00:00Z", "2026-10-15T14:00:00Z", true)];

    assert.deepEqual(summarizeCleanerMonth(records), {
      count: 0,
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

describe("filterSummariesByName", () => {
  const BARBARA = { id: "barbara", full_name: "Bárbara Silva" };
  const JULIANA = { id: "juliana", full_name: "Juliana Reis" };
  const summaries = summarizeCleaners([], [JULIANA, BARBARA, ANA]);
  const namesFor = (query: string) =>
    filterSummariesByName(summaries, query).map((row) => row.cleaner.full_name);

  it("matches case-insensitively", () => {
    assert.deepEqual(namesFor("ANA"), ["Ana Souza", "Juliana Reis"]);
  });

  it("matches without regard to accents, in both directions", () => {
    assert.deepEqual(namesFor("barbara"), ["Bárbara Silva"]);
    const plain = summarizeCleaners([], [{ id: "b", full_name: "Barbara Lima" }]);
    assert.equal(filterSummariesByName(plain, "bárbara").length, 1);
  });

  it("matches in the middle of a name", () => {
    assert.deepEqual(namesFor("liana"), ["Juliana Reis"]);
    assert.deepEqual(namesFor("a si"), ["Bárbara Silva"]);
  });

  it("ignores spaces around the query", () => {
    assert.deepEqual(namesFor("  souza "), ["Ana Souza"]);
  });

  it("keeps everyone for a blank or whitespace query", () => {
    assert.equal(filterSummariesByName(summaries, ""), summaries);
    assert.equal(filterSummariesByName(summaries, "   "), summaries);
  });

  it("returns an empty list when nothing matches", () => {
    assert.deepEqual(filterSummariesByName(summaries, "zzz"), []);
  });

  it("preserves input order", () => {
    assert.deepEqual(namesFor("a"), [
      "Ana Souza",
      "Bárbara Silva",
      "Juliana Reis",
    ]);
  });
});
