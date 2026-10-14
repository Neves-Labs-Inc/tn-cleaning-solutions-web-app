import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parsePayRateForm } from "../../src/lib/employees/pay-rate-form.ts";

function form(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    formData.set(name, value);
  }
  return formData;
}

describe("parsePayRateForm", () => {
  it("reads a rate in dollars as cents with its effective date", () => {
    const result = parsePayRateForm(
      form({ hourly_rate_cents: " 24.50 ", effective_from: "2026-10-05" }),
    );

    assert.deepEqual(result, {
      success: true,
      data: { hourly_rate_cents: 2450, effective_from: "2026-10-05" },
    });
  });

  it("accepts a back-dated rate", () => {
    const result = parsePayRateForm(
      form({ hourly_rate_cents: "22", effective_from: "2025-01-06" }),
    );

    assert.equal(result.success && result.data.effective_from, "2025-01-06");
  });

  it("refuses a zero, negative, non-numeric or empty rate under the rate field", () => {
    for (const rate of ["0", "0.00", "-5", "abc", ""]) {
      const result = parsePayRateForm(
        form({ hourly_rate_cents: rate, effective_from: "2026-10-05" }),
      );

      assert.equal(result.success, false, rate);
      assert.equal(
        !result.success && result.fieldErrors.hourly_rate_cents,
        "Enter a rate above $0.00.",
        rate,
      );
    }
  });

  it("refuses a rate over the shared money cap with the cap message", () => {
    const result = parsePayRateForm(
      form({ hourly_rate_cents: "1000000.01", effective_from: "2026-10-05" }),
    );

    assert.equal(
      !result.success && result.fieldErrors.hourly_rate_cents,
      "Enter an amount up to $1,000,000.00.",
    );
  });

  it("refuses a missing or impossible date under the date field", () => {
    for (const date of ["", "2026-02-31", "Oct 5"]) {
      const result = parsePayRateForm(
        form({ hourly_rate_cents: "24", effective_from: date }),
      );

      assert.equal(result.success, false, date);
      assert.equal(
        !result.success && result.fieldErrors.effective_from,
        "Enter a real date.",
        date,
      );
    }
  });

  it("reports both fields when both are wrong", () => {
    const result = parsePayRateForm(
      form({ hourly_rate_cents: "0", effective_from: "2026-13-01" }),
    );

    assert.deepEqual(!result.success && Object.keys(result.fieldErrors).sort(), [
      "effective_from",
      "hourly_rate_cents",
    ]);
  });
});
