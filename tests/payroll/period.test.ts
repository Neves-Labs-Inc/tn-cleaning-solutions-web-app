import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  finalizeOpensOn,
  formatDecimalHours,
  formatHoursMinutes,
  formatPeriodLabel,
  getPayPeriod,
  isPeriodEnded,
  listPayPeriods,
  parsePeriodParam,
  PAY_PERIOD_ANCHOR,
  PAYROLL_START,
} from "../../src/lib/payroll/period.ts";

const MIGRATIONS_DIR = join(import.meta.dirname, "../../supabase/migrations");

function readSqlSettings(): { anchor: string; start: string } {
  const [migration] = readdirSync(MIGRATIONS_DIR).filter((name) =>
    /_payroll_schema_and_pay_view\.sql$/.test(name),
  );
  assert.ok(migration, "no payroll schema migration found");

  const source = readFileSync(join(MIGRATIONS_DIR, migration), "utf8");
  const match = source.match(
    /"payroll_settings"\(\)[\s\S]*?SELECT DATE '([\d-]+)', DATE '([\d-]+)';/,
  );
  assert.ok(match, "payroll_settings() body not found");
  return { anchor: match[1], start: match[2] };
}

describe("payroll settings", () => {
  it("mirrors the anchor and the Payroll start from payroll_settings()", () => {
    const sql = readSqlSettings();

    assert.equal(PAY_PERIOD_ANCHOR, sql.anchor);
    assert.equal(PAYROLL_START, sql.start);
  });
});

describe("getPayPeriod", () => {
  // Expected values worked out by hand from the SQL rule: anchor + 14 * floor((day - anchor) / 14).
  const cases = [
    ["2026-10-05", "2026-10-05", "2026-10-18"],
    ["2026-10-18", "2026-10-05", "2026-10-18"],
    ["2026-10-19", "2026-10-19", "2026-11-01"],
    ["2026-11-01", "2026-10-19", "2026-11-01"],
    ["2026-11-02", "2026-11-02", "2026-11-15"],
    ["2026-10-04", "2026-09-21", "2026-10-04"],
    ["2027-03-14", "2027-03-08", "2027-03-21"],
    ["2026-12-31", "2026-12-28", "2027-01-10"],
  ] as const;

  for (const [day, start, end] of cases) {
    it(`puts ${day} in ${start}–${end}`, () => {
      assert.deepEqual(getPayPeriod(day), { start, end });
    });
  }
});

describe("isPeriodEnded", () => {
  const october = { start: "2026-10-05", end: "2026-10-18" };
  // Oct 19–Nov 1 holds the fall-back DST change (Nov 1, 2026).
  const dstWeek = { start: "2026-10-19", end: "2026-11-01" };

  it("is false through the last day in Toronto, even when UTC is already past it", () => {
    assert.equal(
      isPeriodEnded(october, new Date("2026-10-19T03:59:00Z")),
      false,
    );
  });

  it("is true from midnight Toronto time on the Monday after", () => {
    assert.equal(
      isPeriodEnded(october, new Date("2026-10-19T04:00:00Z")),
      true,
    );
  });

  it("uses standard time once the clocks fall back inside the period", () => {
    assert.equal(
      isPeriodEnded(dstWeek, new Date("2026-11-02T04:30:00Z")),
      false,
    );
    assert.equal(
      isPeriodEnded(dstWeek, new Date("2026-11-02T05:00:00Z")),
      true,
    );
  });
});

describe("listPayPeriods", () => {
  it("lists from the Payroll start through the running period, newest first", () => {
    const periods = listPayPeriods(new Date("2026-11-03T15:00:00Z"));

    assert.deepEqual(
      periods.map((period) => period.start),
      ["2026-11-02", "2026-10-19", "2026-10-05"],
    );
  });

  it("lists only the first period while it runs", () => {
    const periods = listPayPeriods(new Date("2026-10-05T15:00:00Z"));

    assert.deepEqual(periods, [{ start: "2026-10-05", end: "2026-10-18" }]);
  });

  it("lists nothing before the Payroll start", () => {
    assert.deepEqual(listPayPeriods(new Date("2026-10-01T15:00:00Z")), []);
  });
});

describe("finalizeOpensOn", () => {
  it("is the Monday after the period ends", () => {
    assert.equal(
      finalizeOpensOn({ start: "2026-10-19", end: "2026-11-01" }),
      "2026-11-02",
    );
  });
});

describe("parsePeriodParam", () => {
  it("reads a period start on or after the Payroll start", () => {
    assert.deepEqual(parsePeriodParam("2026-10-19"), {
      start: "2026-10-19",
      end: "2026-11-01",
    });
  });

  it("reads the first value of a repeated param", () => {
    assert.deepEqual(parsePeriodParam(["2026-10-05", "2026-10-19"]), {
      start: "2026-10-05",
      end: "2026-10-18",
    });
  });

  for (const value of [
    "2026-10-06",
    "2026-09-21",
    "2026-02-30",
    "next",
    "",
    undefined,
  ]) {
    it(`refuses ${JSON.stringify(value)}`, () => {
      assert.equal(parsePeriodParam(value), null);
    });
  }
});

describe("formatPeriodLabel", () => {
  it("names the month once inside one month", () => {
    assert.equal(
      formatPeriodLabel({ start: "2026-10-05", end: "2026-10-18" }),
      "Oct 5–18",
    );
  });

  it("names both months across a month change", () => {
    assert.equal(
      formatPeriodLabel({ start: "2026-10-19", end: "2026-11-01" }),
      "Oct 19–Nov 1",
    );
  });
});

describe("hour formats", () => {
  it("formats minutes as h:mm", () => {
    assert.equal(formatHoursMinutes(425), "7:05");
    assert.equal(formatHoursMinutes(0), "0:00");
    assert.equal(formatHoursMinutes(600), "10:00");
  });

  it("formats minutes as decimal hours to two places", () => {
    assert.equal(formatDecimalHours(425), "7.08");
    assert.equal(formatDecimalHours(90), "1.50");
    assert.equal(formatDecimalHours(0), "0.00");
  });
});
