import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildPeriodView } from "../../src/lib/payroll/period-view.ts";
import {
  adjustment,
  ANA,
  CARLA,
  claimed,
  cleaner,
  frozenLine,
  MARIA,
  missingClock,
  noRate,
  NOW,
  OCT_19,
  OCT_5,
  openShift,
  payrollData,
  run,
  session,
} from "./fixtures.ts";

function only<T>(items: T[]): T {
  assert.equal(items.length, 1, `expected one item, got ${items.length}`);
  return items[0];
}

describe("buildPeriodView: draft runs", () => {
  it("gives a $0 blocked draft to a Cleaner whose only session is a Missing clock", () => {
    const data = payrollData({
      sessions: [missingClock("s1", "carla", { scheduled_date: "2026-10-11" })],
    });

    const view = buildPeriodView(data, OCT_5, NOW);

    const carla = only(view.runs);
    assert.equal(carla.cleaner.name, "Carla Mendes");
    assert.equal(carla.kind, "regular");
    assert.equal(carla.status, "draft");
    assert.equal(carla.runId, null);
    assert.equal(carla.totalCents, 0);
    assert.deepEqual(carla.lines, []);
    assert.equal(carla.blockedReason, "Fix 1 Missing clock to finalize");
    assert.deepEqual(carla.problemSessions, [
      {
        appointmentEmployeeId: "s1",
        date: "2026-10-11",
        clientName: "Patel residence",
        jobName: "Standard clean",
        kind: "missing_clock",
        href: "/solutions/time-tracking?cleaner=carla&from=2026-10-11&to=2026-10-11",
      },
    ]);
    assert.equal(carla.flagCount, 1);
  });

  it("prices each unclaimed closed shift and adds Adjustments on top", () => {
    const stored = run("r-ana", "ana");
    const data = payrollData({
      sessions: [
        session("s1", "ana", { scheduled_date: "2026-10-09" }),
        session("s2", "ana", {
          scheduled_date: "2026-10-06",
          client_name: "Hughes residence",
          clocked_minutes: 185,
          effective_rate_cents: 2300,
          amount_cents: 7092,
        }),
      ],
      runs: [stored],
      adjustments: [
        adjustment("a1", "r-ana", 2000, {
          reason: "Tip from Mrs. Patel",
          appointment_employee_id: "s1",
        }),
        adjustment("a2", "r-ana", -1250, {
          reason: "Overpaid last period",
          created_at: "2026-10-20T15:00:00Z",
        }),
      ],
      editedSessionIds: ["s2"],
    });

    const ana = only(buildPeriodView(data, OCT_5, NOW).runs);

    assert.equal(ana.runId, "r-ana");
    assert.deepEqual(ana.lines, [
      {
        appointmentEmployeeId: "s2",
        date: "2026-10-06",
        clientName: "Hughes residence",
        jobName: "Standard clean",
        minutes: 185,
        rateCents: 2300,
        amountCents: 7092,
        isEdited: true,
        isOddDuration: false,
      },
      {
        appointmentEmployeeId: "s1",
        date: "2026-10-09",
        clientName: "Patel residence",
        jobName: "Standard clean",
        minutes: 180,
        rateCents: 2000,
        amountCents: 6000,
        isEdited: false,
        isOddDuration: false,
      },
    ]);
    assert.deepEqual(ana.adjustments, [
      {
        id: "a1",
        amountCents: 2000,
        reason: "Tip from Mrs. Patel",
        appointmentLabel: "Oct 9 · Patel residence",
      },
      {
        id: "a2",
        amountCents: -1250,
        reason: "Overpaid last period",
        appointmentLabel: null,
      },
    ]);
    assert.equal(ana.minutes, 365);
    assert.equal(ana.shiftPayCents, 13092);
    assert.equal(ana.adjustmentsCents, 750);
    assert.equal(ana.totalCents, 13842);
    assert.equal(ana.blockedReason, null);
  });

  it("flags an Odd duration without blocking", () => {
    const data = payrollData({
      sessions: [session("s1", "ana", { is_odd_duration: true })],
    });

    const ana = only(buildPeriodView(data, OCT_5, NOW).runs);

    assert.equal(ana.flagCount, 1);
    assert.equal(ana.lines[0].isOddDuration, true);
    assert.equal(ana.blockedReason, null);
  });

  it("tags an inactive Cleaner's run", () => {
    const data = payrollData({
      cleaners: [cleaner("bea", "Beatriz Lima", { isActive: false })],
      sessions: [session("s1", "bea")],
    });

    const bea = only(buildPeriodView(data, OCT_5, NOW).runs);

    assert.deepEqual(bea.cleaner, {
      id: "bea",
      name: "Beatriz Lima",
      isActive: false,
    });
  });

  it("leaves a no-rate shift out of shift pay and links to the Pay section", () => {
    const data = payrollData({
      sessions: [session("s1", "ana"), noRate("s2", "ana")],
    });

    const ana = only(buildPeriodView(data, OCT_5, NOW).runs);

    assert.equal(ana.shiftPayCents, 6000);
    assert.equal(ana.minutes, 360);
    assert.deepEqual(
      ana.noRateLines.map((line) => [line.appointmentEmployeeId, line.href]),
      [["s2", "/solutions/employees/ana#pay"]],
    );
    assert.equal(ana.blockedReason, "Add a Pay rate to finalize");
  });

  it("ignores sessions on cancelled appointments", () => {
    const data = payrollData({
      sessions: [
        session("s1", "ana", { is_payable: false }),
        openShift("s2", "ana", { is_payable: false }),
      ],
    });

    assert.deepEqual(buildPeriodView(data, OCT_5, NOW).runs, []);
  });

  it("carries the Cleaner's default Payout method and e-Transfer contact", () => {
    const data = payrollData({ sessions: [session("s1", "maria")] });

    const maria = only(buildPeriodView(data, OCT_5, NOW).runs);

    assert.equal(maria.defaultPayoutMethod, "e-Transfer");
    assert.equal(maria.eTransferContact, "maria@example.com");
    assert.equal(maria.payoutMethod, null);
    assert.equal(maria.paidOn, null);
  });

  it("gives a draft to a Cleaner added with no shifts", () => {
    const data = payrollData({ runs: [run("r-carla", "carla")] });

    const carla = only(buildPeriodView(data, OCT_5, NOW).runs);

    assert.equal(carla.runId, "r-carla");
    assert.equal(carla.totalCents, 0);
    assert.equal(carla.blockedReason, null);
  });

  it("only reads the period's own sessions and runs", () => {
    const data = payrollData({
      sessions: [session("s1", "ana", { period_start: OCT_19.start })],
      runs: [run("r-carla", "carla", { period_start: OCT_19.start })],
    });

    assert.deepEqual(buildPeriodView(data, OCT_5, NOW).runs, []);
  });
});

describe("buildPeriodView: blocked reasons", () => {
  const cases = [
    [
      "one Open shift",
      [openShift("p1", "ana")],
      "Fix 1 Open shift to finalize",
    ],
    [
      "two Missing clocks",
      [missingClock("p1", "ana"), missingClock("p2", "ana")],
      "Fix 2 Missing clocks to finalize",
    ],
    [
      "an Open shift and a Missing clock",
      [openShift("p1", "ana"), missingClock("p2", "ana")],
      "Fix 1 Open shift and 1 Missing clock to finalize",
    ],
    [
      "a clock problem and a missing Pay rate",
      [openShift("p1", "ana"), noRate("p2", "ana")],
      "Fix 1 Open shift and add a Pay rate to finalize",
    ],
  ] as const;

  for (const [name, sessions, expected] of cases) {
    it(`explains ${name}`, () => {
      const data = payrollData({ sessions: [...sessions] });

      const ana = only(buildPeriodView(data, OCT_5, NOW).runs);

      assert.equal(ana.blockedReason, expected);
    });
  }

  it("says what holds back Mark paid on a finalized run", () => {
    const finalized = run("r-ana", "ana", { status: "finalized" });
    const data = payrollData({
      runs: [finalized],
      sessions: [
        claimed(session("s1", "ana"), finalized),
        claimed(missingClock("s2", "ana"), finalized),
      ],
    });

    const ana = only(buildPeriodView(data, OCT_5, NOW).runs);

    assert.equal(ana.status, "finalized");
    assert.equal(ana.blockedReason, "Fix 1 Missing clock to mark paid");
  });
});

describe("buildPeriodView: claimed runs and stragglers", () => {
  it("lists a finalized run's claimed shifts, and a later closed shift as a straggler", () => {
    const finalized = run("r-carla", "carla", { status: "finalized" });
    const data = payrollData({
      runs: [finalized],
      sessions: [
        claimed(session("s1", "carla"), finalized),
        session("s2", "carla", {
          scheduled_date: "2026-10-16",
          client_name: "Martins residence",
          clocked_minutes: 195,
          amount_cents: 6500,
        }),
      ],
    });

    const view = buildPeriodView(data, OCT_5, NOW);

    const carla = only(view.runs);
    assert.equal(carla.status, "finalized");
    assert.deepEqual(
      carla.lines.map((line) => line.appointmentEmployeeId),
      ["s1"],
    );
    assert.deepEqual(view.stragglers, [
      {
        key: "carla:s2",
        cleaner: { id: "carla", name: "Carla Mendes", isActive: true },
        session: {
          appointmentEmployeeId: "s2",
          date: "2026-10-16",
          clientName: "Martins residence",
          jobName: "Standard clean",
          minutes: 195,
          amountCents: 6500,
        },
        label: "Oct 16 · Martins residence",
        problem: null,
        href: null,
        hasOffCycleDraft: false,
        actionLabel: "Start off-cycle run",
        note: null,
      },
    ]);
    assert.equal(view.counts.stragglers, 1);
  });

  it("puts stragglers on a started off-cycle draft, listed after regular runs", () => {
    const paid = run("r-carla", "carla", {
      status: "paid",
      paid_on: "2026-10-20",
      payout_method: "Cash",
    });
    const offCycle = run("r-carla-off", "carla", { kind: "off_cycle" });
    const data = payrollData({
      runs: [paid, offCycle],
      runLines: [frozenLine("r-carla", "s1")],
      sessions: [
        claimed(session("s1", "carla"), paid),
        session("s2", "carla", { scheduled_date: "2026-10-16" }),
        session("s3", "ana"),
      ],
    });

    const view = buildPeriodView(data, OCT_5, NOW);

    assert.deepEqual(
      view.runs.map((item) => [item.cleaner.name, item.kind, item.status]),
      [
        ["Ana Costa", "regular", "draft"],
        ["Carla Mendes", "regular", "paid"],
        ["Carla Mendes", "off_cycle", "draft"],
      ],
    );
    assert.deepEqual(
      view.runs[2].lines.map((line) => line.appointmentEmployeeId),
      ["s2"],
    );
    const straggler = only(view.stragglers);
    assert.equal(straggler.hasOffCycleDraft, true);
    assert.equal(straggler.actionLabel, "Open off-cycle run");
  });

  it("offers no off-cycle start while a finalized off-cycle run is unpaid", () => {
    const regular = run("r-carla", "carla", { status: "finalized" });
    const offCycle = run("r-carla-off", "carla", {
      kind: "off_cycle",
      status: "finalized",
    });
    const data = payrollData({
      runs: [regular, offCycle],
      sessions: [
        claimed(session("s1", "carla"), regular),
        claimed(session("s2", "carla"), offCycle),
        session("s3", "carla", { scheduled_date: "2026-10-17" }),
      ],
    });

    const view = buildPeriodView(data, OCT_5, NOW);

    const straggler = only(view.stragglers);
    assert.equal(straggler.session.appointmentEmployeeId, "s3");
    assert.equal(straggler.hasOffCycleDraft, false);
    assert.equal(straggler.actionLabel, null);
    assert.equal(straggler.note, "Pay or undo the off-cycle run first");
    assert.deepEqual(
      view.runs.map((item) => [item.kind, item.status]),
      [
        ["regular", "finalized"],
        ["off_cycle", "finalized"],
      ],
    );
  });

  it("offers a new off-cycle run once the earlier one is paid", () => {
    const paidStatus = {
      status: "paid" as const,
      paid_on: "2026-10-20",
      payout_method: "Cash",
    };
    const data = payrollData({
      runs: [
        run("r-carla", "carla", paidStatus),
        run("r-carla-off", "carla", { kind: "off_cycle", ...paidStatus }),
      ],
      sessions: [session("s3", "carla")],
    });

    const straggler = only(buildPeriodView(data, OCT_5, NOW).stragglers);

    assert.equal(straggler.actionLabel, "Start off-cycle run");
    assert.equal(straggler.note, null);
  });

  it("lists a clock problem after finalize as a straggler linked to Time Sheets", () => {
    const finalized = run("r-carla", "carla", { status: "finalized" });
    const data = payrollData({
      runs: [finalized],
      sessions: [
        claimed(session("s1", "carla"), finalized),
        missingClock("s2", "carla", { scheduled_date: "2026-10-16" }),
        openShift("s3", "carla", { is_payable: false }),
      ],
    });

    const view = buildPeriodView(data, OCT_5, NOW);

    const straggler = only(view.stragglers);
    assert.equal(straggler.session.appointmentEmployeeId, "s2");
    assert.equal(straggler.problem, "missing_clock");
    assert.equal(
      straggler.href,
      "/solutions/time-tracking?cleaner=carla&from=2026-10-16&to=2026-10-16",
    );
    assert.equal(straggler.actionLabel, null);
    assert.equal(only(view.runs).status, "finalized");
    assert.equal(view.counts.stragglers, 1);
  });

  it("turns a fixed clock problem into a normal straggler", () => {
    const finalized = run("r-carla", "carla", { status: "finalized" });
    const data = payrollData({
      runs: [finalized],
      sessions: [
        claimed(session("s1", "carla"), finalized),
        session("s2", "carla", { scheduled_date: "2026-10-16" }),
      ],
      editedSessionIds: ["s2"],
    });

    const straggler = only(buildPeriodView(data, OCT_5, NOW).stragglers);

    assert.equal(straggler.problem, null);
    assert.equal(straggler.href, null);
    assert.equal(straggler.actionLabel, "Start off-cycle run");
  });

  it("reports a paid run's frozen lines, even after its session left the pay view", () => {
    const paid = run("r-ana", "ana", {
      status: "paid",
      paid_on: "2026-10-20",
      payout_method: "e-Transfer",
    });
    const data = payrollData({
      runs: [paid],
      runLines: [
        frozenLine("r-ana", "s1", {
          minutes: 200,
          rate_cents: 2200,
          amount_cents: 7333,
        }),
      ],
      adjustments: [adjustment("a1", "r-ana", 1500)],
    });

    const ana = only(buildPeriodView(data, OCT_5, NOW).runs);

    assert.equal(ana.status, "paid");
    assert.equal(ana.payoutMethod, "e-Transfer");
    assert.equal(ana.paidOn, "2026-10-20");
    assert.deepEqual(ana.lines, [
      {
        appointmentEmployeeId: "s1",
        date: "2026-10-08",
        clientName: "Patel residence",
        jobName: "Standard clean",
        minutes: 200,
        rateCents: 2200,
        amountCents: 7333,
        isEdited: false,
        isOddDuration: false,
      },
    ]);
    assert.equal(ana.totalCents, 8833);
    assert.equal(ana.blockedReason, null);
  });

  it("drops a claimed shift whose appointment was cancelled from a finalized run", () => {
    const finalized = run("r-ana", "ana", { status: "finalized" });
    const data = payrollData({
      runs: [finalized],
      sessions: [
        claimed(session("s1", "ana", { is_payable: false }), finalized),
      ],
    });

    const ana = only(buildPeriodView(data, OCT_5, NOW).runs);

    assert.deepEqual(ana.lines, []);
    assert.equal(ana.totalCents, 0);
  });
});

describe("buildPeriodView: period status", () => {
  it("is Running before the period ends, with the day Finalize opens", () => {
    const data = payrollData({
      sessions: [session("s1", "ana", { period_start: OCT_19.start })],
    });

    const view = buildPeriodView(data, OCT_19, NOW);

    assert.deepEqual(view.status, {
      kind: "running",
      label: "Running",
      finalizeOpensOn: "2026-11-02",
    });
    assert.equal(view.isEnded, false);
    assert.equal(view.runs.length, 1);
    assert.deepEqual(view.stragglers, []);
  });

  it("is Ready to review while any run is a draft", () => {
    const data = payrollData({
      runs: [run("r-carla", "carla", { status: "finalized" })],
      sessions: [session("s1", "ana")],
    });

    assert.deepEqual(buildPeriodView(data, OCT_5, NOW).status, {
      kind: "ready_to_review",
      label: "Ready to review",
      finalizeOpensOn: null,
    });
  });

  it("is Finalized · to pay once every run is finalized or paid", () => {
    const data = payrollData({
      runs: [
        run("r-carla", "carla", { status: "finalized" }),
        run("r-ana", "ana", {
          status: "paid",
          paid_on: "2026-10-20",
          payout_method: "Cash",
        }),
      ],
    });

    assert.equal(
      buildPeriodView(data, OCT_5, NOW).status.label,
      "Finalized · to pay",
    );
  });

  it("is Paid once every run is paid", () => {
    const data = payrollData({
      runs: [
        run("r-ana", "ana", {
          status: "paid",
          paid_on: "2026-10-20",
          payout_method: "Cash",
        }),
      ],
    });

    assert.equal(buildPeriodView(data, OCT_5, NOW).status.kind, "paid");
  });

  it("is No pay when an ended period has no runs", () => {
    assert.deepEqual(buildPeriodView(payrollData(), OCT_5, NOW).status, {
      kind: "no_pay",
      label: "No pay",
      finalizeOpensOn: null,
    });
  });
});

describe("buildPeriodView: totals and counts", () => {
  it("sums every run and counts runs by status, blocked and stragglers", () => {
    const finalized = run("r-maria", "maria", { status: "finalized" });
    const data = payrollData({
      runs: [finalized, run("r-carla", "carla")],
      adjustments: [adjustment("a1", "r-carla", 500)],
      sessions: [
        session("s1", "ana"),
        missingClock("s2", "carla"),
        claimed(session("s3", "maria"), finalized),
        session("s4", "maria"),
      ],
    });

    const view = buildPeriodView(data, OCT_5, NOW);

    assert.deepEqual(view.totals, { minutes: 360, totalCents: 12500 });
    assert.deepEqual(view.counts, {
      draft: 2,
      finalized: 1,
      paid: 0,
      blocked: 1,
      stragglers: 1,
    });
  });
});

describe("buildPeriodView: unknown Cleaner", () => {
  it("still shows a run for a Cleaner missing from the employee list", () => {
    const data = payrollData({
      cleaners: [ANA, CARLA, MARIA].filter((item) => item.id !== "ana"),
      sessions: [session("s1", "ana")],
    });

    const ana = only(buildPeriodView(data, OCT_5, NOW).runs);

    assert.deepEqual(ana.cleaner, {
      id: "ana",
      name: "Unknown Cleaner",
      isActive: false,
    });
  });
});
