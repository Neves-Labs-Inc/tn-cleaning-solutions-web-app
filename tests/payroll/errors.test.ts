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

function readSqlErrorCodes(): Set<string> {
  const [migration] = readdirSync(MIGRATIONS_DIR).filter((name) =>
    /_payroll_write_functions\.sql$/.test(name),
  );
  assert.ok(migration, "no payroll write functions migration found");

  const source = readFileSync(join(MIGRATIONS_DIR, migration), "utf8");
  return new Set(
    [...source.matchAll(/WHEN '([a-z_]+)' THEN/g)].map((match) => match[1]),
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
