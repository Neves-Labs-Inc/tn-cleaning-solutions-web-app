import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveWeekRange } from "../../src/lib/time-sheets/range.ts";

// Wednesday Oct 14, 2026, noon Eastern.
const NOW = new Date("2026-10-14T16:00:00Z");

describe("resolveWeekRange", () => {
  it("defaults to the current Monday–Sunday week", () => {
    const range = resolveWeekRange({}, NOW);

    assert.equal(range.from, "2026-10-12");
    assert.equal(range.to, "2026-10-18");
    assert.equal(range.isWeek, true);
    assert.equal(range.isThisWeek, true);
    assert.equal(range.label, "Oct 12 – 18, 2026");
  });

  it("finds the current week from the Eastern date, not UTC", () => {
    // Sunday Oct 11, 11 PM Eastern is already Monday in UTC.
    const range = resolveWeekRange({}, new Date("2026-10-12T03:00:00Z"));

    assert.deepEqual([range.from, range.to], ["2026-10-05", "2026-10-11"]);
  });

  it("accepts a valid past week", () => {
    const range = resolveWeekRange({ from: "2026-09-28", to: "2026-10-04" }, NOW);

    assert.deepEqual([range.from, range.to], ["2026-09-28", "2026-10-04"]);
    assert.equal(range.isWeek, true);
    assert.equal(range.isThisWeek, false);
  });

  it("accepts a custom range that is not a week", () => {
    const range = resolveWeekRange({ from: "2026-10-01", to: "2026-10-10" }, NOW);

    assert.deepEqual([range.from, range.to], ["2026-10-01", "2026-10-10"]);
    assert.equal(range.isWeek, false);
    assert.equal(range.isThisWeek, false);
  });

  it("accepts a range that ends after today", () => {
    const range = resolveWeekRange({ from: "2026-10-14", to: "2026-10-30" }, NOW);

    assert.deepEqual([range.from, range.to], ["2026-10-14", "2026-10-30"]);
  });

  it("does not call a Monday-start range of another length a week", () => {
    const range = resolveWeekRange({ from: "2026-10-05", to: "2026-10-12" }, NOW);

    assert.equal(range.isWeek, false);
  });

  it("falls back to the current week when from is after to", () => {
    const range = resolveWeekRange({ from: "2026-10-10", to: "2026-10-01" }, NOW);

    assert.deepEqual([range.from, range.to], ["2026-10-12", "2026-10-18"]);
  });

  it("falls back to the current week when from is after today", () => {
    const range = resolveWeekRange({ from: "2026-10-15", to: "2026-10-20" }, NOW);

    assert.deepEqual([range.from, range.to], ["2026-10-12", "2026-10-18"]);
  });

  it("falls back to the current week for unparseable dates", () => {
    const inputs = [
      { from: "2026-02-30", to: "2026-03-05" },
      { from: "yesterday", to: "2026-10-01" },
      { from: "2026-10-01", to: "2026-13-01" },
      { from: "2026-10-1", to: "2026-10-05" },
      { from: "2026-10-01" },
      { to: "2026-10-05" },
    ];

    for (const input of inputs) {
      const range = resolveWeekRange(input, NOW);
      assert.deepEqual([range.from, range.to], ["2026-10-12", "2026-10-18"], JSON.stringify(input));
    }
  });

  it("uses the first element of array params", () => {
    const range = resolveWeekRange(
      { from: ["2026-09-28", "2026-01-01"], to: ["2026-10-04", "2026-01-07"] },
      NOW,
    );

    assert.deepEqual([range.from, range.to], ["2026-09-28", "2026-10-04"]);
  });

  it("labels a range crossing months with both months", () => {
    const range = resolveWeekRange({ from: "2026-09-28", to: "2026-10-04" }, NOW);

    assert.equal(range.label, "Sep 28 – Oct 4, 2026");
  });

  it("labels a range crossing years with both years", () => {
    const now = new Date("2027-01-10T16:00:00Z");
    const range = resolveWeekRange({ from: "2026-12-28", to: "2027-01-03" }, now);

    assert.equal(range.label, "Dec 28, 2026 – Jan 3, 2027");
  });

  it("steps prev and next by a week for a week", () => {
    const range = resolveWeekRange({ from: "2026-09-28", to: "2026-10-04" }, NOW);

    assert.deepEqual(range.prev, { from: "2026-09-21", to: "2026-09-27" });
    assert.deepEqual(range.next, { from: "2026-10-05", to: "2026-10-11" });
  });

  it("steps prev and next by the custom range's length", () => {
    const range = resolveWeekRange({ from: "2026-09-01", to: "2026-09-10" }, NOW);

    assert.deepEqual(range.prev, { from: "2026-08-22", to: "2026-08-31" });
    assert.deepEqual(range.next, { from: "2026-09-11", to: "2026-09-20" });
  });

  it("has no next when the next range would start after today", () => {
    const range = resolveWeekRange({}, NOW);

    assert.equal(range.next, null);
    assert.deepEqual(range.prev, { from: "2026-10-05", to: "2026-10-11" });
  });

  it("keeps next when it would start exactly today", () => {
    const range = resolveWeekRange({ from: "2026-10-12", to: "2026-10-13" }, NOW);

    assert.deepEqual(range.next, { from: "2026-10-14", to: "2026-10-15" });
  });
});
