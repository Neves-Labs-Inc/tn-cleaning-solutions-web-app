import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseNewRateForm,
  parseRateChangeForm,
} from "../../src/lib/clients/rate-form.ts";

function form(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    formData.set(name, value);
  }
  return formData;
}

describe("parseNewRateForm", () => {
  it("reads the job, rate, date and notes of a new rate", () => {
    const result = parseNewRateForm(
      form({
        job_id: "job-deep",
        hourly_rate_cents: "55.00",
        effective_from: "2026-11-01",
        notes: " Loyalty rate ",
      }),
    );

    assert.deepEqual(result, {
      success: true,
      data: {
        job_id: "job-deep",
        hourly_rate_cents: 5500,
        effective_from: "2026-11-01",
        notes: "Loyalty rate",
      },
    });
  });

  it("requires a job for a new rate", () => {
    const result = parseNewRateForm(
      form({ hourly_rate_cents: "55", effective_from: "2026-11-01" }),
    );

    assert.equal(result.success, false);
    assert.equal(
      !result.success && result.fieldErrors.job_id,
      "Job is required.",
    );
  });
});

describe("parseRateChangeForm", () => {
  it("never moves a rate to another job, even when one is posted", () => {
    const result = parseRateChangeForm(
      form({
        job_id: "job-other",
        hourly_rate_cents: "60",
        effective_from: "2027-01-01",
        notes: "",
      }),
    );

    assert.deepEqual(result, {
      success: true,
      data: {
        hourly_rate_cents: 6000,
        effective_from: "2027-01-01",
        notes: null,
      },
    });
  });

  it("doesn't ask for a job when changing a rate", () => {
    const result = parseRateChangeForm(
      form({ hourly_rate_cents: "60", effective_from: "2027-01-01" }),
    );

    assert.equal(result.success, true);
  });

  it("flags a bad rate and date", () => {
    const result = parseRateChangeForm(
      form({ hourly_rate_cents: "abc", effective_from: "soon" }),
    );

    assert.deepEqual(result, {
      success: false,
      error: "Please correct the highlighted fields.",
      fieldErrors: {
        hourly_rate_cents: "Enter a valid hourly rate in dollars.",
        effective_from: "Enter a valid date.",
      },
    });
  });
});
