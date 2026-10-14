import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { summarizePeriods } from "../../src/lib/payroll/period-summary.ts";
import {
  adjustment,
  missingClock,
  NOW,
  OCT_19,
  openShift,
  payrollData,
  run,
  session,
} from "./fixtures.ts";

// Toronto: Tue Nov 3, 2026. Oct 5–18 and Oct 19–Nov 1 have ended; Nov 2–15 is running.
const NOV_3 = new Date("2026-11-03T15:00:00Z");

describe("summarizePeriods: list rows", () => {
  it("gives one row per period from the Payroll start, newest first", () => {
    const summary = summarizePeriods(payrollData(), NOV_3);

    assert.deepEqual(
      summary.rows.map((row) => [
        row.period.start,
        row.label,
        row.status.label,
      ]),
      [
        ["2026-11-02", "Nov 2–15", "Running"],
        ["2026-10-19", "Oct 19–Nov 1", "No pay"],
        ["2026-10-05", "Oct 5–18", "No pay"],
      ],
    );
  });

  it("counts Cleaners, totals and blocked runs, with a caption", () => {
    const finalized = run("r-maria", "maria", { status: "finalized" });
    const data = payrollData({
      runs: [finalized],
      adjustments: [adjustment("a1", "r-maria", 1500)],
      sessions: [
        session("s1", "ana"),
        missingClock("s2", "carla"),
        session("s3", "maria", { scheduled_date: "2026-10-16" }),
      ],
    });

    const [, , october] = summarizePeriods(data, NOV_3).rows;

    assert.equal(october.status.label, "Ready to review");
    assert.equal(october.cleanerCount, 3);
    assert.equal(october.totalCents, 7500);
    assert.equal(october.blockedCount, 1);
    assert.equal(october.stragglerCount, 1);
    assert.equal(october.caption, "3 Cleaners · 2 draft · 1 to pay");
    assert.equal(october.href, "/solutions/payroll/2026-10-05");
  });

  it("counts every run's flags", () => {
    const data = payrollData({
      sessions: [
        session("s1", "ana", { is_odd_duration: true }),
        openShift("s2", "ana"),
        missingClock("s3", "carla"),
      ],
    });

    const [, , october] = summarizePeriods(data, NOV_3).rows;

    assert.equal(october.flagCount, 3);
  });

  it("captions a period with no runs", () => {
    const [, , october] = summarizePeriods(payrollData(), NOV_3).rows;

    assert.equal(october.caption, "No Cleaners");
  });

  it("counts a Cleaner with two runs once", () => {
    const data = payrollData({
      runs: [
        run("r-ana", "ana", {
          status: "paid",
          paid_on: "2026-10-20",
          payout_method: "Cash",
        }),
        run("r-ana-off", "ana", {
          kind: "off_cycle",
          status: "paid",
          paid_on: "2026-10-27",
          payout_method: "Cash",
        }),
      ],
    });

    const [, , october] = summarizePeriods(data, NOV_3).rows;

    assert.equal(october.cleanerCount, 1);
    assert.equal(october.caption, "1 Cleaner · 2 paid");
  });
});

describe("summarizePeriods: banner lines", () => {
  it("lists ended periods ready to review, oldest first", () => {
    const data = payrollData({
      sessions: [
        session("s1", "ana"),
        openShift("s2", "carla"),
        missingClock("s3", "maria"),
        session("s4", "ana", { period_start: OCT_19.start }),
        // The running period never gets a banner.
        session("s5", "ana", { period_start: "2026-11-02" }),
      ],
    });

    const { bannerLines } = summarizePeriods(data, NOV_3);

    assert.deepEqual(bannerLines, [
      {
        text: "Pay period Oct 5–18 ready to review · 2 blocked",
        label: "Oct 5–18",
        blockedCount: 2,
        href: "/solutions/payroll/2026-10-05",
      },
      {
        text: "Pay period Oct 19–Nov 1 ready to review",
        label: "Oct 19–Nov 1",
        blockedCount: 0,
        href: "/solutions/payroll/2026-10-19",
      },
    ]);
  });

  it("leaves out periods that are finalized, paid or have no pay", () => {
    const data = payrollData({
      runs: [run("r-ana", "ana", { status: "finalized" })],
    });

    assert.deepEqual(summarizePeriods(data, NOV_3).bannerLines, []);
  });

  it("shows nothing while the first period is still running", () => {
    const data = payrollData({ sessions: [session("s1", "ana")] });

    const summary = summarizePeriods(data, new Date("2026-10-14T15:00:00Z"));

    assert.deepEqual(summary.bannerLines, []);
  });

  it("shows nothing before the Payroll start", () => {
    const summary = summarizePeriods(
      payrollData(),
      new Date("2026-09-30T15:00:00Z"),
    );

    assert.deepEqual(summary, { rows: [], bannerLines: [] });
  });

  it("names the period that ended last week", () => {
    const data = payrollData({ sessions: [session("s1", "ana")] });

    assert.equal(
      summarizePeriods(data, NOW).bannerLines[0]?.text,
      "Pay period Oct 5–18 ready to review",
    );
  });
});
