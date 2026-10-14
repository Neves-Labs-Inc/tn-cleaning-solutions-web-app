import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  describeMarkPaidTarget,
  getBlockerLink,
  markPaidSubmitLabel,
  markPaidSuccessText,
  methodError,
  paidOnError,
  paidOnFieldError,
  payableRuns,
  readMarkPaidRows,
  type MarkPaidRow,
} from "../../src/lib/payroll/mark-paid.ts";
import {
  buildPeriodView,
  type PeriodRun,
} from "../../src/lib/payroll/period-view.ts";
import {
  claimed,
  missingClock,
  noRate,
  NOW,
  OCT_5,
  payrollData,
  run,
  session,
} from "./fixtures.ts";

const PERIOD_END = "2026-10-18";
const TODAY = "2026-10-21";

describe("paidOnError", () => {
  it("accepts today, the period's last day and any day between", () => {
    assert.equal(paidOnError(TODAY, PERIOD_END, TODAY), null);
    assert.equal(paidOnError(PERIOD_END, PERIOD_END, TODAY), null);
    assert.equal(paidOnError("2026-10-20", PERIOD_END, TODAY), null);
  });

  it("refuses a date after today", () => {
    assert.equal(
      paidOnError("2026-10-22", PERIOD_END, TODAY),
      "Paid date can't be in the future.",
    );
  });

  it("refuses a date before the period ends, naming its last day", () => {
    assert.equal(
      paidOnError("2026-10-17", PERIOD_END, TODAY),
      "Paid date can't be before the period ends (Oct 18).",
    );
  });

  it("asks for a date when it's blank or not a calendar day", () => {
    assert.equal(paidOnError("", PERIOD_END, TODAY), "Enter the paid date.");
    assert.equal(
      paidOnError("2026-02-30", PERIOD_END, TODAY),
      "Enter the paid date.",
    );
  });
});

describe("methodError", () => {
  it("asks how she was paid while the method is blank or only spaces", () => {
    assert.equal(methodError("", "Carla"), "Enter how you paid Carla.");
    assert.equal(methodError("   ", "Carla"), "Enter how you paid Carla.");
  });

  it("accepts any text", () => {
    assert.equal(methodError("Cheque #104", "Carla"), null);
  });
});

describe("markPaidSubmitLabel", () => {
  it("counts the runs and sums their pay", () => {
    assert.equal(markPaidSubmitLabel(3, 162400), "Mark 3 paid · $1,624.00");
  });

  it("drops the count for a single run", () => {
    assert.equal(markPaidSubmitLabel(1, 81250), "Mark paid · $812.50");
  });

  it("shows a $0 or negative total as it is", () => {
    assert.equal(markPaidSubmitLabel(2, 0), "Mark 2 paid · $0.00");
    assert.equal(markPaidSubmitLabel(1, -1200), "Mark paid · -$12.00");
  });
});

// Ana finalized and clear, Carla finalized with a Missing clock, Maria finalized with a no-rate
// shift, plus Ana's off-cycle draft.
function periodRuns(): PeriodRun[] {
  const ana = run("r-ana", "ana", { status: "finalized" });
  const carla = run("r-carla", "carla", { status: "finalized" });
  const maria = run("r-maria", "maria", { status: "finalized" });
  const anaOffCycle = run("r-ana-off", "ana", { kind: "off_cycle" });
  return buildPeriodView(
    payrollData({
      runs: [ana, carla, maria, anaOffCycle],
      sessions: [
        claimed(session("s1", "ana"), ana),
        claimed(session("s2", "carla"), carla),
        claimed(missingClock("s3", "carla"), carla),
        claimed(noRate("s4", "maria"), maria),
        session("s5", "ana", { scheduled_date: "2026-10-16" }),
      ],
    }),
    OCT_5,
    NOW,
  ).runs;
}

function byName(runs: PeriodRun[], name: string): PeriodRun {
  const found = runs.find((item) => item.cleaner.name === name);
  assert.ok(found, `no run for ${name}`);
  return found;
}

describe("payableRuns", () => {
  it("splits finalized runs into ready and known-blocked, leaving drafts out", () => {
    const { ready, blocked } = payableRuns(periodRuns());

    assert.deepEqual(
      ready.map((item) => item.cleaner.name),
      ["Ana Costa"],
    );
    assert.deepEqual(
      blocked.map((item) => item.cleaner.name),
      ["Carla Mendes", "Maria Silva"],
    );
  });
});

describe("getBlockerLink", () => {
  it("sends a clock problem to Time Sheets", () => {
    const carla = byName(periodRuns(), "Carla Mendes");

    assert.deepEqual(getBlockerLink(carla), {
      label: "Fix on Time Sheets",
      href: "/solutions/time-tracking?cleaner=carla&from=2026-10-08&to=2026-10-08",
    });
  });

  it("sends a missing Pay rate to the Cleaner's pay section", () => {
    const maria = byName(periodRuns(), "Maria Silva");

    assert.deepEqual(getBlockerLink(maria), {
      label: "Add a Pay rate",
      href: "/solutions/employees/maria#pay",
    });
  });

  it("has no link for a run with nothing blocking it", () => {
    assert.equal(getBlockerLink(byName(periodRuns(), "Ana Costa")), null);
  });
});

describe("describeMarkPaidTarget", () => {
  it("counts the runs to be paid and the skipped ones apart, like Confirm", () => {
    const { ready, blocked } = payableRuns(periodRuns());

    assert.equal(
      describeMarkPaidTarget([...ready, ...blocked], "Oct 5–18"),
      "1 run · 2 skipped · Pay period Oct 5–18",
    );
  });

  it("only counts runs when none is skipped", () => {
    const runs = periodRuns();
    const ana = byName(runs, "Ana Costa");
    const readyCarla = { ...byName(runs, "Carla Mendes"), blockedReason: null };

    assert.equal(
      describeMarkPaidTarget([ana, readyCarla], "Oct 5–18"),
      "2 runs · Pay period Oct 5–18",
    );
  });

  it("only counts the skipped runs when every run is blocked", () => {
    const { blocked } = payableRuns(periodRuns());

    assert.equal(
      describeMarkPaidTarget(blocked, "Oct 5–18"),
      "2 skipped · Pay period Oct 5–18",
    );
  });

  it("names the Cleaner for one run, and says when it's off-cycle", () => {
    const ana = byName(periodRuns(), "Ana Costa");

    assert.equal(
      describeMarkPaidTarget([ana], "Oct 5–18"),
      "Ana Costa · Pay period Oct 5–18",
    );
    assert.equal(
      describeMarkPaidTarget([{ ...ana, kind: "off_cycle" }], "Oct 5–18"),
      "Ana Costa · Pay period Oct 5–18 · Off-cycle",
    );
  });
});

describe("markPaidSuccessText", () => {
  it("names the Cleaner when one run was paid", () => {
    const ana = byName(periodRuns(), "Ana Costa");

    assert.equal(markPaidSuccessText([ana]), "Marked Ana paid");
  });

  it("counts the runs when several were paid", () => {
    assert.equal(markPaidSuccessText(periodRuns().slice(0, 3)), "Marked 3 paid");
  });
});

function row(
  payRunId: string,
  code: string,
  detail: unknown = null,
): MarkPaidRow {
  return { payRunId, code, message: null, detail };
}

describe("readMarkPaidRows", () => {
  const runs = periodRuns();
  const ana = byName(runs, "Ana Costa");
  const readyCarla = { ...byName(runs, "Carla Mendes"), blockedReason: null };

  it("lists the paid runs and counts them when every run was paid", () => {
    const feedback = readMarkPaidRows(
      [row("r-ana", "ok"), row("r-carla", "ok")],
      [ana, readyCarla],
      PERIOD_END,
    );

    assert.deepEqual(
      feedback.paidRuns.map((item) => item.runId),
      ["r-ana", "r-carla"],
    );
    assert.equal(feedback.text, "Marked 2 paid");
    assert.equal(feedback.hasUnplacedRefusal, false);
  });

  it("names a run that gained a blocker since the page loaded", () => {
    const feedback = readMarkPaidRows(
      [
        row("r-ana", "ok"),
        row("r-carla", "blocked", {
          open_shift: 0,
          missing_clock: 1,
          no_rate: 0,
        }),
      ],
      [ana, readyCarla],
      PERIOD_END,
    );

    assert.deepEqual(
      feedback.paidRuns.map((item) => item.runId),
      ["r-ana"],
    );
    assert.equal(
      feedback.text,
      "Marked 1 paid · 1 blocked: Carla: 1 Missing clock",
    );
    assert.equal(feedback.hasUnplacedRefusal, true);
  });

  it("puts a refused paid date under Paid on, in the dialog's words", () => {
    const feedback = readMarkPaidRows(
      [
        row("r-ana", "paid_on_before_period_end"),
        row("r-carla", "paid_on_before_period_end"),
      ],
      [ana, readyCarla],
      PERIOD_END,
    );

    assert.equal(
      feedback.paidOnError,
      "Paid date can't be before the period ends (Oct 18).",
    );
    assert.equal(feedback.hasUnplacedRefusal, false);
  });

  it("puts a refused blank method under that run's row", () => {
    const feedback = readMarkPaidRows(
      [row("r-ana", "ok"), row("r-carla", "method_required")],
      [ana, readyCarla],
      PERIOD_END,
    );

    assert.deepEqual(feedback.methodErrors, {
      "r-carla": "Enter how you paid Carla.",
    });
    assert.equal(feedback.paidOnError, null);
    assert.equal(feedback.hasUnplacedRefusal, false);
  });
});

describe("paidOnFieldError", () => {
  it("rewords a refused paid date from Edit payout for the Paid on field", () => {
    assert.equal(
      paidOnFieldError("The paid date can't be in the future", PERIOD_END),
      "Paid date can't be in the future.",
    );
    assert.equal(
      paidOnFieldError(
        "The paid date can't be before the Pay period ends",
        PERIOD_END,
      ),
      "Paid date can't be before the period ends (Oct 18).",
    );
  });

  it("leaves any other refusal to the form alert", () => {
    assert.equal(
      paidOnFieldError("Only a paid Pay run's payout can be edited.", PERIOD_END),
      null,
    );
  });
});
