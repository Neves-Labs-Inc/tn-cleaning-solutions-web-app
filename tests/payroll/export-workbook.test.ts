import assert from "node:assert/strict";
import { describe, it } from "node:test";

import ExcelJS from "exceljs";

import type {
  ExportCleaner,
  PayrollExportModel,
} from "../../src/lib/payroll/export-model.ts";
import { renderPayrollWorkbook } from "../../src/lib/payroll/export-workbook.ts";
import { OCT_5 } from "./fixtures.ts";

const MONEY_FORMAT = '"$"#,##0.00';

function exportCleaner(
  cleanerId: string,
  name: string,
  overrides: Partial<ExportCleaner> = {},
): ExportCleaner {
  return {
    cleanerId,
    name,
    lines: [],
    adjustments: [],
    minutes: 0,
    shiftPayCents: 0,
    adjustmentsCents: 0,
    totalCents: 0,
    ...overrides,
  };
}

const ANA = exportCleaner("ana", "Ana Costa", {
  lines: [
    {
      date: "2026-10-06",
      clientName: "Hughes residence",
      jobName: "Deep clean",
      minutes: 185,
      rateCents: 2300,
      amountCents: 7092,
    },
    {
      date: "2026-10-09",
      clientName: "Patel residence",
      jobName: "Standard clean",
      minutes: 180,
      rateCents: 2000,
      amountCents: 6000,
    },
  ],
  adjustments: [
    { reason: "Tip", linkedDate: "2026-10-09", amountCents: 2000 },
    { reason: "Overpaid", linkedDate: null, amountCents: -1250 },
  ],
  minutes: 365,
  shiftPayCents: 13092,
  adjustmentsCents: 750,
  totalCents: 13842,
});

const CARLA = exportCleaner("carla", "Carla Mendes", {
  lines: [
    {
      date: "2026-10-11",
      clientName: "Lee residence",
      jobName: "Standard clean",
      minutes: 120,
      rateCents: 2000,
      amountCents: 4000,
    },
  ],
  minutes: 120,
  shiftPayCents: 4000,
  totalCents: 4000,
});

const MODEL: PayrollExportModel = {
  period: OCT_5,
  summary: {
    lines: [
      {
        ...ANA,
        payoutMethods: ["Cash", "e-Transfer"],
        paidDates: ["2026-10-20", "2026-11-03"],
      },
      { ...CARLA, payoutMethods: [], paidDates: [] },
    ],
    total: {
      minutes: 485,
      shiftPayCents: 17092,
      adjustmentsCents: 750,
      totalCents: 17842,
    },
  },
  cleaners: [ANA, CARLA],
  currentRates: { ana: 2000, carla: 2000 },
};

async function readBack(model: PayrollExportModel): Promise<ExcelJS.Workbook> {
  const buffer = await renderPayrollWorkbook(model);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook;
}

function sheet(workbook: ExcelJS.Workbook, name: string): ExcelJS.Worksheet {
  const found = workbook.getWorksheet(name);
  assert.ok(found, `no "${name}" tab`);
  return found;
}

const COLUMN_COUNT = 7;

// Every column of the row, null where the cell is empty.
function rowValues(worksheet: ExcelJS.Worksheet, row: number): unknown[] {
  return Array.from(
    { length: COLUMN_COUNT },
    (_, index) => worksheet.getRow(row).getCell(index + 1).value,
  );
}

function utcDate(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

describe("renderPayrollWorkbook: Summary tab", () => {
  it("has the header, one row per Cleaner, and a grand total row", async () => {
    const workbook = await readBack(MODEL);

    const summary = sheet(workbook, "Summary");
    assert.deepEqual(rowValues(summary, 1), [
      "Cleaner",
      "Hours",
      "Shift pay",
      "Adjustments",
      "Total",
      "Payout method",
      "Paid date",
    ]);
    assert.deepEqual(rowValues(summary, 2), [
      "Ana Costa",
      365 / 60,
      130.92,
      7.5,
      138.42,
      "Cash; e-Transfer",
      "2026-10-20; 2026-11-03",
    ]);
    // A finalized-unpaid Cleaner leaves method and paid date blank.
    assert.deepEqual(rowValues(summary, 3), [
      "Carla Mendes",
      2,
      40,
      0,
      40,
      null,
      null,
    ]);
    assert.deepEqual(rowValues(summary, 4), [
      "Total",
      485 / 60,
      170.92,
      7.5,
      178.42,
      null,
      null,
    ]);
    assert.equal(summary.rowCount, 4);
  });

  it("writes a single paid date as a real date cell", async () => {
    const model: PayrollExportModel = {
      ...MODEL,
      summary: {
        ...MODEL.summary,
        lines: [
          { ...CARLA, payoutMethods: ["Cash"], paidDates: ["2026-10-20"] },
        ],
      },
    };

    const workbook = await readBack(model);

    const cell = sheet(workbook, "Summary").getCell("G2");
    assert.deepEqual(cell.value, utcDate("2026-10-20"));
    assert.equal(cell.numFmt, "yyyy-mm-dd");
    assert.equal(sheet(workbook, "Summary").getCell("F2").value, "Cash");
  });

  it("formats money as CAD and hours with two decimals", async () => {
    const workbook = await readBack(MODEL);

    const summary = sheet(workbook, "Summary");
    for (const address of ["C2", "D2", "E2", "C4", "D4", "E4"]) {
      assert.equal(summary.getCell(address).numFmt, MONEY_FORMAT, address);
    }
    assert.equal(summary.getCell("B2").numFmt, "0.00");
  });
});

describe("renderPayrollWorkbook: Cleaner tabs", () => {
  it("lists every appointment line, then each Adjustment, then her total", async () => {
    const workbook = await readBack(MODEL);

    const ana = sheet(workbook, "Ana Costa");
    assert.deepEqual(rowValues(ana, 1), [
      "Date",
      "Client",
      "Job",
      "Hours",
      "Hours (h:mm)",
      "Rate",
      "Amount",
    ]);
    assert.deepEqual(rowValues(ana, 2), [
      utcDate("2026-10-06"),
      "Hughes residence",
      "Deep clean",
      185 / 60,
      "3:05",
      23,
      70.92,
    ]);
    assert.deepEqual(rowValues(ana, 3), [
      utcDate("2026-10-09"),
      "Patel residence",
      "Standard clean",
      3,
      "3:00",
      20,
      60,
    ]);
    const tip = rowValues(ana, 4);
    assert.deepEqual(tip[0], utcDate("2026-10-09"));
    assert.equal(tip[1], "Adjustment: Tip");
    assert.equal(tip[6], 20);
    const overpaid = rowValues(ana, 5);
    assert.equal(overpaid[0], null);
    assert.equal(overpaid[1], "Adjustment: Overpaid");
    assert.equal(overpaid[6], -12.5);
    assert.deepEqual(rowValues(ana, 6), [
      "Total",
      null,
      null,
      365 / 60,
      "6:05",
      null,
      138.42,
    ]);
    assert.equal(ana.rowCount, 6);
  });

  it("keeps hours unrounded so a column sum matches the total row", async () => {
    const twentyMinutes = {
      date: "2026-10-07",
      clientName: "Patel residence",
      jobName: "Touch-up",
      minutes: 20,
      rateCents: 2100,
      amountCents: 700,
    };
    const model: PayrollExportModel = {
      ...MODEL,
      cleaners: [
        exportCleaner("ana", "Ana Costa", {
          lines: [twentyMinutes, twentyMinutes, twentyMinutes],
          minutes: 60,
          shiftPayCents: 2100,
          totalCents: 2100,
        }),
      ],
    };

    const workbook = await readBack(model);

    const ana = sheet(workbook, "Ana Costa");
    const lineHours = [2, 3, 4].map((row) => ana.getCell(`D${row}`).value);
    const columnSum = lineHours.reduce(
      (total: number, value) => total + Number(value),
      0,
    );
    assert.equal(ana.getCell("D5").value, 1);
    assert.ok(Math.abs(columnSum - 1) < 1e-9, `sum was ${columnSum}`);
  });

  it("formats dates, hours and money cells", async () => {
    const workbook = await readBack(MODEL);

    const ana = sheet(workbook, "Ana Costa");
    assert.equal(ana.getCell("A2").numFmt, "yyyy-mm-dd");
    assert.equal(ana.getCell("D2").numFmt, "0.00");
    assert.equal(ana.getCell("F2").numFmt, MONEY_FORMAT);
    assert.equal(ana.getCell("G2").numFmt, MONEY_FORMAT);
    assert.equal(ana.getCell("G5").numFmt, MONEY_FORMAT);
    assert.equal(ana.getCell("G6").numFmt, MONEY_FORMAT);
    assert.equal(ana.getCell("E2").alignment?.horizontal, "right");
  });

  it("names each tab after its Cleaner, legal, unique and at most 31 characters", async () => {
    const longName = "Maria Aparecida dos Santos Oliveira";
    // Cut at 27 characters (room for " (2)"), it ends in an apostrophe.
    const apostropheName = "Mary Catherine Elizabeth O'Neill";
    const model: PayrollExportModel = {
      ...MODEL,
      cleaners: [
        exportCleaner("a", "Ana [Costa]: */?\\"),
        exportCleaner("b", "Ana Costa"),
        exportCleaner("c", longName),
        exportCleaner("d", longName),
        exportCleaner("e", "summary"),
        exportCleaner("f", "Rosa/Lima"),
        // Cut at 31 characters, it ends in an apostrophe, which Excel refuses.
        exportCleaner("g", "Siobhan Maria Catherine Fitz O'Brien"),
        exportCleaner("h", apostropheName),
        exportCleaner("i", apostropheName),
        // Excel reserves "History".
        exportCleaner("j", "History"),
        // An emoji is two UTF-16 units; the cut must not split it.
        exportCleaner("k", "Ana Beatriz Fernandes Costa 🌸🌸🌸"),
      ],
    };

    const workbook = await readBack(model);

    const names = workbook.worksheets.map((item) => item.name);
    assert.deepEqual(names, [
      "Summary",
      "Ana Costa",
      "Ana Costa (2)",
      "Maria Aparecida dos Santos Oliv",
      "Maria Aparecida dos Santos (2)",
      "summary (2)",
      "RosaLima",
      "Siobhan Maria Catherine Fitz O",
      "Mary Catherine Elizabeth O'Neil",
      "Mary Catherine Elizabeth O (2)",
      "History (2)",
      // 28 + 2 UTF-16 units; a second emoji would pass 31.
      "Ana Beatriz Fernandes Costa 🌸",
    ]);
    assert.ok(names.every((name) => name.length <= 31));
  });
});

describe("renderPayrollWorkbook: presentation", () => {
  it("freezes and bolds every header, bolds every total row, and sets column widths", async () => {
    const workbook = await readBack(MODEL);

    const summary = sheet(workbook, "Summary");
    const ana = sheet(workbook, "Ana Costa");
    for (const worksheet of [summary, ana]) {
      assert.equal(worksheet.views[0]?.state, "frozen", worksheet.name);
      assert.equal(
        (worksheet.views[0] as { ySplit?: number }).ySplit,
        1,
        worksheet.name,
      );
      assert.equal(worksheet.getCell("A1").font?.bold, true, worksheet.name);
      const totalRow = worksheet.getRow(worksheet.rowCount);
      assert.equal(totalRow.getCell(1).font?.bold, true, worksheet.name);
      assert.equal(totalRow.getCell(1).border?.top?.style, "thin");
    }
    assert.deepEqual(
      summary.columns.map((column) => column.width),
      [24, 10, 12, 13, 12, 22, 22],
    );
    assert.deepEqual(
      ana.columns.map((column) => column.width),
      [12, 32, 24, 9, 12, 10, 12],
    );
  });
});
