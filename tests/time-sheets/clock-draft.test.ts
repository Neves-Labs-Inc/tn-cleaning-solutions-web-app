import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  draftToInstants,
  prefillClockDraft,
  validateClockDraft,
  type ClockDraft,
} from "../../src/lib/time-sheets/clock-draft.ts";
import { buildSessionView } from "../../src/lib/time-sheets/session-view.ts";
import { GRACE_END, SCHEDULED_END, sessionRow, VISIT_DATE } from "./fixtures.ts";

const MID_VISIT = new Date("2026-10-14T15:00:00Z");
const AFTER_GRACE = new Date("2026-10-14T20:00:00Z");
const RAW_CLOCK_IN = "2026-10-14T13:05:30.123456+00:00";
const RAW_CLOCK_OUT = "2026-10-14T16:10:00.654321+00:00";

const unclocked = buildSessionView(sessionRow(), AFTER_GRACE);
const open = buildSessionView(sessionRow({ clocked_in_at: RAW_CLOCK_IN }), AFTER_GRACE);
const closed = buildSessionView(
  sessionRow({ clocked_in_at: RAW_CLOCK_IN, clocked_out_at: RAW_CLOCK_OUT }),
  AFTER_GRACE,
);

function draft(clockIn: string, clockOut: string, clockOutDate = VISIT_DATE): ClockDraft {
  return {
    clockIn: { date: VISIT_DATE, time: clockIn },
    clockOut: { date: clockOutDate, time: clockOut },
  };
}

describe("prefillClockDraft", () => {
  it("adds from the schedule, leaving clock-out empty before the scheduled end", () => {
    assert.deepEqual(prefillClockDraft(unclocked, "add", MID_VISIT), draft("09:00", ""));
  });

  it("adds the scheduled end as clock-out once it has passed", () => {
    assert.deepEqual(
      prefillClockDraft(unclocked, "add", new Date(SCHEDULED_END)),
      draft("09:00", "12:00"),
    );
  });

  it("closes from the current clock-in with the same clock-out rule", () => {
    assert.deepEqual(prefillClockDraft(open, "close", MID_VISIT), draft("09:05", ""));
    assert.deepEqual(prefillClockDraft(open, "close", AFTER_GRACE), draft("09:05", "12:00"));
  });

  it("edits the current clocks in Eastern time, on their own dates", () => {
    const overnight = buildSessionView(
      sessionRow({ clocked_in_at: RAW_CLOCK_IN, clocked_out_at: "2026-10-15T04:30:00+00:00" }),
      AFTER_GRACE,
    );

    assert.deepEqual(prefillClockDraft(closed, "edit", AFTER_GRACE), draft("09:05", "12:10"));
    assert.deepEqual(
      prefillClockDraft(overnight, "edit", AFTER_GRACE),
      draft("09:05", "00:30", "2026-10-15"),
    );
  });
});

describe("validateClockDraft", () => {
  it("accepts an empty draft in edit mode as a clear", () => {
    assert.deepEqual(validateClockDraft(draft("", ""), "edit", closed, AFTER_GRACE), {});
  });

  it("accepts a valid add", () => {
    assert.deepEqual(validateClockDraft(draft("09:00", "12:00"), "add", unclocked, AFTER_GRACE), {});
  });

  it("asks for a clock-out to close a shift", () => {
    assert.deepEqual(validateClockDraft(draft("09:05", ""), "close", open, MID_VISIT), {
      clockOut: "Enter a clock-out to close the shift",
    });
  });

  it("asks for a clock-in when only a clock-out is given", () => {
    assert.deepEqual(validateClockDraft(draft("", "12:00"), "edit", closed, AFTER_GRACE), {
      clockIn: "Add a clock-in to set a clock-out",
    });
  });

  it("refuses a clock-in in the future", () => {
    assert.deepEqual(validateClockDraft(draft("11:30", ""), "add", unclocked, MID_VISIT), {
      clockIn: "Clock-in can't be in the future",
    });
  });

  it("refuses a clock-out in the future", () => {
    assert.deepEqual(validateClockDraft(draft("09:00", "11:30"), "add", unclocked, MID_VISIT), {
      clockOut: "Clock-out can't be in the future",
    });
  });

  it("reports both fields when both are in the future", () => {
    assert.deepEqual(validateClockDraft(draft("11:30", "11:45"), "add", unclocked, MID_VISIT), {
      clockIn: "Clock-in can't be in the future",
      clockOut: "Clock-out can't be in the future",
    });
  });

  it("refuses a clock-out at or before the clock-in", () => {
    assert.deepEqual(validateClockDraft(draft("09:00", "09:00"), "edit", closed, AFTER_GRACE), {
      clockOut: "Clock-out must be after clock-in",
    });
  });

  it("accepts a clock-out after midnight on the next day", () => {
    const overnight = draft("23:00", "01:00", "2026-10-15");
    const now = new Date("2026-10-15T12:00:00Z");

    assert.deepEqual(validateClockDraft(overnight, "edit", closed, now), {});
  });

  it("needs a clock-out on an add from the moment the grace hour ends", () => {
    assert.deepEqual(validateClockDraft(draft("09:00", ""), "add", unclocked, new Date(GRACE_END)), {
      clockOut: "Enter a clock-out. This visit ended more than an hour ago.",
    });
  });

  it("lets an add leave clock-out empty before the grace hour ends", () => {
    const justBefore = new Date("2026-10-14T16:59:00Z");

    assert.deepEqual(validateClockDraft(draft("09:00", ""), "add", unclocked, justBefore), {});
  });
});

describe("draftToInstants", () => {
  it("reads the draft as Eastern wall time", () => {
    assert.deepEqual(draftToInstants(draft("09:00", "12:30"), unclocked), {
      clockIn: "2026-10-14T13:00:00.000Z",
      clockOut: "2026-10-14T16:30:00.000Z",
    });
  });

  it("turns an empty time into null, clearing a clocked session", () => {
    assert.deepEqual(draftToInstants(draft("", ""), closed), { clockIn: null, clockOut: null });
  });

  it("passes both clocks through untouched when nothing changed", () => {
    assert.deepEqual(draftToInstants(draft("09:05", "12:10"), closed), {
      clockIn: RAW_CLOCK_IN,
      clockOut: RAW_CLOCK_OUT,
    });
  });

  it("passes an unchanged clock through untouched, to the microsecond", () => {
    const edited = draft("09:05", "12:20");

    assert.deepEqual(draftToInstants(edited, closed), {
      clockIn: RAW_CLOCK_IN,
      clockOut: "2026-10-14T16:20:00.000Z",
    });
  });
});
