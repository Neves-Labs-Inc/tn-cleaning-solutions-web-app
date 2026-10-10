import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  CLOCK_ERROR_CODES,
  getOverlapAssignmentId,
  toClockError,
} from "../../src/lib/time-sheets/errors.ts";

const MIGRATIONS_DIR = join(import.meta.dirname, "../../supabase/migrations");
const UNKNOWN_MESSAGE = "Couldn't save. Try again.";
const OVERLAP_ID = "f0000000-0000-4000-8000-000000000006";

function readSqlErrorCodes(): Set<string> {
  const [migration] = readdirSync(MIGRATIONS_DIR).filter((name) =>
    /_clock_corrections\.sql$/.test(name),
  );
  assert.ok(migration, "no clock corrections migration found");

  const source = readFileSync(join(MIGRATIONS_DIR, migration), "utf8");
  return new Set(
    [...source.matchAll(/WHEN '([a-z_]+)' THEN/g)].map((match) => match[1]),
  );
}

function refusal(code: string, hint: string | null = null) {
  return { message: "raised by clock_error", details: code, hint, code: "P0001" };
}

describe("clock errors", () => {
  it("lists exactly the codes clock_error raises in SQL", () => {
    const sqlCodes = readSqlErrorCodes();

    assert.ok(sqlCodes.size > 0, "no WHEN codes read from the migration");
    assert.deepEqual(new Set(CLOCK_ERROR_CODES), sqlCodes);
  });

  // The table from ticket 01, the source of truth for field and wording.
  const expected = [
    ["not_admin", "form", "Only an admin can change clocks."],
    ["session_not_found", "form", "This session no longer exists. Reload and try again."],
    ["session_archived", "form", "This Cleaner is no longer on the crew."],
    ["visit_cancelled", "form", "This visit is cancelled. Restore it first."],
    ["clock_in_required", "clockIn", "Add a clock-in to set a clock-out"],
    ["clock_in_future", "clockIn", "Clock-in can't be in the future"],
    ["clock_out_future", "clockOut", "Clock-out can't be in the future"],
    ["clock_out_before_clock_in", "clockOut", "Clock-out must be after clock-in"],
    ["clock_out_required", "clockOut", "Enter a clock-out. This visit ended more than an hour ago."],
    ["overlap", "clockIn", "Overlaps another session"],
    ["session_open", "form", "Only a closed session can be acknowledged."],
    ["clocks_changed", "form", "The clocks changed since you opened this. Reload and try again."],
    ["note_required", "note", "Add a note saying why this length is fine"],
  ] as const;

  for (const [code, field, message] of expected) {
    it(`maps ${code} to the ${field} field`, () => {
      assert.deepEqual(toClockError(refusal(code)), { field, message });
    });
  }

  it("names the clashing visit and its Eastern clock times on an overlap", () => {
    const error = toClockError(refusal("overlap", OVERLAP_ID), {
      clientName: "Smith Residence",
      clockIn: "2026-10-03T13:00:00Z",
      clockOut: "2026-10-03T15:30:00Z",
    });

    assert.deepEqual(error, {
      field: "clockIn",
      message: "Overlaps another session (Smith Residence, 9:00 AM–11:30 AM)",
    });
  });

  it("maps an unknown code to the form with a generic message", () => {
    const error = toClockError({
      message: "connection reset by peer",
      details: "socket closed",
      code: "08006",
    });

    assert.deepEqual(error, { field: "form", message: UNKNOWN_MESSAGE });
  });

  it("maps an error with no details to the form with a generic message", () => {
    assert.deepEqual(toClockError({ message: "fetch failed" }), {
      field: "form",
      message: UNKNOWN_MESSAGE,
    });
  });

  it("reads the clashing assignment id from an overlap's hint", () => {
    assert.equal(getOverlapAssignmentId(refusal("overlap", OVERLAP_ID)), OVERLAP_ID);
  });

  it("reads no clashing assignment from any other refusal", () => {
    assert.equal(getOverlapAssignmentId(refusal("clock_in_future", OVERLAP_ID)), null);
  });
});
