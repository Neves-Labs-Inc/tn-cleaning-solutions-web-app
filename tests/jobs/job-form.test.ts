import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseJobFormData } from "../../src/lib/jobs/job-form.ts";

const PREMIUM_INVALID_MESSAGE = "Enter a premium in dollars, like 3.00.";

function form(fields: Record<string, string>): FormData {
  const formData = new FormData();
  const base = { name: "Deep clean", hourly_rate_cents: "45.00" };
  for (const [name, value] of Object.entries({ ...base, ...fields })) {
    formData.set(name, value);
  }
  return formData;
}

function premiumOf(result: ReturnType<typeof parseJobFormData>): number {
  assert.ok(result.success);
  return result.data.pay_premium_cents;
}

describe("parseJobFormData job pay premium", () => {
  it("saves a premium of 3 dollars as 300 cents", () => {
    assert.equal(premiumOf(parseJobFormData(form({ pay_premium_cents: "3" }))), 300);
  });

  it("saves a blank premium as 0", () => {
    assert.equal(premiumOf(parseJobFormData(form({ pay_premium_cents: "  " }))), 0);
  });

  it("saves a missing premium as 0", () => {
    assert.equal(premiumOf(parseJobFormData(form({}))), 0);
  });

  it("refuses a negative premium with a field error", () => {
    const result = parseJobFormData(form({ pay_premium_cents: "-3" }));
    assert.ok(!result.success);
    assert.equal(result.fieldErrors.pay_premium_cents, PREMIUM_INVALID_MESSAGE);
  });

  it("refuses a non-numeric premium with a field error", () => {
    const result = parseJobFormData(form({ pay_premium_cents: "abc" }));
    assert.ok(!result.success);
    assert.equal(result.fieldErrors.pay_premium_cents, PREMIUM_INVALID_MESSAGE);
  });

  it("refuses a premium over the money cap", () => {
    const result = parseJobFormData(form({ pay_premium_cents: "1000000.01" }));
    assert.ok(!result.success);
    assert.equal(result.fieldErrors.pay_premium_cents, "Enter an amount up to $1,000,000.00.");
  });
});
