import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  planScope,
  type ScopeCandidate,
  type ScopeLine,
} from "../../src/lib/appointments/appointment-scope.ts";

const SERIES_ID = "series-1";
const CHOSEN = {
  id: "oct-14",
  scheduled_date: "2026-10-14",
  recurrence_series_id: SERIES_ID,
};

function visit(
  overrides: Partial<ScopeCandidate> & Pick<ScopeCandidate, "id" | "scheduled_date">,
): ScopeCandidate {
  return { status: "scheduled", is_archived: false, lines: [], ...overrides };
}

function line(overrides: Partial<ScopeLine> = {}): ScopeLine {
  return { invoiceStatus: "draft", isLive: true, ...overrides };
}

const SERIES: ScopeCandidate[] = [
  visit({ id: "oct-21", scheduled_date: "2026-10-21" }),
  visit({ id: "oct-07", scheduled_date: "2026-10-07", status: "completed" }),
  visit({ id: "oct-14", scheduled_date: "2026-10-14" }),
  visit({ id: "oct-14-extra", scheduled_date: "2026-10-14" }),
  visit({ id: "oct-28", scheduled_date: "2026-10-28", status: "in_progress" }),
];

describe("planScope", () => {
  it("returns only the chosen visit for occurrence, for both actions", () => {
    for (const action of ["cancel", "delete"] as const) {
      const plan = planScope(action, "occurrence", CHOSEN, SERIES);

      assert.deepEqual(plan, {
        value: { actIds: ["oct-14"], skipped: [] },
        error: null,
      });
    }
  });

  it("includes the chosen and later visits for future, same date too, and leaves out earlier ones", () => {
    const invoiced = visit({
      id: "nov-04",
      scheduled_date: "2026-11-04",
      status: "completed",
      lines: [line({ invoiceStatus: "issued" })],
    });

    const plan = planScope("cancel", "future", CHOSEN, [...SERIES, invoiced]);

    assert.deepEqual(plan.value, {
      actIds: ["oct-14", "oct-14-extra", "oct-21", "oct-28", "nov-04"],
      skipped: [],
    });
  });

  it("includes past and future visits of any status for series, never archived ones", () => {
    const archived = visit({
      id: "sep-30",
      scheduled_date: "2026-09-30",
      is_archived: true,
    });

    const plan = planScope("delete", "series", CHOSEN, [...SERIES, archived]);

    assert.deepEqual(plan.value, {
      actIds: ["oct-07", "oct-14", "oct-14-extra", "oct-21", "oct-28"],
      skipped: [],
    });
  });

  it("leaves an archived chosen visit out even for occurrence", () => {
    const plan = planScope("cancel", "occurrence", CHOSEN, [
      visit({ ...CHOSEN, is_archived: true }),
    ]);

    assert.deepEqual(plan.value, { actIds: [], skipped: [] });
  });

  describe("cancel", () => {
    it("leaves already-cancelled visits out of both lists", () => {
      const plan = planScope("cancel", "series", CHOSEN, [
        visit({ id: "oct-07", scheduled_date: "2026-10-07", status: "cancelled" }),
        visit({ id: "oct-14", scheduled_date: "2026-10-14" }),
      ]);

      assert.deepEqual(plan.value, { actIds: ["oct-14"], skipped: [] });
    });

    it("skips a visit whose Live claim is on a paid invoice", () => {
      const plan = planScope("cancel", "series", CHOSEN, [
        visit({
          id: "oct-07",
          scheduled_date: "2026-10-07",
          lines: [line({ invoiceStatus: "paid" })],
        }),
        visit({ id: "oct-14", scheduled_date: "2026-10-14" }),
      ]);

      assert.deepEqual(plan.value, {
        actIds: ["oct-14"],
        skipped: [{ id: "oct-07", reason: "paid_invoice" }],
      });
    });

    it("acts on a visit whose only paid-invoice line is Cancelled or released", () => {
      const plan = planScope("cancel", "series", CHOSEN, [
        visit({
          id: "oct-07",
          scheduled_date: "2026-10-07",
          lines: [
            line({ invoiceStatus: "paid", isLive: false }),
            line({ invoiceStatus: "draft" }),
          ],
        }),
      ]);

      assert.deepEqual(plan.value, { actIds: ["oct-07"], skipped: [] });
    });
  });

  describe("delete", () => {
    it("acts on a cancelled visit", () => {
      const plan = planScope("delete", "occurrence", CHOSEN, [
        visit({ ...CHOSEN, status: "cancelled" }),
      ]);

      assert.deepEqual(plan.value, { actIds: ["oct-14"], skipped: [] });
    });

    it("skips a visit with any line on a paid invoice, live, Cancelled or released", () => {
      const plan = planScope("delete", "series", CHOSEN, [
        visit({
          id: "live-paid",
          scheduled_date: "2026-10-07",
          lines: [line({ invoiceStatus: "paid" })],
        }),
        visit({
          id: "cancelled-line-paid",
          scheduled_date: "2026-10-14",
          status: "cancelled",
          lines: [line({ invoiceStatus: "paid", isLive: false })],
        }),
        visit({
          id: "released-paid",
          scheduled_date: "2026-10-21",
          lines: [
            line({ invoiceStatus: "paid", isLive: false }),
            line({ invoiceStatus: "issued" }),
          ],
        }),
      ]);

      assert.deepEqual(plan.value, {
        actIds: [],
        skipped: [
          { id: "live-paid", reason: "paid_invoice" },
          { id: "cancelled-line-paid", reason: "paid_invoice" },
          { id: "released-paid", reason: "paid_invoice" },
        ],
      });
    });

    it("acts on visits whose lines are on draft, issued or void invoices", () => {
      const plan = planScope("delete", "series", CHOSEN, [
        visit({
          id: "on-draft",
          scheduled_date: "2026-10-07",
          lines: [line({ invoiceStatus: "draft" })],
        }),
        visit({
          id: "on-issued",
          scheduled_date: "2026-10-14",
          lines: [line({ invoiceStatus: "issued", isLive: false })],
        }),
        visit({
          id: "on-void",
          scheduled_date: "2026-10-21",
          lines: [line({ invoiceStatus: "void", isLive: false })],
        }),
      ]);

      assert.deepEqual(plan.value, {
        actIds: ["on-draft", "on-issued", "on-void"],
        skipped: [],
      });
    });
  });

  it("refuses future or series on a visit without a Series", () => {
    const standalone = { ...CHOSEN, recurrence_series_id: null };

    for (const scope of ["future", "series"] as const) {
      const plan = planScope("cancel", scope, standalone, [visit(CHOSEN)]);

      assert.deepEqual(plan, {
        value: null,
        error: "This appointment isn't part of a series.",
      });
    }
  });
});
