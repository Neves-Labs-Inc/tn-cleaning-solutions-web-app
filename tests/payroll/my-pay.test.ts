import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildMyPay,
  formatPayPeriodRange,
  type MyPayAdjustmentRow,
  type MyPayLineRow,
  type MyPayRunRow,
} from "../../src/lib/payroll/my-pay.ts";

function runRow(overrides: Partial<MyPayRunRow> = {}): MyPayRunRow {
  return {
    id: "run-1",
    period_start: "2026-10-05",
    kind: "regular",
    paid_on: "2026-10-20",
    payout_method: "e-Transfer",
    total_cents: 84250,
    ...overrides,
  };
}

function lineRow(overrides: Partial<MyPayLineRow> = {}): MyPayLineRow {
  return {
    id: "line-1",
    pay_run_id: "run-1",
    scheduled_date: "2026-10-06",
    client_name: "Smith residence",
    minutes: 195,
    rate_cents: 2200,
    amount_cents: 7150,
    ...overrides,
  };
}

function adjustmentRow(
  overrides: Partial<MyPayAdjustmentRow> = {},
): MyPayAdjustmentRow {
  return {
    id: "adj-1",
    pay_run_id: "run-1",
    amount_cents: 1500,
    reason: "Gas money",
    linked_scheduled_date: null,
    linked_client_name: null,
    created_at: "2026-10-19T12:00:00Z",
    ...overrides,
  };
}

function allRuns(myPay: ReturnType<typeof buildMyPay>) {
  return myPay.groups.flatMap((group) => group.runs);
}

describe("formatPayPeriodRange", () => {
  it("drops the repeated month inside one month", () => {
    assert.equal(formatPayPeriodRange("2026-10-05"), "Oct 5–18");
  });

  it("spaces the dash when the period crosses a month", () => {
    assert.equal(formatPayPeriodRange("2026-10-19"), "Oct 19 – Nov 1");
  });

  it("names both years when the period crosses a year", () => {
    assert.equal(
      formatPayPeriodRange("2025-12-28"),
      "Dec 28, 2025 – Jan 10, 2026",
    );
  });
});

describe("buildMyPay: runs", () => {
  it("labels a run with its period, paid line and total", () => {
    const [run] = allRuns(buildMyPay({ runs: [runRow()], lines: [], adjustments: [] }));

    assert.equal(run.periodLabel, "Oct 5–18");
    assert.equal(run.paidLabel, "Paid Oct 20, 2026 by e-Transfer");
    assert.equal(run.totalCents, 84250);
    assert.equal(run.isOffCycle, false);
  });

  it("marks an off-cycle run", () => {
    const [run] = allRuns(
      buildMyPay({ runs: [runRow({ kind: "off_cycle" })], lines: [], adjustments: [] }),
    );

    assert.equal(run.isOffCycle, true);
  });

  it("orders runs newest paid first, then newest period, then regular before off-cycle", () => {
    const myPay = buildMyPay({
      runs: [
        runRow({ id: "old", paid_on: "2026-10-08", period_start: "2026-09-21" }),
        runRow({ id: "off", paid_on: "2026-11-03", period_start: "2026-10-19", kind: "off_cycle" }),
        runRow({ id: "earlier-period", paid_on: "2026-11-03", period_start: "2026-10-05" }),
        runRow({ id: "regular", paid_on: "2026-11-03", period_start: "2026-10-19" }),
      ],
      lines: [],
      adjustments: [],
    });

    assert.deepEqual(
      allRuns(myPay).map((run) => run.id),
      ["regular", "off", "earlier-period", "old"],
    );
  });

  it("formats each line with its date, h:mm and the rate it used, oldest first", () => {
    const [run] = allRuns(
      buildMyPay({
        runs: [runRow()],
        lines: [
          lineRow({ id: "later", scheduled_date: "2026-10-08", minutes: 45, client_name: "Jones" }),
          lineRow({ id: "earlier" }),
          lineRow({ id: "other-run", pay_run_id: "run-2" }),
        ],
        adjustments: [],
      }),
    );

    assert.deepEqual(run.lines, [
      {
        id: "earlier",
        clientName: "Smith residence",
        dateLabel: "Tue, Oct 6",
        hoursLabel: "3:15 h",
        rateCents: 2200,
        amountCents: 7150,
      },
      {
        id: "later",
        clientName: "Jones",
        dateLabel: "Thu, Oct 8",
        hoursLabel: "0:45 h",
        rateCents: 2200,
        amountCents: 7150,
      },
    ]);
  });

  it("lists Adjustments in the order they were added, signed, with the linked line if any", () => {
    const [run] = allRuns(
      buildMyPay({
        runs: [runRow()],
        lines: [],
        adjustments: [
          adjustmentRow({
            id: "second",
            amount_cents: -1000,
            reason: "Uniform",
            created_at: "2026-10-19T12:05:00Z",
          }),
          adjustmentRow({
            id: "first",
            linked_scheduled_date: "2026-10-06",
            linked_client_name: "Smith residence",
          }),
        ],
      }),
    );

    assert.deepEqual(run.adjustments, [
      {
        id: "first",
        reason: "Gas money",
        linkedLabel: "Oct 6 · Smith residence",
        amountLabel: "+$15.00",
      },
      { id: "second", reason: "Uniform", linkedLabel: null, amountLabel: "−$10.00" },
    ]);
  });
});

describe("buildMyPay: year groups", () => {
  it("keeps one unlabelled group when every run was paid in one year", () => {
    const myPay = buildMyPay({
      runs: [runRow({ id: "a" }), runRow({ id: "b", paid_on: "2026-11-03" })],
      lines: [],
      adjustments: [],
    });

    assert.deepEqual(
      myPay.groups.map((group) => [group.yearLabel, group.runs.length]),
      [[null, 2]],
    );
  });

  it("groups by paid year, newest first, when runs span years", () => {
    const myPay = buildMyPay({
      runs: [
        runRow({ id: "old", paid_on: "2026-12-30", period_start: "2026-12-14" }),
        runRow({ id: "new", paid_on: "2027-01-12", period_start: "2026-12-28" }),
      ],
      lines: [],
      adjustments: [],
    });

    assert.deepEqual(
      myPay.groups.map((group) => [group.yearLabel, group.runs.map((run) => run.id)]),
      [
        ["2027", ["new"]],
        ["2026", ["old"]],
      ],
    );
  });

  it("has no groups without paid runs", () => {
    assert.deepEqual(buildMyPay({ runs: [], lines: [], adjustments: [] }).groups, []);
  });
});

describe("buildMyPay: last paid run", () => {
  it("sums the newest run's line minutes and labels its period", () => {
    const myPay = buildMyPay({
      runs: [
        runRow({ id: "old", paid_on: "2026-10-08", period_start: "2026-09-21" }),
        runRow(),
      ],
      lines: [
        lineRow({ id: "a" }),
        lineRow({ id: "b", minutes: 45 }),
        lineRow({ id: "c", pay_run_id: "old", minutes: 600 }),
      ],
      adjustments: [],
    });

    assert.deepEqual(myPay.lastRun, { minutes: 240, periodLabel: "Oct 5–18" });
  });

  it("is null with no paid runs", () => {
    assert.equal(buildMyPay({ runs: [], lines: [], adjustments: [] }).lastRun, null);
  });
});
