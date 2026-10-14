import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseAdjustmentForm,
  parseRunTarget,
  parseSignedDollarsToCents,
} from "../../src/lib/payroll/action-input.ts";

const SESSION_ID = "6f1c2b9e-1d1a-4a39-9a43-1b1f0c6c9d10";
const EMPLOYEE_ID = "0b6f7f0e-3c43-4d8a-8f53-2b0d7c2e4a11";
const AMOUNT_ERROR = "Enter an amount, e.g. 20 or -12.50";
const REASON_ERROR = "Add a reason the Cleaner will see";

function adjustmentForm(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    formData.set(name, value);
  }
  return formData;
}

describe("parseSignedDollarsToCents", () => {
  it("reads a positive amount", () => {
    assert.deepEqual(parseSignedDollarsToCents("20"), { cents: 2000 });
  });

  it("reads a hyphen-minus deduction", () => {
    assert.deepEqual(parseSignedDollarsToCents("-12.50"), { cents: -1250 });
  });

  it("reads a deduction typed with the U+2212 minus the ledger displays", () => {
    assert.deepEqual(parseSignedDollarsToCents("−12.50"), { cents: -1250 });
  });

  it("refuses a sign with no digits", () => {
    assert.deepEqual(parseSignedDollarsToCents("-"), { error: "invalid" });
  });

  it("refuses a double sign", () => {
    assert.deepEqual(parseSignedDollarsToCents("--5"), { error: "invalid" });
  });

  it("refuses a deduction over the money cap", () => {
    assert.deepEqual(parseSignedDollarsToCents("-1000000.01"), {
      error: "too_large",
    });
  });
});

describe("parseAdjustmentForm", () => {
  it("parses a negative Adjustment for the whole run, trimming the reason", () => {
    const result = parseAdjustmentForm(
      adjustmentForm({ amount: " -12.50 ", reason: "  Gas  " }),
    );

    assert.deepEqual(result, {
      success: true,
      data: { amountCents: -1250, reason: "Gas", appointmentEmployeeId: null },
    });
  });

  it("keeps the appointment it points at", () => {
    const result = parseAdjustmentForm(
      adjustmentForm({
        amount: "20",
        reason: "Tip paid through the business",
        appointment_employee_id: SESSION_ID,
      }),
    );

    assert.deepEqual(result, {
      success: true,
      data: {
        amountCents: 2000,
        reason: "Tip paid through the business",
        appointmentEmployeeId: SESSION_ID,
      },
    });
  });

  it("refuses a blank amount and a blank reason with both field errors", () => {
    const result = parseAdjustmentForm(
      adjustmentForm({ amount: "", reason: "   " }),
    );

    assert.deepEqual(result, {
      success: false,
      fieldErrors: { amount: AMOUNT_ERROR, reason: REASON_ERROR },
    });
  });

  it("refuses a $0 amount", () => {
    const result = parseAdjustmentForm(
      adjustmentForm({ amount: "-0.00", reason: "Fix" }),
    );

    assert.deepEqual(result, {
      success: false,
      fieldErrors: { amount: AMOUNT_ERROR },
    });
  });

  it("refuses text that isn't an amount", () => {
    const result = parseAdjustmentForm(
      adjustmentForm({ amount: "twenty", reason: "Fix" }),
    );

    assert.deepEqual(result, {
      success: false,
      fieldErrors: { amount: AMOUNT_ERROR },
    });
  });

  it("refuses an amount over the cap with the shared cap message", () => {
    const result = parseAdjustmentForm(
      adjustmentForm({ amount: "2000000", reason: "Fix" }),
    );

    assert.deepEqual(result, {
      success: false,
      fieldErrors: { amount: "Enter an amount up to $1,000,000.00." },
    });
  });

  it("refuses a reason longer than the limit", () => {
    const result = parseAdjustmentForm(
      adjustmentForm({ amount: "5", reason: "x".repeat(501) }),
    );

    assert.deepEqual(result, {
      success: false,
      fieldErrors: { reason: "Keep the reason under 500 characters" },
    });
  });

  it("refuses an appointment value that isn't a session id", () => {
    const result = parseAdjustmentForm(
      adjustmentForm({
        amount: "5",
        reason: "Fix",
        appointment_employee_id: "not-an-id",
      }),
    );

    assert.deepEqual(result, {
      success: false,
      fieldErrors: { appointment: "Pick an appointment from the list" },
    });
  });
});

describe("parseRunTarget", () => {
  it("accepts a Cleaner id and a calendar date", () => {
    assert.deepEqual(
      parseRunTarget({ employeeId: EMPLOYEE_ID, periodStart: "2026-10-05" }),
      { employeeId: EMPLOYEE_ID, periodStart: "2026-10-05" },
    );
  });

  it("refuses an id that isn't a uuid", () => {
    assert.equal(
      parseRunTarget({ employeeId: "1; drop", periodStart: "2026-10-05" }),
      null,
    );
  });

  it("refuses a date that doesn't exist", () => {
    assert.equal(
      parseRunTarget({ employeeId: EMPLOYEE_ID, periodStart: "2026-02-30" }),
      null,
    );
  });
});
