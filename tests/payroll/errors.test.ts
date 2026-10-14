import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  PAYROLL_ERROR_CODES,
  getPayrollErrorMessage,
  toPayrollError,
} from "../../src/lib/payroll/errors.ts";

const MIGRATIONS_DIR = join(import.meta.dirname, "../../supabase/migrations");
const UNKNOWN_MESSAGE = "Couldn't save. Try again.";

// The CASE block of the newest migration that (re)defines payroll_error: later migrations replace it.
function readSqlErrorCodes(): Set<string> {
  const definition = /CREATE (?:OR REPLACE )?FUNCTION "public"\."payroll_error"\(/;
  const migration = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(MIGRATIONS_DIR, name), "utf8"))
    .findLast((source) => definition.test(source));
  assert.ok(migration, "no migration defines payroll_error");

  const body = migration.slice(migration.search(definition));
  const functionBody = body.slice(0, body.indexOf("$$;"));
  return new Set(
    [...functionBody.matchAll(/WHEN '([a-z_]+)' THEN/g)].map((match) => match[1]),
  );
}

function refusal(code: string) {
  return { message: "raised by payroll_error", details: code, hint: null, code: "P0001" };
}

describe("payroll errors", () => {
  it("lists exactly the codes payroll_error raises in SQL", () => {
    const sqlCodes = readSqlErrorCodes();

    assert.ok(sqlCodes.size > 0, "no WHEN codes read from the migration");
    assert.deepEqual(new Set(PAYROLL_ERROR_CODES), sqlCodes);
  });

  it("maps a blocked refusal to its message", () => {
    assert.deepEqual(toPayrollError(refusal("blocked")), {
      code: "blocked",
      message: "Fix this Cleaner's problem sessions and Pay rate to finalize.",
    });
  });

  it("maps a refused Adjustment on a paid run to its message", () => {
    assert.deepEqual(toPayrollError(refusal("run_paid")), {
      code: "run_paid",
      message: "This Pay run is paid and can't change.",
    });
  });

  it("maps a refused payout edit on an unpaid run to its message", () => {
    assert.deepEqual(toPayrollError(refusal("not_paid")), {
      code: "not_paid",
      message: "Only a paid Pay run's payout can be edited.",
    });
  });

  it("gives the Mark paid refusal messages for a bulk result row", () => {
    assert.equal(getPayrollErrorMessage("method_required"), "Enter a Payout method");
    assert.equal(getPayrollErrorMessage("paid_on_future"), "The paid date can't be in the future");
    assert.equal(
      getPayrollErrorMessage("paid_on_before_period_end"),
      "The paid date can't be before the Pay period ends",
    );
    assert.equal(
      getPayrollErrorMessage("not_finalized"),
      "This Pay run isn't finalized, or it's already paid.",
    );
  });

  it("gives the message for a code read from a bulk result row", () => {
    assert.equal(
      getPayrollErrorMessage("period_not_ended"),
      "This Pay period hasn't ended yet.",
    );
  });

  it("maps an unknown code to a generic message with no code", () => {
    const error = toPayrollError({
      message: "connection reset by peer",
      details: "socket closed",
      code: "08006",
    });

    assert.deepEqual(error, { code: null, message: UNKNOWN_MESSAGE });
  });

  it("maps an error with no details to a generic message", () => {
    assert.deepEqual(toPayrollError({ message: "fetch failed" }), {
      code: null,
      message: UNKNOWN_MESSAGE,
    });
  });
});
