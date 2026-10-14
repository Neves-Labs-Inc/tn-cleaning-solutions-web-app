import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildPayrollExportModel } from "../../src/lib/payroll/export-model.ts";
import {
  adjustment,
  claimed,
  frozenLine,
  OCT_5,
  payrollData,
  run,
  session,
} from "./fixtures.ts";

describe("buildPayrollExportModel: which runs count", () => {
  it("keeps finalized and paid runs and leaves drafts out", () => {
    const paid = run("r-ana", "ana", {
      status: "paid",
      paid_on: "2026-10-20",
      payout_method: "e-Transfer",
    });
    const finalized = run("r-carla", "carla", { status: "finalized" });
    const draft = run("r-maria", "maria");
    const data = payrollData({
      sessions: [
        claimed(session("s2", "carla", { amount_cents: 5000 }), finalized),
        session("s3", "maria"),
      ],
      runs: [paid, finalized, draft],
      runLines: [frozenLine("r-ana", "s1", { amount_cents: 6100 })],
    });

    const model = buildPayrollExportModel(data, OCT_5, []);

    assert.deepEqual(
      model.summary.lines.map((line) => [
        line.name,
        line.totalCents,
        line.payoutMethods,
        line.paidDates,
      ]),
      [
        ["Ana Costa", 6100, ["e-Transfer"], ["2026-10-20"]],
        ["Carla Mendes", 5000, [], []],
      ],
    );
    assert.equal(model.summary.total.totalCents, 11100);
  });

  it("has no Cleaners when the period has only drafts", () => {
    const data = payrollData({
      sessions: [session("s1", "ana")],
      runs: [run("r-ana", "ana")],
    });

    const model = buildPayrollExportModel(data, OCT_5, []);

    assert.deepEqual(model.cleaners, []);
    assert.equal(model.summary.total.totalCents, 0);
  });
});

describe("buildPayrollExportModel: one Cleaner's runs merged", () => {
  it("merges a paid regular run and an off-cycle run paid later into one line", () => {
    const regular = run("r-reg", "ana", {
      status: "paid",
      paid_on: "2026-10-20",
      payout_method: "e-Transfer",
    });
    const offCycle = run("r-off", "ana", {
      kind: "off_cycle",
      status: "paid",
      paid_on: "2026-11-03",
      payout_method: "Cash",
    });
    const data = payrollData({
      runs: [regular, offCycle],
      runLines: [
        frozenLine("r-reg", "s1", { scheduled_date: "2026-10-09" }),
        frozenLine("r-off", "s2", {
          scheduled_date: "2026-10-06",
          client_name: "Hughes residence",
          minutes: 185,
          rate_cents: 2300,
          amount_cents: 7092,
        }),
      ],
    });

    const model = buildPayrollExportModel(data, OCT_5, []);

    assert.equal(model.summary.lines.length, 1);
    const [line] = model.summary.lines;
    assert.equal(line.minutes, 365);
    assert.equal(line.totalCents, 13092);
    assert.deepEqual(line.payoutMethods, ["Cash", "e-Transfer"]);
    assert.deepEqual(line.paidDates, ["2026-10-20", "2026-11-03"]);
    assert.deepEqual(
      model.cleaners[0].lines.map((item) => [item.date, item.clientName]),
      [
        ["2026-10-06", "Hughes residence"],
        ["2026-10-09", "Patel residence"],
      ],
    );
  });

  it("lists a finalized run's live lines and every Adjustment with its linked date", () => {
    const finalized = run("r-ana", "ana", { status: "finalized" });
    const data = payrollData({
      sessions: [
        claimed(
          session("s1", "ana", {
            scheduled_date: "2026-10-12",
            clocked_minutes: 125,
            effective_rate_cents: 2500,
            amount_cents: 5208,
          }),
          finalized,
        ),
      ],
      runs: [finalized],
      adjustments: [
        adjustment("a1", "r-ana", 2000, {
          reason: "Tip",
          appointment_employee_id: "s1",
        }),
        adjustment("a2", "r-ana", -1250, {
          reason: "Overpaid",
          created_at: "2026-10-20T15:00:00Z",
        }),
      ],
    });

    const model = buildPayrollExportModel(data, OCT_5, []);

    const [ana] = model.cleaners;
    assert.deepEqual(ana.lines, [
      {
        date: "2026-10-12",
        clientName: "Patel residence",
        jobName: "Standard clean",
        minutes: 125,
        rateCents: 2500,
        amountCents: 5208,
      },
    ]);
    assert.deepEqual(ana.adjustments, [
      { reason: "Tip", linkedDate: "2026-10-12", amountCents: 2000 },
      { reason: "Overpaid", linkedDate: null, amountCents: -1250 },
    ]);
    assert.equal(ana.shiftPayCents, 5208);
    assert.equal(ana.adjustmentsCents, 750);
    assert.equal(ana.totalCents, 5958);
  });
});

describe("buildPayrollExportModel: totals and rates", () => {
  it("sorts Cleaners by name and sums their totals into the grand total", () => {
    const maria = run("r-maria", "maria", { status: "finalized" });
    const ana = run("r-ana", "ana", { status: "finalized" });
    const data = payrollData({
      sessions: [
        claimed(session("s1", "maria", { amount_cents: 4000 }), maria),
        claimed(session("s2", "ana", { amount_cents: 6000 }), ana),
      ],
      runs: [maria, ana],
      adjustments: [adjustment("a1", "r-maria", 500)],
    });

    const model = buildPayrollExportModel(data, OCT_5, []);

    assert.deepEqual(
      model.summary.lines.map((line) => line.name),
      ["Ana Costa", "Maria Silva"],
    );
    assert.deepEqual(model.summary.total, {
      minutes: 360,
      shiftPayCents: 10000,
      adjustmentsCents: 500,
      totalCents: 10500,
    });
  });

  it("gives each Cleaner the live Pay rate in effect on the period's last day", () => {
    const ana = run("r-ana", "ana", { status: "finalized" });
    const carla = run("r-carla", "carla", { status: "finalized" });
    const data = payrollData({
      sessions: [
        claimed(session("s1", "ana"), ana),
        claimed(session("s2", "carla"), carla),
      ],
      runs: [ana, carla],
    });
    const rate = (effectiveFrom: string, cents: number, isArchived = false) => ({
      employee_id: "ana",
      hourly_rate_cents: cents,
      effective_from: effectiveFrom,
      is_archived: isArchived,
    });

    const model = buildPayrollExportModel(data, OCT_5, [
      rate("2026-01-01", 1800),
      rate("2026-10-10", 2000),
      rate("2026-10-15", 2600, true),
      rate("2026-10-19", 2200),
    ]);

    assert.deepEqual(model.currentRates, { ana: 2000, carla: null });
  });
});
