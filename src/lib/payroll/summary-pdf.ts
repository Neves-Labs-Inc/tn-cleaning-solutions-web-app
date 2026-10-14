import { createElement as h, type ReactElement } from "react";
import {
  Document,
  renderToBuffer,
  type DocumentProps,
} from "@react-pdf/renderer";

// Relative imports: node --test runs this file without the @/ alias.
import {
  BUSINESS_NAME,
  PdfHeader,
  PdfPage,
  PdfTable,
  type PdfColumn,
} from "../pdf/components.ts";
import { formatCad, formatOptionalRate, formatSignedCad } from "../pdf/format.ts";
import { getBusinessDate } from "../schedule/business-time.ts";
import type { PayrollExportModel } from "./export-model.ts";
import { formatLongDate } from "./format.ts";
import {
  formatHoursMinutes,
  formatPeriodLabel,
  type PayPeriod,
} from "./period.ts";

// The accountant's one-glance PDF of a Pay period's Payroll export: one row per Cleaner with a
// grand total. Built from the export model, so it counts finalized and paid runs only and its
// total matches the spreadsheet's.

export type PayrollSummary = {
  // The PDF's metadata title.
  documentTitle: string;
  title: string;
  metaLine: string;
  columns: PdfColumn[];
  rows: string[][];
  totalRow: string[];
};

const TITLE = "Payroll summary";

const COLUMNS: PdfColumn[] = [
  { label: "Cleaner", widthPct: 36, align: "left" },
  { label: "Hours", widthPct: 12, align: "right" },
  { label: "Pay rate", widthPct: 18, align: "right" },
  { label: "Adjustments", widthPct: 17, align: "right" },
  { label: "Total", widthPct: 17, align: "right" },
];

function getYear(day: string): string {
  return day.slice(0, 4);
}

// "Oct 5–18, 2026", "Sep 28–Oct 11, 2026", or "Dec 28, 2026–Jan 10, 2027" across a year.
function formatPeriodWithYear(period: PayPeriod): string {
  return getYear(period.start) === getYear(period.end)
    ? `${formatPeriodLabel(period)}, ${getYear(period.end)}`
    : `${formatLongDate(period.start)}–${formatLongDate(period.end)}`;
}

// Pure: what the PDF says, as text. generatedAt is stamped in business time.
export function buildPayrollSummary(
  model: PayrollExportModel,
  generatedAt: Date,
): PayrollSummary {
  const periodLabel = formatPeriodWithYear(model.period);
  const generatedOn = formatLongDate(getBusinessDate(generatedAt));
  const rows = model.summary.lines.map((line) => [
    line.name,
    formatHoursMinutes(line.minutes),
    formatOptionalRate(model.currentRates[line.cleanerId] ?? null),
    formatSignedCad(line.adjustmentsCents),
    formatCad(line.totalCents),
  ]);
  const { total } = model.summary;

  return {
    documentTitle: `${TITLE} ${periodLabel}`,
    title: TITLE,
    metaLine: `${periodLabel} · Generated ${generatedOn}`,
    columns: COLUMNS,
    rows,
    totalRow: [
      "Total",
      formatHoursMinutes(total.minutes),
      "",
      formatSignedCad(total.adjustmentsCents),
      formatCad(total.totalCents),
    ],
  };
}

// A plain function, not a component: renderToBuffer wants the Document element itself.
function createPayrollSummaryDocument(
  summary: PayrollSummary,
): ReactElement<DocumentProps> {
  return h(
    Document,
    { title: summary.documentTitle, author: BUSINESS_NAME },
    h(
      PdfPage,
      null,
      h(PdfHeader, { title: summary.title, metaLine: summary.metaLine }),
      h(PdfTable, {
        columns: summary.columns,
        rows: summary.rows,
        totalRow: summary.totalRow,
      }),
    ),
  );
}

export async function renderPayrollSummaryPdf(
  model: PayrollExportModel,
  generatedAt: Date = new Date(),
): Promise<Buffer> {
  const summary = buildPayrollSummary(model, generatedAt);
  return renderToBuffer(createPayrollSummaryDocument(summary));
}
