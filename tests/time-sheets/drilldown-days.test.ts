import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildDrilldownDays } from "../../src/lib/time-sheets/drilldown-days.ts";
import { buildSessionView } from "../../src/lib/time-sheets/session-view.ts";
import { acknowledgement, correction, sessionRow } from "./fixtures.ts";

const NOW = new Date("2026-10-14T20:00:00Z");

function view(overrides: Parameters<typeof sessionRow>[0]) {
  return buildSessionView(sessionRow(overrides), NOW);
}

describe("buildDrilldownDays", () => {
  it("groups sessions by visit date ascending, then by scheduled start", () => {
    const days = buildDrilldownDays([
      view({ id: "late", appointment: { scheduled_start_time: "14:00:00", scheduled_end_time: "16:00:00" } }),
      view({ id: "next-day", appointment: { scheduled_date: "2026-10-15" } }),
      view({ id: "early" }),
    ]);

    assert.deepEqual(
      days.map((day) => [day.date, day.label, day.sessions.map((s) => s.id)]),
      [
        ["2026-10-14", "Wed, Oct 14", ["early", "late"]],
        ["2026-10-15", "Thu, Oct 15", ["next-day"]],
      ],
    );
  });

  it("formats the scheduled window in Eastern time", () => {
    const [day] = buildDrilldownDays([view({})]);

    assert.equal(day.sessions[0].scheduledWindow, "9:00 AM–12:00 PM");
  });

  it("returns no days for no sessions", () => {
    assert.deepEqual(buildDrilldownDays([]), []);
  });

  it("marks an acknowledgement lapsed when the clocks changed since", () => {
    const [day] = buildDrilldownDays([
      view({
        clocked_in_at: "2026-10-14T13:00:00+00:00",
        clocked_out_at: "2026-10-14T13:30:00+00:00",
        odd_duration_acknowledgements: [
          acknowledgement({
            id: "matching",
            clock_in: "2026-10-14T13:00:00+00:00",
            clock_out: "2026-10-14T13:30:00+00:00",
          }),
          acknowledgement({
            id: "stale",
            clock_in: "2026-10-14T13:00:00+00:00",
            clock_out: "2026-10-14T13:20:00+00:00",
          }),
        ],
      }),
    ]);

    const lapsedById = Object.fromEntries(
      day.sessions[0].acknowledgements.map((ack) => [ack.id, ack.isLapsed]),
    );
    assert.deepEqual(lapsedById, { matching: false, stale: true });
  });

  it("passes only the fields the history shows", () => {
    const [day] = buildDrilldownDays([
      view({
        clock_corrections: [correction({ id: "c1", reason: "Forgot to clock out" })],
      }),
    ]);

    assert.deepEqual(Object.keys(day.sessions[0].corrections[0]).sort(), [
      "correctedAt",
      "correctedByName",
      "id",
      "newClockIn",
      "newClockOut",
      "oldClockIn",
      "oldClockOut",
      "reason",
    ]);
  });
});
