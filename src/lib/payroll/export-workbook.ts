import ExcelJS from "exceljs";

// Relative imports: node --test runs this file without the @/ alias.
import type {
  ExportAdjustment,
  ExportCleaner,
  ExportLine,
  ExportSummaryLine,
  ExportTotals,
  PayrollExportModel,
} from "./export-model.ts";
import { formatHoursMinutes } from "./period.ts";

// Renders the Payroll export model as an .xlsx: a Summary tab, then one tab per Cleaner. Cells hold
// real numbers and dates so the bookkeeper can sum and sort them; no fills or colours, so it
// prints cleanly in black and white.

const MONEY_FORMAT = '"$"#,##0.00';
const HOURS_FORMAT = "0.00";
const DATE_FORMAT = "yyyy-mm-dd";
const SUMMARY_SHEET_NAME = "Summary";
const RESERVED_SHEET_NAME = "History";
const TOTAL_LABEL = "Total";
const ADJUSTMENT_PREFIX = "Adjustment: ";
const JOIN_SEPARATOR = "; ";
const FALLBACK_SHEET_NAME = "Cleaner";
// Excel's limits on a worksheet name.
const MAX_SHEET_NAME_LENGTH = 31;
const ILLEGAL_SHEET_NAME_CHARACTERS = /[[\]:*?/\\]/g;
const EDGE_APOSTROPHES_AND_SPACES = /^['\s]+|['\s]+$/g;
const CENTS_PER_DOLLAR = 100;
const MINUTES_PER_HOUR = 60;

// A column's style applies to every cell written in it.
type ColumnSpec = {
  header: string;
  width: number;
  style?: Partial<ExcelJS.Style>;
};

const MONEY_STYLE = { numFmt: MONEY_FORMAT };
const HOURS_STYLE = { numFmt: HOURS_FORMAT };
const DATE_STYLE = { numFmt: DATE_FORMAT };
// h:mm is text, but it sits with the numbers.
const RIGHT_ALIGNED_STYLE: Partial<ExcelJS.Style> = {
  alignment: { horizontal: "right" },
};

const SUMMARY_COLUMNS: ColumnSpec[] = [
  { header: "Cleaner", width: 24 },
  { header: "Hours", width: 10, style: HOURS_STYLE },
  { header: "Shift pay", width: 12, style: MONEY_STYLE },
  { header: "Adjustments", width: 13, style: MONEY_STYLE },
  { header: "Total", width: 12, style: MONEY_STYLE },
  { header: "Payout method", width: 22 },
  { header: "Paid date", width: 22, style: DATE_STYLE },
];

const CLEANER_COLUMNS: ColumnSpec[] = [
  { header: "Date", width: 12, style: DATE_STYLE },
  { header: "Client", width: 32 },
  { header: "Job", width: 24 },
  { header: "Hours", width: 9, style: HOURS_STYLE },
  { header: "Hours (h:mm)", width: 12, style: RIGHT_ALIGNED_STYLE },
  { header: "Rate", width: 10, style: MONEY_STYLE },
  { header: "Amount", width: 12, style: MONEY_STYLE },
];

type CellValue = string | number | Date | null;

function toDollars(cents: number): number {
  return cents / CENTS_PER_DOLLAR;
}

// Unrounded so a column sum matches the total row; the 0.00 format rounds the display.
function toHours(minutes: number): number {
  return minutes / MINUTES_PER_HOUR;
}

// A yyyy-MM-dd day as UTC midnight: exceljs stores dates by their UTC time, so the cell shows
// that same day in any zone.
function toDateCell(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

function addSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  columns: ColumnSpec[],
): ExcelJS.Worksheet {
  const worksheet = workbook.addWorksheet(name, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  worksheet.columns = columns.map((column) => ({
    header: column.header,
    width: column.width,
    style: column.style,
  }));
  worksheet.getRow(1).font = { bold: true };
  return worksheet;
}

function styleTotalRow(row: ExcelJS.Row, columnCount: number): void {
  for (let column = 1; column <= columnCount; column += 1) {
    const cell = row.getCell(column);
    cell.font = { bold: true };
    cell.border = { top: { style: "thin" } };
  }
}

function joinOrDate(paidDates: string[]): CellValue {
  if (paidDates.length === 0) return null;

  return paidDates.length === 1
    ? toDateCell(paidDates[0])
    : paidDates.join(JOIN_SEPARATOR);
}

function totalsCells(totals: ExportTotals): CellValue[] {
  return [
    toHours(totals.minutes),
    toDollars(totals.shiftPayCents),
    toDollars(totals.adjustmentsCents),
    toDollars(totals.totalCents),
  ];
}

function addSummarySheet(
  workbook: ExcelJS.Workbook,
  lines: ExportSummaryLine[],
  total: ExportTotals,
): void {
  const worksheet = addSheet(workbook, SUMMARY_SHEET_NAME, SUMMARY_COLUMNS);
  for (const line of lines) {
    const methods =
      line.payoutMethods.length === 0
        ? null
        : line.payoutMethods.join(JOIN_SEPARATOR);
    worksheet.addRow([
      line.name,
      ...totalsCells(line),
      methods,
      joinOrDate(line.paidDates),
    ]);
  }
  const totalRow = worksheet.addRow([TOTAL_LABEL, ...totalsCells(total)]);
  styleTotalRow(totalRow, SUMMARY_COLUMNS.length);
}

function lineCells(line: ExportLine): CellValue[] {
  return [
    toDateCell(line.date),
    line.clientName,
    line.jobName,
    toHours(line.minutes),
    formatHoursMinutes(line.minutes),
    line.rateCents === null ? null : toDollars(line.rateCents),
    line.amountCents === null ? null : toDollars(line.amountCents),
  ];
}

function adjustmentCells(item: ExportAdjustment): CellValue[] {
  return [
    item.linkedDate === null ? null : toDateCell(item.linkedDate),
    `${ADJUSTMENT_PREFIX}${item.reason}`,
    null,
    null,
    null,
    null,
    toDollars(item.amountCents),
  ];
}

function addCleanerSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  cleaner: ExportCleaner,
): void {
  const worksheet = addSheet(workbook, name, CLEANER_COLUMNS);
  const rows = [
    ...cleaner.lines.map(lineCells),
    ...cleaner.adjustments.map(adjustmentCells),
  ];
  worksheet.addRows(rows);
  const totalRow = worksheet.addRow([
    TOTAL_LABEL,
    null,
    null,
    toHours(cleaner.minutes),
    formatHoursMinutes(cleaner.minutes),
    null,
    toDollars(cleaner.totalCents),
  ]);
  styleTotalRow(totalRow, CLEANER_COLUMNS.length);
}

function cleanSheetName(name: string): string {
  return name.replace(ILLEGAL_SHEET_NAME_CHARACTERS, "").replace(/\s+/g, " ");
}

// Trims after cutting to length: Excel refuses a name that starts or ends with an apostrophe,
// and the cut can land just after one ("… O'Brien" -> "… O'").
function fitSheetName(base: string, suffix: string): string {
  const cut = truncateCodePoints(base, MAX_SHEET_NAME_LENGTH - suffix.length)
    .replace(EDGE_APOSTROPHES_AND_SPACES, "");
  return `${cut === "" ? FALLBACK_SHEET_NAME : cut}${suffix}`;
}

// At most `maxLength` UTF-16 units (exceljs's measure) without splitting an emoji's pair.
function truncateCodePoints(text: string, maxLength: number): string {
  let result = "";
  for (const character of Array.from(text)) {
    if (result.length + character.length > maxLength) break;
    result += character;
  }
  return result;
}

// Excel compares tab names case-insensitively; "Summary" is ours and "History" is reserved.
function getSheetNames(cleaners: ExportCleaner[]): string[] {
  let taken = new Set(
    [SUMMARY_SHEET_NAME, RESERVED_SHEET_NAME].map((name) => name.toLowerCase()),
  );
  let names: string[] = [];
  for (const cleaner of cleaners) {
    const base = cleanSheetName(cleaner.name);
    let name = fitSheetName(base, "");
    for (let copy = 2; taken.has(name.toLowerCase()); copy += 1) {
      name = fitSheetName(base, ` (${copy})`);
    }
    taken = new Set([...taken, name.toLowerCase()]);
    names = [...names, name];
  }
  return names;
}

export async function renderPayrollWorkbook(
  model: PayrollExportModel,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  addSummarySheet(workbook, model.summary.lines, model.summary.total);
  const names = getSheetNames(model.cleaners);
  model.cleaners.forEach((cleaner, index) => {
    addCleanerSheet(workbook, names[index], cleaner);
  });
  const data = await workbook.xlsx.writeBuffer();
  return Buffer.from(data);
}
