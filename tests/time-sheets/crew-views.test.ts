import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildCrewViews } from "../../src/lib/time-sheets/crew-views.ts";
import type { AppointmentCrewRow } from "../../src/lib/time-sheets/session-view.ts";
import { sessionRow } from "./fixtures.ts";

// A day after the fixture visit, so an unclocked Cleaner is past grace (Missing clock).
const DAY_AFTER = new Date("2026-10-15T13:00:00.000Z");

type CrewSeed = {
  id: string;
  name: string;
  status?: AppointmentCrewRow["appointment"]["status"];
  adminNotes?: string | null;
};

function crewRow(seed: CrewSeed): AppointmentCrewRow {
  return {
    ...sessionRow({
      id: seed.id,
      employee: { id: seed.id, full_name: seed.name },
      appointment: { status: seed.status ?? "scheduled" },
    }),
    admin_notes: seed.adminNotes === undefined ? "" : seed.adminNotes,
    employee: { id: seed.id, full_name: seed.name, phone: null },
  };
}

describe("buildCrewViews", () => {
  it("flags an unclocked Cleaner past grace and offers Add session", () => {
    const [member] = buildCrewViews([crewRow({ id: "a", name: "Ana" })], DAY_AFTER);

    assert.deepEqual(member.session.flags, ["missing_clock"]);
    assert.equal(member.session.fixAction, "add");
  });

  it("shows no flags and offers no fix on a cancelled visit", () => {
    const [member] = buildCrewViews(
      [crewRow({ id: "a", name: "Ana", status: "cancelled" })],
      DAY_AFTER,
    );

    assert.deepEqual(member.session.flags, []);
    assert.equal(member.session.fixAction, null);
  });

  it("reads NULL admin notes as empty", () => {
    const [member] = buildCrewViews(
      [crewRow({ id: "a", name: "Ana", adminNotes: null })],
      DAY_AFTER,
    );

    assert.equal(member.adminNotes, "");
  });

  it("lists the crew alphabetically by name", () => {
    const members = buildCrewViews(
      [crewRow({ id: "m", name: "Maria" }), crewRow({ id: "a", name: "Ana" })],
      DAY_AFTER,
    );

    assert.deepEqual(
      members.map((member) => member.name),
      ["Ana", "Maria"],
    );
  });
});
