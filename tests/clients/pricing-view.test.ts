import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type ClientJobPricingRow,
  pricingOverview,
} from "../../src/lib/clients/pricing-view.ts";

const TODAY = "2026-10-13";

function rate(
  id: string,
  effectiveFrom: string,
  overrides: Partial<ClientJobPricingRow> = {},
): ClientJobPricingRow {
  return {
    id,
    job_id: "job-deep",
    job_name: "Deep clean",
    hourly_rate_cents: 5500,
    effective_from: effectiveFrom,
    notes: null,
    is_archived: false,
    ...overrides,
  };
}

describe("pricingOverview", () => {
  it("picks the newest rate effective on or before today as current", () => {
    const overview = pricingOverview(
      [rate("old", "2026-01-01"), rate("now", "2026-10-13")],
      TODAY,
    );

    assert.equal(overview.jobs[0].current?.id, "now");
  });

  it("lists future rates as scheduled, soonest first", () => {
    const overview = pricingOverview(
      [
        rate("later", "2027-03-01"),
        rate("now", "2026-09-01"),
        rate("sooner", "2026-10-14"),
      ],
      TODAY,
    );

    assert.deepEqual(
      overview.jobs[0].scheduled.map((row) => row.id),
      ["sooner", "later"],
    );
  });

  it("moves older unarchived rates to history as superseded", () => {
    const overview = pricingOverview(
      [rate("now", "2026-09-01"), rate("old", "2026-01-01")],
      TODAY,
    );

    assert.deepEqual(
      overview.history.map((row) => [row.id, row.status]),
      [["old", "Superseded"]],
    );
  });

  it("moves archived rates to history as archived, newest first", () => {
    const overview = pricingOverview(
      [
        rate("now", "2026-09-01"),
        rate("old-archived", "2025-01-01", { is_archived: true }),
        rate("future-archived", "2027-01-01", { is_archived: true }),
        rate("superseded", "2026-02-01"),
      ],
      TODAY,
    );

    assert.equal(overview.jobs[0].current?.id, "now");
    assert.deepEqual(overview.jobs[0].scheduled, []);
    assert.deepEqual(
      overview.history.map((row) => [row.id, row.status]),
      [
        ["future-archived", "Archived"],
        ["superseded", "Superseded"],
        ["old-archived", "Archived"],
      ],
    );
  });

  it("gives a job with only scheduled rates no current rate", () => {
    const overview = pricingOverview([rate("next", "2026-11-01")], TODAY);

    assert.equal(overview.jobs[0].current, null);
    assert.deepEqual(
      overview.jobs[0].scheduled.map((row) => row.id),
      ["next"],
    );
  });

  it("leaves a job whose rates are all archived out of the jobs", () => {
    const overview = pricingOverview(
      [
        rate("archived", "2026-01-01", { is_archived: true }),
        rate("move-out", "2026-01-01", {
          job_id: "job-move",
          job_name: "Move-out clean",
        }),
      ],
      TODAY,
    );

    assert.deepEqual(
      overview.jobs.map((job) => job.jobId),
      ["job-move"],
    );
    assert.deepEqual(
      overview.history.map((row) => row.id),
      ["archived"],
    );
  });

  it("sorts jobs by name, then id", () => {
    const overview = pricingOverview(
      [
        rate("a", "2026-01-01", { job_id: "job-z", job_name: "Window" }),
        rate("b", "2026-01-01", { job_id: "job-b", job_name: "Deep clean" }),
        rate("c", "2026-01-01", { job_id: "job-a", job_name: "Deep clean" }),
      ],
      TODAY,
    );

    assert.deepEqual(
      overview.jobs.map((job) => [job.jobName, job.jobId]),
      [
        ["Deep clean", "job-a"],
        ["Deep clean", "job-b"],
        ["Window", "job-z"],
      ],
    );
  });
});
