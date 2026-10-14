import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  MyPayAdjustmentRow,
  MyPayLineRow,
  MyPayRunRow,
} from "../../src/lib/payroll/my-pay.ts";
import {
  buildPayStatementModel,
  getPayStatementFilename,
  renderPayStatementPdf,
} from "../../src/lib/payroll/pay-statement.ts";

const RUN: MyPayRunRow = {
  id: "run-1",
  period_start: "2026-10-05",
  kind: "regular",
  paid_on: "2026-10-20",
  payout_method: "e-Transfer",
  total_cents: 8130,
};

function line(overrides: Partial<MyPayLineRow>): MyPayLineRow {
  return {
    id: "line",
    pay_run_id: "run-1",
    scheduled_date: "2026-10-06",
    client_name: "Smith residence",
    minutes: 167,
    rate_cents: 2400,
    amount_cents: 6680,
    ...overrides,
  };
}

function adjustment(overrides: Partial<MyPayAdjustmentRow>): MyPayAdjustmentRow {
  return {
    id: "adj",
    pay_run_id: "run-1",
    amount_cents: 1500,
    reason: "Gas money",
    linked_scheduled_date: null,
    linked_client_name: null,
    created_at: "2026-10-19T12:00:00Z",
    ...overrides,
  };
}

const LINES = [
  line({ id: "b", scheduled_date: "2026-10-08", client_name: "Okafor home", minutes: 60, amount_cents: 2400 }),
  line({ id: "a", scheduled_date: "2026-10-06" }),
];
const ADJUSTMENTS = [
  adjustment({
    id: "late",
    amount_cents: -1000,
    reason: "Supply charge",
    created_at: "2026-10-19T13:00:00Z",
  }),
  adjustment({
    id: "early",
    linked_scheduled_date: "2026-10-07",
    linked_client_name: "Smith residence",
  }),
];

function build(overrides: Partial<Parameters<typeof buildPayStatementModel>[0]> = {}) {
  return buildPayStatementModel({
    cleanerName: "Maria Santos",
    run: RUN,
    lines: LINES,
    adjustments: ADJUSTMENTS,
    ...overrides,
  });
}

describe("buildPayStatementModel", () => {
  it("heads the statement with the Cleaner, period and paid line", () => {
    const model = build();

    assert.equal(model.cleanerName, "Maria Santos");
    assert.equal(model.periodLine, "Pay period Oct 5–18, 2026");
    assert.equal(model.paidLine, "Paid Oct 20, 2026 by e-Transfer");
    assert.equal(
      model.documentTitle,
      "Pay statement · Maria Santos · Oct 5–18, 2026",
    );
  });

  it("labels an off-cycle run in the period line", () => {
    const model = build({ run: { ...RUN, kind: "off_cycle" } });

    assert.equal(model.periodLine, "Pay period Oct 5–18, 2026 · Off-cycle");
  });

  it("lists lines by date then client with hours, effective rate and amount", () => {
    const model = build();

    assert.deepEqual(model.shiftRows, [
      ["Oct 6", "Smith residence", "2:47", "$24.00/h", "$66.80"],
      ["Oct 8", "Okafor home", "1:00", "$24.00/h", "$24.00"],
    ]);
    assert.deepEqual(model.shiftsTotalRow, [
      "Shifts total",
      "",
      "3:47",
      "",
      "$90.80",
    ]);
  });

  it("sorts same-day lines by client name", () => {
    const model = build({
      lines: [
        line({ id: "z", client_name: "Zed" }),
        line({ id: "a", client_name: "Abel" }),
      ],
    });

    assert.deepEqual(
      model.shiftRows.map((row) => row[1]),
      ["Abel", "Zed"],
    );
  });

  it("lists Adjustments in creation order with reason, link and signed amount", () => {
    const model = build();

    assert.deepEqual(model.adjustmentRows, [
      [{ text: "Gas money", sub: "Oct 7 · Smith residence" }, "+$15.00"],
      ["Supply charge", "-$10.00"],
    ]);
    assert.deepEqual(model.adjustmentsTotalRow, ["Adjustments total", "+$5.00"]);
  });

  it("leaves the Adjustments out when there are none", () => {
    const model = build({ adjustments: [] });

    assert.deepEqual(model.adjustmentRows, []);
    assert.equal(model.adjustmentsTotalRow, null);
  });

  it("states the run's stored total as Total paid", () => {
    assert.equal(build().totalPaid, "$81.30");
    assert.equal(build({ run: { ...RUN, total_cents: -1200 } }).totalPaid, "-$12.00");
  });

  it("shows a muted empty row for an Adjustment-only run", () => {
    const model = build({ lines: [] });

    assert.deepEqual(model.shiftRows, [["", { text: "No shifts on this run.", muted: true }, "", "", ""]]);
    assert.deepEqual(model.shiftsTotalRow, ["Shifts total", "", "0:00", "", "$0.00"]);
  });

  it("names both years for a period across a year", () => {
    const model = build({ run: { ...RUN, period_start: "2026-12-28" } });

    assert.equal(model.periodLine, "Pay period Dec 28, 2026–Jan 10, 2027");
  });
});

describe("getPayStatementFilename", () => {
  it("is named by the period start", () => {
    assert.equal(getPayStatementFilename(RUN), "pay-statement-2026-10-05.pdf");
  });

  it("marks an off-cycle run", () => {
    assert.equal(
      getPayStatementFilename({ ...RUN, kind: "off_cycle" }),
      "pay-statement-2026-10-05-off-cycle.pdf",
    );
  });
});

describe("renderPayStatementPdf", () => {
  it("returns a PDF file", async () => {
    const buffer = await renderPayStatementPdf(build());

    assert.equal(buffer.subarray(0, 4).toString("latin1"), "%PDF");
  });

  it("renders an Adjustment-only run", async () => {
    const buffer = await renderPayStatementPdf(build({ lines: [] }));

    assert.equal(buffer.subarray(0, 4).toString("latin1"), "%PDF");
  });

  it("renders a run long enough to pass one page", async () => {
    const lines = Array.from({ length: 120 }, (_, index) =>
      line({ id: `l${index}`, client_name: `Client ${index}` }),
    );

    const buffer = await renderPayStatementPdf(build({ lines }));

    assert.equal(buffer.subarray(0, 4).toString("latin1"), "%PDF");
  });
});
