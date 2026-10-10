import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildSessionView } from "../../src/lib/time-sheets/session-view.ts";
import {
  acknowledgement,
  correction,
  GRACE_END,
  SCHEDULED_END,
  SCHEDULED_START,
  sessionRow,
} from "./fixtures.ts";

const AFTER_GRACE = new Date("2026-10-14T20:00:00Z");
const CLOCK_IN = "2026-10-14T13:00:00+00:00";

function closedAfter(minutes: number) {
  const clockOut = new Date(Date.parse(CLOCK_IN) + minutes * 60_000).toISOString();
  return sessionRow({ clocked_in_at: CLOCK_IN, clocked_out_at: clockOut });
}

describe("buildSessionView: scheduled times", () => {
  it("reads the visit's date and times as Eastern wall clock", () => {
    const view = buildSessionView(sessionRow(), AFTER_GRACE);

    assert.equal(view.scheduledStart, SCHEDULED_START);
    assert.equal(view.scheduledEnd, SCHEDULED_END);
    assert.equal(view.graceEnd, GRACE_END);
    assert.equal(view.scheduledMinutes, 180);
  });

  it("uses the standard-time offset after the fall-back change", () => {
    const row = sessionRow({ appointment: { scheduled_date: "2026-11-10" } });

    assert.equal(buildSessionView(row, AFTER_GRACE).scheduledStart, "2026-11-10T14:00:00.000Z");
  });

  it("carries the visit, Cleaner and raw clocks", () => {
    const clockIn = "2026-10-14T13:00:00.123456+00:00";
    const view = buildSessionView(sessionRow({ clocked_in_at: clockIn }), AFTER_GRACE);

    assert.equal(view.assignmentId, "assignment-1");
    assert.equal(view.appointmentId, "visit-1");
    assert.equal(view.cleanerId, "cleaner-1");
    assert.equal(view.cleanerName, "Ana Souza");
    assert.equal(view.clientName, "Maple House");
    assert.equal(view.jobName, "Weekly clean");
    assert.equal(view.scheduledDate, "2026-10-14");
    assert.equal(view.clockIn, clockIn);
    assert.equal(view.clockOut, null);
  });
});

describe("buildSessionView: state, flags and fix action", () => {
  it("is closed with an edit fix when both clocks are set", () => {
    const view = buildSessionView(closedAfter(180), AFTER_GRACE);

    assert.equal(view.state, "closed");
    assert.deepEqual(view.flags, []);
    assert.equal(view.fixAction, "edit");
    assert.equal(view.clockedMinutes, 180);
    assert.equal(view.oddRatioPercent, 100);
  });

  it("is in progress with a close fix until the grace hour ends", () => {
    const row = sessionRow({ clocked_in_at: CLOCK_IN });
    const view = buildSessionView(row, new Date("2026-10-14T16:59:59.999Z"));

    assert.equal(view.state, "in_progress");
    assert.deepEqual(view.flags, []);
    assert.equal(view.fixAction, "close");
    assert.equal(view.clockedMinutes, null);
    assert.equal(view.oddRatioPercent, null);
  });

  it("is an open shift with a close fix from the moment the grace hour ends", () => {
    const view = buildSessionView(sessionRow({ clocked_in_at: CLOCK_IN }), new Date(GRACE_END));

    assert.equal(view.state, "open");
    assert.deepEqual(view.flags, ["open_shift"]);
    assert.equal(view.fixAction, "close");
  });

  it("never flags an open shift as odd, however long it runs", () => {
    const row = sessionRow({ clocked_in_at: CLOCK_IN });
    const view = buildSessionView(row, new Date("2026-10-16T13:00:00Z"));

    assert.deepEqual(view.flags, ["open_shift"]);
    assert.equal(view.clockedMinutes, null);
  });

  it("is upcoming with no fix before the scheduled start", () => {
    const view = buildSessionView(sessionRow(), new Date("2026-10-14T12:59:00Z"));

    assert.equal(view.state, "upcoming");
    assert.deepEqual(view.flags, []);
    assert.equal(view.fixAction, null);
  });

  it("offers an add fix from the scheduled start, still upcoming", () => {
    const view = buildSessionView(sessionRow(), new Date(SCHEDULED_START));

    assert.equal(view.state, "upcoming");
    assert.equal(view.fixAction, "add");
  });

  it("stays upcoming just before the grace hour ends", () => {
    const view = buildSessionView(sessionRow(), new Date("2026-10-14T16:59:59.999Z"));

    assert.equal(view.state, "upcoming");
    assert.deepEqual(view.flags, []);
  });

  it("is a missing clock with an add fix from the moment the grace hour ends", () => {
    const view = buildSessionView(sessionRow(), new Date(GRACE_END));

    assert.equal(view.state, "not_clocked");
    assert.deepEqual(view.flags, ["missing_clock"]);
    assert.equal(view.fixAction, "add");
  });

  it("still raises a missing clock on a Manual completion", () => {
    const row = sessionRow({ appointment: { status: "completed", manually_completed: true } });
    const view = buildSessionView(row, AFTER_GRACE);

    assert.deepEqual(view.flags, ["missing_clock"]);
    assert.equal(view.isManualCompletion, true);
  });
});

describe("buildSessionView: odd duration", () => {
  it("is not odd at exactly half the scheduled length", () => {
    const view = buildSessionView(closedAfter(90), AFTER_GRACE);

    assert.deepEqual(view.flags, []);
    assert.equal(view.oddRatioPercent, 50);
  });

  it("is odd just under half the scheduled length", () => {
    const view = buildSessionView(closedAfter(89), AFTER_GRACE);

    assert.deepEqual(view.flags, ["odd_duration"]);
    assert.equal(view.oddRatioPercent, 49);
  });

  it("is not odd at exactly one and a half times the scheduled length", () => {
    const view = buildSessionView(closedAfter(270), AFTER_GRACE);

    assert.deepEqual(view.flags, []);
    assert.equal(view.oddRatioPercent, 150);
  });

  it("is odd just over one and a half times the scheduled length", () => {
    const view = buildSessionView(closedAfter(271), AFTER_GRACE);

    assert.deepEqual(view.flags, ["odd_duration"]);
    assert.equal(view.oddRatioPercent, 151);
  });

  it("counts whole minutes, dropping seconds", () => {
    const row = sessionRow({
      clocked_in_at: CLOCK_IN,
      clocked_out_at: "2026-10-14T16:00:59.999+00:00",
    });

    assert.equal(buildSessionView(row, AFTER_GRACE).clockedMinutes, 180);
  });

  it("is acknowledged, not flagged, when an acknowledgement matches the current clocks", () => {
    const row = sessionRow({
      clocked_in_at: "2026-10-14T13:00:00.123456+00:00",
      clocked_out_at: "2026-10-14T14:00:00+00:00",
      odd_duration_acknowledgements: [
        acknowledgement({
          clock_in: "2026-10-14T13:00:00.123456Z",
          clock_out: "2026-10-14T10:00:00-04:00",
        }),
      ],
    });
    const view = buildSessionView(row, AFTER_GRACE);

    assert.deepEqual(view.flags, []);
    assert.equal(view.isAcknowledged, true);
  });

  it("lapses an acknowledgement when the clocks change, even by a microsecond", () => {
    const row = sessionRow({
      clocked_in_at: "2026-10-14T13:00:00.123457+00:00",
      clocked_out_at: "2026-10-14T14:00:00+00:00",
      odd_duration_acknowledgements: [
        acknowledgement({ clock_in: "2026-10-14T13:00:00.123456+00:00" }),
      ],
    });
    const view = buildSessionView(row, AFTER_GRACE);

    assert.deepEqual(view.flags, ["odd_duration"]);
    assert.equal(view.isAcknowledged, false);
  });

  it("is not acknowledged when the session isn't odd, even with a matching acknowledgement", () => {
    const row = sessionRow({
      clocked_in_at: CLOCK_IN,
      clocked_out_at: "2026-10-14T16:00:00+00:00",
      odd_duration_acknowledgements: [
        acknowledgement({ clock_out: "2026-10-14T16:00:00+00:00" }),
      ],
    });

    assert.equal(buildSessionView(row, AFTER_GRACE).isAcknowledged, false);
  });

  it("lists acknowledgements newest first", () => {
    const row = sessionRow({
      odd_duration_acknowledgements: [
        acknowledgement({ id: "old", acknowledged_at: "2026-10-14T18:00:00+00:00" }),
        acknowledgement({ id: "new", acknowledged_at: "2026-10-15T09:00:00+00:00" }),
      ],
    });
    const view = buildSessionView(row, AFTER_GRACE);

    assert.deepEqual(
      view.acknowledgements.map((ack) => ack.id),
      ["new", "old"],
    );
  });
});

describe("buildSessionView: corrections", () => {
  it("is not edited without corrections", () => {
    assert.equal(buildSessionView(closedAfter(180), AFTER_GRACE).isEdited, false);
  });

  it("is edited with at least one correction, listed newest first", () => {
    const row = sessionRow({
      clock_corrections: [
        correction({ id: "first", corrected_at: "2026-10-14T18:00:00+00:00" }),
        correction({ id: "second", corrected_at: "2026-10-14T19:00:00+00:00" }),
      ],
    });
    const view = buildSessionView(row, AFTER_GRACE);

    assert.equal(view.isEdited, true);
    assert.deepEqual(
      view.corrections.map((item) => item.id),
      ["second", "first"],
    );
  });
});
