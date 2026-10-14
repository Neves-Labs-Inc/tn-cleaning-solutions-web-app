import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  ExportSummaryLine,
  PayrollExportModel,
} from "../../src/lib/payroll/export-model.ts";
import {
  buildPayrollSummary,
  renderPayrollSummaryPdf,
} from "../../src/lib/payroll/summary-pdf.ts";
import { OCT_5 } from "./fixtures.ts";

// Toronto: Fri Oct 23, 2026, 10:00.
const GENERATED_AT = new Date("2026-10-23T14:00:00Z");

function summaryLine(
  cleanerId: string,
  name: string,
  overrides: Partial<ExportSummaryLine> = {},
): ExportSummaryLine {
  return {
    cleanerId,
    name,
    minutes: 0,
    shiftPayCents: 0,
    adjustmentsCents: 0,
    totalCents: 0,
    payoutMethods: [],
    paidDates: [],
    ...overrides,
  };
}

const ANA = summaryLine("ana", "Ana Oliveira", {
  minutes: 1334,
  shiftPayCents: 46739,
  adjustmentsCents: -1500,
  totalCents: 45239,
});
const LUCIANA = summaryLine("luciana", "Luciana Costa", {
  minutes: 1068,
  shiftPayCents: 35600,
  totalCents: 35600,
});
const MARIA = summaryLine("maria", "Maria Santos", {
  minutes: 2327,
  shiftPayCents: 89512,
  adjustmentsCents: 3000,
  totalCents: 92512,
});

const MODEL: PayrollExportModel = {
  period: OCT_5,
  summary: {
    lines: [ANA, LUCIANA, MARIA],
    total: {
      minutes: 4729,
      shiftPayCents: 171851,
      adjustmentsCents: 1500,
      totalCents: 173351,
    },
  },
  // The renderer reads only the summary and the current rates.
  cleaners: [],
  currentRates: { ana: 2100, luciana: null, maria: 2400 },
};

describe("buildPayrollSummary", () => {
  it("heads the page with the title, period and Toronto generated date", () => {
    const summary = buildPayrollSummary(MODEL, GENERATED_AT);

    assert.equal(summary.title, "Payroll summary");
    assert.equal(summary.metaLine, "Oct 5–18, 2026 · Generated Oct 23, 2026");
    assert.equal(summary.documentTitle, "Payroll summary Oct 5–18, 2026");
  });

  it("lists every Cleaner with hours, current Pay rate, signed Adjustments and total", () => {
    const summary = buildPayrollSummary(MODEL, GENERATED_AT);

    assert.deepEqual(
      summary.columns.map((column) => column.label),
      ["Cleaner", "Hours", "Pay rate", "Adjustments", "Total"],
    );
    assert.deepEqual(summary.rows, [
      ["Ana Oliveira", "22:14", "$21.00/h", "-$15.00", "$452.39"],
      ["Luciana Costa", "17:48", "—", "$0.00", "$356.00"],
      ["Maria Santos", "38:47", "$24.00/h", "+$30.00", "$925.12"],
    ]);
  });

  it("ends with a grand total row equal to the export's total", () => {
    const summary = buildPayrollSummary(MODEL, GENERATED_AT);

    assert.deepEqual(summary.totalRow, [
      "Total",
      "78:49",
      "",
      "+$15.00",
      "$1,733.51",
    ]);
  });

  it("right-aligns every number column", () => {
    const summary = buildPayrollSummary(MODEL, GENERATED_AT);

    assert.deepEqual(
      summary.columns.map((column) => column.align),
      ["left", "right", "right", "right", "right"],
    );
  });

  it("names both months for a period across a month", () => {
    const model = {
      ...MODEL,
      period: { start: "2026-10-19", end: "2026-11-01" },
    };

    const summary = buildPayrollSummary(model, GENERATED_AT);

    assert.equal(
      summary.metaLine,
      "Oct 19–Nov 1, 2026 · Generated Oct 23, 2026",
    );
  });

  it("names both years for a period across a year", () => {
    const model = {
      ...MODEL,
      period: { start: "2026-12-28", end: "2027-01-10" },
    };

    const summary = buildPayrollSummary(model, GENERATED_AT);

    assert.equal(summary.documentTitle, "Payroll summary Dec 28, 2026–Jan 10, 2027");
  });
});

describe("renderPayrollSummaryPdf", () => {
  it("returns a PDF file", async () => {
    const buffer = await renderPayrollSummaryPdf(MODEL, GENERATED_AT);

    assert.ok(buffer.length > 0);
    assert.equal(buffer.subarray(0, 4).toString("latin1"), "%PDF");
  });

  it("renders a period long enough to run past one page", async () => {
    const lines = Array.from({ length: 80 }, (_, index) =>
      summaryLine(`cleaner-${index}`, `Cleaner number ${index}`, {
        minutes: 600,
        totalCents: 20000,
      }),
    );
    const model = { ...MODEL, summary: { ...MODEL.summary, lines } };

    const buffer = await renderPayrollSummaryPdf(model, GENERATED_AT);

    assert.equal(buffer.subarray(0, 4).toString("latin1"), "%PDF");
  });
});
