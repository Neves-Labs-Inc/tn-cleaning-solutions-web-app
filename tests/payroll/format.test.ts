import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  describePaidRun,
  describePeriodHeader,
  describeProblemSession,
  formatDayLabel,
  formatLongDate,
  formatPeriodRange,
  formatPeriodRowCaption,
  formatSignedCents,
  getRunStateLine,
} from "../../src/lib/payroll/format.ts";
import { buildPeriodView } from "../../src/lib/payroll/period-view.ts";
import { summarizePeriods } from "../../src/lib/payroll/period-summary.ts";
import {
  claimed,
  missingClock,
  NOW,
  OCT_19,
  OCT_5,
  payrollData,
  run,
  session,
} from "./fixtures.ts";

function onlyRun(data: ReturnType<typeof payrollData>, period = OCT_5) {
  const view = buildPeriodView(data, period, NOW);
  assert.equal(view.runs.length, 1);
  return { view, run: view.runs[0] };
}

describe("formatSignedCents", () => {
  it("puts a plus on credits and a true minus sign on deductions", () => {
    assert.equal(formatSignedCents(2200), "+$22.00");
    assert.equal(formatSignedCents(-1250), "−$12.50");
    assert.equal(formatSignedCents(0), "$0.00");
  });
});

describe("dates", () => {
  it("formats a ledger day with its weekday", () => {
    assert.equal(formatDayLabel("2026-10-12"), "Mon Oct 12");
    assert.equal(formatDayLabel("2026-10-18"), "Sun Oct 18");
  });

  it("formats a long date with its year", () => {
    assert.equal(formatLongDate("2026-10-20"), "Oct 20, 2026");
  });

  it("formats a period's range, naming both years when it crosses one", () => {
    assert.equal(formatPeriodRange(OCT_5), "Oct 5 – Oct 18, 2026");
    assert.equal(
      formatPeriodRange({ start: "2026-12-28", end: "2027-01-10" }),
      "Dec 28, 2026 – Jan 10, 2027",
    );
  });
});

describe("describePeriodHeader", () => {
  it("gives the range, Cleaner count and clocked hours", () => {
    const data = payrollData({
      sessions: [
        session("s1", "ana", { clocked_minutes: 185 }),
        session("s2", "carla"),
      ],
    });

    const view = buildPeriodView(data, OCT_5, NOW);

    assert.equal(
      describePeriodHeader(view),
      "Oct 5 – Oct 18, 2026 · 2 Cleaners · 6:05 clocked",
    );
  });

  it("says 0 Cleaners and 0:00 for a period with no runs", () => {
    const view = buildPeriodView(payrollData(), OCT_5, NOW);

    assert.equal(
      describePeriodHeader(view),
      "Oct 5 – Oct 18, 2026 · 0 Cleaners · 0:00 clocked",
    );
  });
});

describe("describeProblemSession", () => {
  it("names the clock-in time of an Open shift in Toronto time", () => {
    assert.equal(
      describeProblemSession({
        kind: "open_shift",
        clockedInAt: "2026-10-08T13:00:00Z",
      }),
      "Clocked in 9:00 AM, no clock-out",
    );
  });

  it("tells the admin how to fix a Missing clock", () => {
    assert.equal(
      describeProblemSession({ kind: "missing_clock", clockedInAt: null }),
      "Never clocked in. Enter her clocks, or take her off the crew if she didn't work",
    );
  });
});

describe("describePaidRun", () => {
  it("gives the paid date and Payout method", () => {
    assert.equal(
      describePaidRun({ paidOn: "2026-10-20", payoutMethod: "e-Transfer" }),
      "Paid Oct 20, 2026 by e-Transfer",
    );
  });
});

describe("getRunStateLine", () => {
  it("says when a draft in a running period can be finalized", () => {
    const data = payrollData({
      sessions: [session("s1", "ana", { period_start: OCT_19.start })],
    });

    const { view, run: draft } = onlyRun(data, OCT_19);

    assert.deepEqual(getRunStateLine(draft, view.status), {
      tone: "muted",
      text: "Can finalize from Mon Nov 2",
    });
  });

  it("leads with the blocker on a blocked draft in a running period", () => {
    const data = payrollData({
      sessions: [missingClock("s1", "ana", { period_start: OCT_19.start })],
    });

    const { view, run: draft } = onlyRun(data, OCT_19);

    assert.deepEqual(getRunStateLine(draft, view.status), {
      tone: "destructive",
      text: "Fix 1 Missing clock to finalize from Mon Nov 2",
    });
  });

  it("gives a blocked draft's reason", () => {
    const { view, run: draft } = onlyRun(
      payrollData({ sessions: [missingClock("s1", "ana")] }),
    );

    assert.deepEqual(getRunStateLine(draft, view.status), {
      tone: "destructive",
      text: "Fix 1 Missing clock to finalize",
    });
  });

  it("warns about Odd durations on a draft that can still finalize", () => {
    const { view, run: draft } = onlyRun(
      payrollData({
        sessions: [
          session("s1", "ana", { is_odd_duration: true }),
          session("s2", "ana", { is_odd_duration: true }),
        ],
      }),
    );

    assert.deepEqual(getRunStateLine(draft, view.status), {
      tone: "warning",
      text: "2 Odd duration warnings, finalizing is allowed",
    });
  });

  it("says a clean draft in an ended period is ready", () => {
    const { view, run: draft } = onlyRun(
      payrollData({ sessions: [session("s1", "ana")] }),
    );

    assert.deepEqual(getRunStateLine(draft, view.status), {
      tone: "muted",
      text: "Ready to finalize",
    });
  });

  it("says a finalized run is not paid yet", () => {
    const finalized = run("r-ana", "ana", { status: "finalized" });
    const { view, run: stored } = onlyRun(
      payrollData({
        runs: [finalized],
        sessions: [claimed(session("s1", "ana"), finalized)],
      }),
    );

    assert.deepEqual(getRunStateLine(stored, view.status), {
      tone: "muted",
      text: "Finalized · not paid yet",
    });
  });

  it("says when and how a paid run was paid", () => {
    const paid = run("r-ana", "ana", {
      status: "paid",
      paid_on: "2026-10-20",
      payout_method: "e-Transfer",
    });
    const { view, run: stored } = onlyRun(payrollData({ runs: [paid] }));

    assert.deepEqual(getRunStateLine(stored, view.status), {
      tone: "paid",
      text: "Paid Oct 20, 2026 by e-Transfer",
    });
  });
});

describe("formatPeriodRowCaption", () => {
  // Toronto: Tue Nov 3, 2026. Nov 2–15 is running.
  const NOV_3 = new Date("2026-11-03T15:00:00Z");

  it("says when a running period can be finalized", () => {
    const [running] = summarizePeriods(payrollData(), NOV_3).rows;

    assert.equal(
      formatPeriodRowCaption(running),
      "Running · finalize from Mon Nov 16",
    );
  });

  it("keeps the Cleaner caption on an ended period", () => {
    const data = payrollData({ sessions: [session("s1", "ana")] });
    const [, , october] = summarizePeriods(data, NOV_3).rows;

    assert.equal(formatPeriodRowCaption(october), "1 Cleaner · 1 draft");
  });
});
