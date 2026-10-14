import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PayrollWriter } from "../../src/lib/payroll/payroll-writer.ts";

const TARGET = { employeeId: "ana", periodStart: "2026-10-05" };

type RpcResponse = { data: unknown; error: unknown };

// The Supabase client at its boundary: only rpc() is called.
function writerReturning(response: RpcResponse): PayrollWriter {
  const db = { rpc: async () => response };
  const silent = { warn: () => {}, error: () => {} };
  // A stand-in for the typed client; PayrollWriter only calls rpc().
  return new PayrollWriter(db as never, silent);
}

function refusal(code: string): RpcResponse {
  return {
    data: null,
    error: { message: "raised", details: code, hint: null, code: "P0001" },
  };
}

describe("PayrollWriter", () => {
  it("returns the new run id with a created status", async () => {
    const writer = writerReturning({ data: "run-1", error: null });

    assert.deepEqual(await writer.startOffCycle(TARGET), {
      value: { runId: "run-1" },
      error: null,
      status: 201,
    });
  });

  it("maps draft_exists to its message and a conflict status", async () => {
    const writer = writerReturning(refusal("draft_exists"));

    assert.deepEqual(await writer.startOffCycle(TARGET), {
      value: null,
      error: "This Cleaner already has an unpaid off-cycle run in this period.",
      status: 409,
    });
  });

  it("maps a missing run to a not-found status", async () => {
    const writer = writerReturning(refusal("run_not_found"));

    const result = await writer.undoFinalize("run-1");

    assert.equal(result.status, 404);
    assert.equal(
      result.error,
      "This Pay run no longer exists. Reload and try again.",
    );
  });

  it("maps a non-admin caller to a forbidden status", async () => {
    const writer = writerReturning(refusal("not_admin"));

    const result = await writer.deleteAdjustment("adj-1");

    assert.equal(result.status, 403);
  });

  it("hides an unknown database error behind a generic message and a 500", async () => {
    const writer = writerReturning({
      data: null,
      error: { message: "connection reset", details: null, code: "08006" },
    });

    assert.deepEqual(await writer.addCleaner(TARGET), {
      value: null,
      error: "Couldn't save. Try again.",
      status: 500,
    });
  });

  it("reads each finalize row by Cleaner", async () => {
    const writer = writerReturning({
      data: [
        {
          employee_id: "ana",
          period_start: "2026-10-05",
          code: "ok",
          message: null,
          detail: null,
          pay_run_id: "run-1",
        },
      ],
      error: null,
    });

    assert.deepEqual(await writer.finalize("2026-10-05", ["ana"]), {
      value: [
        {
          employeeId: "ana",
          payRunId: "run-1",
          code: "ok",
          message: null,
          detail: null,
        },
      ],
      error: null,
      status: 200,
    });
  });
});
