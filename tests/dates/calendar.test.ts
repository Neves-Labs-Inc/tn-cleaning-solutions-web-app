import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isCalendarDate, isClockTime } from "../../src/lib/dates/calendar.ts";

describe("isCalendarDate", () => {
  it("accepts real dates, including a leap day", () => {
    assert.equal(isCalendarDate("2026-10-13"), true);
    assert.equal(isCalendarDate("2028-02-29"), true);
    assert.equal(isCalendarDate("2000-02-29"), true);
  });

  it("rejects days that do not exist", () => {
    for (const value of [
      "2026-02-29",
      "2026-02-31",
      "2026-13-01",
      "2026-00-10",
      "2026-01-00",
      "1900-02-29",
      "0000-01-01",
    ]) {
      assert.equal(isCalendarDate(value), false, value);
    }
  });

  it("rejects the wrong shape", () => {
    for (const value of ["2026-1-01", "", "2026-02-01T00:00"]) {
      assert.equal(isCalendarDate(value), false, value);
    }
  });
});

describe("isClockTime", () => {
  it("accepts 00:00 through 23:59", () => {
    for (const value of ["00:00", "09:30", "23:59"]) {
      assert.equal(isClockTime(value), true, value);
    }
  });

  it("rejects out-of-range and mis-shaped times", () => {
    for (const value of ["24:00", "25:00", "12:60", "9:30", "12:3", "", "12:30:00"]) {
      assert.equal(isClockTime(value), false, value);
    }
  });
});
