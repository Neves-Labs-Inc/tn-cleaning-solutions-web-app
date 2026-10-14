import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  describeFinalizeResult,
  describeMarkPaidResult,
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
