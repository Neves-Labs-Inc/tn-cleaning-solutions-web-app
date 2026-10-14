import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  describeFinalizeResult,
  describeMarkPaidResult,
  toBulkOutcome,
} from "../../src/lib/payroll/bulk-result.ts";

const NO_BLOCKERS = { openShifts: 0, missingClocks: 0, noRateLines: 0 };

describe("describeFinalizeResult", () => {
  it("counts the finalized runs and names each blocked Cleaner with her reason", () => {
    const text = describeFinalizeResult([
      { cleanerName: "Ana", refusal: null },
      {
        cleanerName: "Carla",
        refusal: { blockers: { ...NO_BLOCKERS, missingClocks: 1 } },
      },
      { cleanerName: "Juliana", refusal: null },
      {
        cleanerName: "Maria",
        refusal: { blockers: { ...NO_BLOCKERS, openShifts: 1 } },
      },
    ]);

    assert.equal(
      text,
      "Finalized 2 · 2 blocked: Carla: 1 Missing clock, Maria: 1 Open shift",
    );
  });

  it("is just the count when nothing was refused", () => {
    const text = describeFinalizeResult([
      { cleanerName: "Ana", refusal: null },
      { cleanerName: "Maria", refusal: null },
    ]);

    assert.equal(text, "Finalized 2");
  });

  it("names a missing Pay rate and other refusals", () => {
    const text = describeFinalizeResult([
      {
        cleanerName: "Ana",
        refusal: {
          blockers: { openShifts: 1, missingClocks: 2, noRateLines: 1 },
        },
      },
      {
        cleanerName: "Bea",
        refusal: { blockers: { ...NO_BLOCKERS, noRateLines: 2 } },
      },
      { cleanerName: "Carla", refusal: { message: "nothing to finalize" } },
    ]);

    assert.equal(
      text,
      "Finalized 0 · 3 blocked: Ana: 1 Open shift and 2 Missing clocks and no Pay rate, " +
        "Bea: no Pay rate, Carla: nothing to finalize",
    );
  });
});

describe("describeMarkPaidResult", () => {
  it("uses the same pattern with Marked … paid", () => {
    const text = describeMarkPaidResult([
      { cleanerName: "Maria", refusal: null },
      { cleanerName: "Juliana", refusal: null },
      {
        cleanerName: "Ana",
        refusal: { blockers: { ...NO_BLOCKERS, missingClocks: 1 } },
      },
      { cleanerName: "Carla", refusal: null },
    ]);

    assert.equal(text, "Marked 3 paid · 1 blocked: Ana: 1 Missing clock");
  });

  it("is just the count when nothing was refused", () => {
    assert.equal(
      describeMarkPaidResult([
        { cleanerName: "Ana", refusal: null },
        { cleanerName: "Bea", refusal: null },
        { cleanerName: "Carla", refusal: null },
      ]),
      "Marked 3 paid",
    );
  });
});

describe("toBulkOutcome", () => {
  it("reads a finalized row as done", () => {
    assert.deepEqual(
      toBulkOutcome({ code: "ok", message: null, detail: null }, "Ana"),
      { cleanerName: "Ana", refusal: null },
    );
  });

  it("reads a blocked row's counts per kind", () => {
    const outcome = toBulkOutcome(
      {
        code: "blocked",
        message: "raised text",
        detail: { open_shift: 1, missing_clock: 0, no_rate: 2 },
      },
      "Carla",
    );

    assert.deepEqual(outcome, {
      cleanerName: "Carla",
      refusal: {
        blockers: { openShifts: 1, missingClocks: 0, noRateLines: 2 },
      },
    });
  });

  it("describes a blocked row with its reasons in the result line", () => {
    const outcome = toBulkOutcome(
      {
        code: "blocked",
        message: null,
        detail: { open_shift: 0, missing_clock: 1, no_rate: 0 },
      },
      "Carla",
    );

    assert.equal(
      describeFinalizeResult([outcome]),
      "Finalized 0 · 1 blocked: Carla: 1 Missing clock",
    );
  });

  it("gives any other refusal its readable message", () => {
    const outcome = toBulkOutcome(
      { code: "nothing_to_finalize", message: "raised text", detail: null },
      "Maria",
    );

    assert.deepEqual(outcome, {
      cleanerName: "Maria",
      refusal: { message: "There's no draft Pay run to finalize." },
    });
  });

  it("gives an unknown code a generic message", () => {
    const outcome = toBulkOutcome(
      { code: "something_new", message: "raised text", detail: null },
      "Maria",
    );

    assert.deepEqual(outcome, {
      cleanerName: "Maria",
      refusal: { message: "Couldn't save. Try again." },
    });
  });
});
