import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  INTERVAL_CAPS,
  intervalLabel,
  recurrenceDates,
  type Interval,
} from "../../src/lib/appointments/recurrence.ts";

function firstDates(
  anchorDate: string,
  interval: Interval,
  count: number,
): string[] {
  return recurrenceDates({
    anchorDate,
    interval,
    endDate: null,
    maxOccurrences: count,
  });
}

function openEnded(anchorDate: string, interval: Interval): string[] {
  return recurrenceDates({
    anchorDate,
    interval,
    endDate: null,
    maxOccurrences: null,
  });
}

describe("recurrenceDates", () => {
  describe("cadence", () => {
    it("steps a daily series one day at a time from the anchor", () => {
      assert.deepEqual(firstDates("2026-01-30", { unit: "day", count: 1 }, 3), [
        "2026-01-30",
        "2026-01-31",
        "2026-02-01",
      ]);
    });

    it("steps an every-3-days series three days at a time", () => {
      assert.deepEqual(firstDates("2026-01-30", { unit: "day", count: 3 }, 3), [
        "2026-01-30",
        "2026-02-02",
        "2026-02-05",
      ]);
    });

    it("keeps a weekly series on the anchor's weekday", () => {
      assert.deepEqual(
        firstDates("2026-01-15", { unit: "week", count: 1 }, 3),
        ["2026-01-15", "2026-01-22", "2026-01-29"],
      );
    });

    it("steps an every-3-weeks series 21 days at a time", () => {
      assert.deepEqual(
        firstDates("2026-01-15", { unit: "week", count: 3 }, 3),
        ["2026-01-15", "2026-02-05", "2026-02-26"],
      );
    });

    it("keeps a monthly series on the anchor's day of month", () => {
      assert.deepEqual(
        firstDates("2026-01-15", { unit: "month", count: 1 }, 3),
        ["2026-01-15", "2026-02-15", "2026-03-15"],
      );
    });

    it("steps an every-2-months series two months at a time", () => {
      assert.deepEqual(
        firstDates("2026-01-15", { unit: "month", count: 2 }, 3),
        ["2026-01-15", "2026-03-15", "2026-05-15"],
      );
    });
  });

  describe("month-end clamp", () => {
    it("lands on the last day of short months and returns to the 31st", () => {
      assert.deepEqual(
        firstDates("2026-01-31", { unit: "month", count: 1 }, 4),
        ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"],
      );
    });

    it("counts every-2-months from the anchor, not the clamped date", () => {
      assert.deepEqual(
        firstDates("2026-01-31", { unit: "month", count: 2 }, 3),
        ["2026-01-31", "2026-03-31", "2026-05-31"],
      );
    });

    it("clamps a leap day to Feb 28 in a common year", () => {
      assert.deepEqual(
        firstDates("2028-02-29", { unit: "month", count: 12 }, 2),
        ["2028-02-29", "2029-02-28"],
      );
    });
  });

  describe("with no end date and no max occurrences", () => {
    it("runs weekly dates up to six months after the anchor", () => {
      const dates = openEnded("2026-01-15", { unit: "week", count: 1 });

      assert.equal(dates.length, 26);
      assert.equal(dates[0], "2026-01-15");
      assert.equal(dates.at(-1), "2026-07-09");
    });

    it("includes the date exactly six months out when it is on the cadence", () => {
      assert.deepEqual(openEnded("2026-01-15", { unit: "month", count: 1 }), [
        "2026-01-15",
        "2026-02-15",
        "2026-03-15",
        "2026-04-15",
        "2026-05-15",
        "2026-06-15",
        "2026-07-15",
      ]);
    });

    it("measures six months with the month-end clamp", () => {
      const dates = openEnded("2026-08-31", { unit: "day", count: 1 });

      assert.equal(dates.at(-1), "2027-02-28");
    });

    it("returns only the anchor when the interval exceeds six months", () => {
      assert.deepEqual(openEnded("2026-01-15", { unit: "month", count: 12 }), [
        "2026-01-15",
      ]);
    });
  });

  describe("with an end date or max occurrences", () => {
    it("includes a date that falls on the end date", () => {
      assert.deepEqual(
        recurrenceDates({
          anchorDate: "2026-01-15",
          interval: { unit: "week", count: 1 },
          endDate: "2026-02-05",
          maxOccurrences: null,
        }),
        ["2026-01-15", "2026-01-22", "2026-01-29", "2026-02-05"],
      );
    });

    it("stops before a date after the end date", () => {
      assert.deepEqual(
        recurrenceDates({
          anchorDate: "2026-01-15",
          interval: { unit: "week", count: 1 },
          endDate: "2026-02-04",
          maxOccurrences: null,
        }),
        ["2026-01-15", "2026-01-22", "2026-01-29"],
      );
    });

    it("returns exactly max occurrences past the six-month horizon", () => {
      const dates = firstDates("2026-01-15", { unit: "month", count: 12 }, 3);

      assert.deepEqual(dates, ["2026-01-15", "2027-01-15", "2028-01-15"]);
    });

    it("lets the end date cut max occurrences short", () => {
      assert.equal(
        recurrenceDates({
          anchorDate: "2026-01-15",
          interval: { unit: "week", count: 1 },
          endDate: "2026-02-05",
          maxOccurrences: 10,
        }).length,
        4,
      );
    });

    it("never returns more than 365 dates for a far end date", () => {
      const dates = recurrenceDates({
        anchorDate: "2026-01-01",
        interval: { unit: "day", count: 1 },
        endDate: "2030-01-01",
        maxOccurrences: null,
      });

      assert.equal(dates.length, 365);
    });

    it("never returns more than 365 dates for a larger max", () => {
      assert.equal(
        firstDates("2026-01-01", { unit: "day", count: 1 }, 500).length,
        365,
      );
    });
  });
});

describe("intervalLabel", () => {
  it("names a count of 1 by its cadence", () => {
    assert.equal(intervalLabel({ unit: "day", count: 1 }), "Daily");
    assert.equal(intervalLabel({ unit: "week", count: 1 }), "Weekly");
    assert.equal(intervalLabel({ unit: "month", count: 1 }), "Monthly");
  });

  it("names a larger count as every N units", () => {
    assert.equal(intervalLabel({ unit: "day", count: 2 }), "Every 2 days");
    assert.equal(intervalLabel({ unit: "week", count: 2 }), "Every 2 weeks");
    assert.equal(intervalLabel({ unit: "month", count: 2 }), "Every 2 months");
  });
});

describe("INTERVAL_CAPS", () => {
  it("caps each unit at a year's worth or two years of months", () => {
    assert.deepEqual(INTERVAL_CAPS, { day: 365, week: 52, month: 24 });
  });
});
