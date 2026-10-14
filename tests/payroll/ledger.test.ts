import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildLedger } from "../../src/lib/payroll/ledger.ts";
import { buildPeriodView } from "../../src/lib/payroll/period-view.ts";
import {
  adjustment,
  NOW,
  noRate,
  OCT_5,
  payrollData,
  run,
  session,
} from "./fixtures.ts";

function anaRun(data: ReturnType<typeof payrollData>) {
  const [ana] = buildPeriodView(data, OCT_5, NOW).runs;
  return ana;
}

describe("buildLedger", () => {
  it("lists priced and no-rate shifts together by date", () => {
    const data = payrollData({
      sessions: [
        session("s1", "ana", { scheduled_date: "2026-10-09" }),
        noRate("s2", "ana", { scheduled_date: "2026-10-07" }),
      ],
    });

    const { entries } = buildLedger(anaRun(data));

    assert.deepEqual(
      entries.map((entry) => [
        entry.appointmentEmployeeId,
        entry.rateCents,
        entry.amountCents,
        entry.payRateHref,
      ]),
      [
        ["s2", null, null, "/solutions/employees/ana#pay"],
        ["s1", 2000, 6000, null],
      ],
    );
  });

  it("puts an Adjustment under its line and keeps the rest for the run", () => {
    const stored = run("r-ana", "ana");
    const data = payrollData({
      runs: [stored],
      sessions: [session("s1", "ana")],
      adjustments: [
        adjustment("a1", "r-ana", 2000, { appointment_employee_id: "s1" }),
        adjustment("a2", "r-ana", -500),
        // Points at a session that isn't one of this run's lines.
        adjustment("a3", "r-ana", 700, { appointment_employee_id: "gone" }),
      ],
    });

    const ledger = buildLedger(anaRun(data));

    assert.deepEqual(
      ledger.entries.map((entry) => entry.adjustments.map((item) => item.id)),
      [["a1"]],
    );
    assert.deepEqual(
      ledger.runAdjustments.map((item) => item.id),
      ["a2", "a3"],
    );
  });
});
