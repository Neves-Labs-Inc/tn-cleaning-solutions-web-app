import { createElement as h, type ReactElement } from "react";
import {
  Document,
  renderToBuffer,
  StyleSheet,
  Text,
  View,
  type DocumentProps,
} from "@react-pdf/renderer";

// Relative imports: node --test runs this file without the @/ alias.
import {
  BUSINESS_NAME,
  PdfPage,
  PdfTable,
  type PdfCell,
  type PdfColumn,
} from "../pdf/components.ts";
import { formatCad, formatSignedCad } from "../pdf/format.ts";
import { formatRate } from "../pricing/money.ts";
import { PDF_COLORS, PDF_FONTS, PDF_STYLES } from "../pdf/theme.ts";
import { formatLongDate } from "./format.ts";
import type {
  MyPayAdjustmentRow,
  MyPayLineRow,
  MyPayRunRow,
} from "./my-pay.ts";
import {
  addDays,
  formatHoursMinutes,
  formatPeriodLabel,
  formatShortDate,
} from "./period.ts";

// A Cleaner's Pay statement for one paid Pay run, compact layout (variant A, #142). Built from the
// rows the employee views return, so it can only say what the Cleaner may already see in My pay.

export type PayStatementInput = {
  cleanerName: string;
  run: MyPayRunRow;
  // Already narrowed to this run.
  lines: MyPayLineRow[];
  adjustments: MyPayAdjustmentRow[];
};

export type PayStatementModel = {
  documentTitle: string;
  cleanerName: string;
  periodLine: string;
  paidLine: string;
  shiftRows: PdfCell[][];
  shiftsTotalRow: string[];
  adjustmentRows: PdfCell[][];
  // Null when the run has no Adjustments: the section is left out.
  adjustmentsTotalRow: string[] | null;
  totalPaid: string;
};

const DAYS_PER_PERIOD = 14;
const OFF_CYCLE_KIND = "off_cycle";
const NO_SHIFTS_LABEL = "No shifts on this run.";

const SHIFT_COLUMNS: PdfColumn[] = [
  { label: "Date", widthPct: 14, align: "left" },
  { label: "Client", widthPct: 42, align: "left" },
  { label: "Hours", widthPct: 12, align: "right" },
  { label: "Rate", widthPct: 14, align: "right" },
  { label: "Amount", widthPct: 18, align: "right" },
];

// Amount lines up with the Shifts Amount column.
const ADJUSTMENT_COLUMNS: PdfColumn[] = [
  { label: "Reason", widthPct: 82, align: "left" },
  { label: "Amount", widthPct: 18, align: "right" },
];

function getYear(day: string): string {
  return day.slice(0, 4);
}

// "Oct 5–18, 2026", "Sep 28–Oct 11, 2026", or "Dec 28, 2026–Jan 10, 2027" across a year.
function formatPeriodWithYear(periodStart: string): string {
  const periodEnd = addDays(periodStart, DAYS_PER_PERIOD - 1);
  return getYear(periodStart) === getYear(periodEnd)
    ? `${formatPeriodLabel({ start: periodStart, end: periodEnd })}, ${getYear(periodEnd)}`
    : `${formatLongDate(periodStart)}–${formatLongDate(periodEnd)}`;
}

function sumBy<T>(items: T[], getValue: (item: T) => number): number {
  return items.reduce((total, item) => total + getValue(item), 0);
}

function toShiftRow(line: MyPayLineRow): string[] {
  return [
    formatShortDate(line.scheduled_date),
    line.client_name,
    formatHoursMinutes(line.minutes),
    formatRate(line.rate_cents),
    formatCad(line.amount_cents),
  ];
}

function toAdjustmentRow(adjustment: MyPayAdjustmentRow): PdfCell[] {
  const linked =
    adjustment.linked_scheduled_date === null
      ? null
      : [
          formatShortDate(adjustment.linked_scheduled_date),
          adjustment.linked_client_name,
        ]
          .filter(Boolean)
          .join(" · ");
  return [
    linked === null ? adjustment.reason : { text: adjustment.reason, sub: linked },
    formatSignedCad(adjustment.amount_cents),
  ];
}

// "pay-statement-2026-10-05.pdf", or "...-off-cycle.pdf" for an off-cycle run.
export function getPayStatementFilename(run: MyPayRunRow): string {
  const suffix = run.kind === OFF_CYCLE_KIND ? "-off-cycle" : "";
  return `pay-statement-${run.period_start}${suffix}.pdf`;
}

// Pure: what the PDF says, as text.
export function buildPayStatementModel(
  input: PayStatementInput,
): PayStatementModel {
  const { cleanerName, run } = input;
  const period = formatPeriodWithYear(run.period_start);
  const lines = [...input.lines].sort(
    (left, right) =>
      left.scheduled_date.localeCompare(right.scheduled_date) ||
      left.client_name.localeCompare(right.client_name),
  );
  const adjustments = [...input.adjustments].sort((left, right) =>
    left.created_at.localeCompare(right.created_at),
  );
  const offCycleNote = run.kind === OFF_CYCLE_KIND ? " · Off-cycle" : "";

  return {
    documentTitle: `Pay statement · ${cleanerName} · ${period}`,
    cleanerName,
    periodLine: `Pay period ${period}${offCycleNote}`,
    paidLine: `Paid ${formatLongDate(run.paid_on)} by ${run.payout_method}`,
    shiftRows:
      lines.length === 0
        ? [["", { text: NO_SHIFTS_LABEL, muted: true }, "", "", ""]]
        : lines.map(toShiftRow),
    shiftsTotalRow: [
      "Shifts total",
      "",
      formatHoursMinutes(sumBy(lines, (line) => line.minutes)),
      "",
      formatCad(sumBy(lines, (line) => line.amount_cents)),
    ],
    adjustmentRows: adjustments.map(toAdjustmentRow),
    adjustmentsTotalRow:
      adjustments.length === 0
        ? null
        : [
            "Adjustments total",
            formatSignedCad(
              sumBy(adjustments, (adjustment) => adjustment.amount_cents),
            ),
          ],
    totalPaid: formatCad(run.total_cents),
  };
}

const STATEMENT_FONT_SIZE = {
  title: 13,
  name: 11,
  section: 11,
  total: 12,
  note: 7.5,
} as const;

const STATEMENT_STYLES = StyleSheet.create({
  title: {
    fontFamily: PDF_FONTS.bold,
    fontSize: STATEMENT_FONT_SIZE.title,
    marginTop: 10,
  },
  name: {
    fontFamily: PDF_FONTS.bold,
    fontSize: STATEMENT_FONT_SIZE.name,
    marginTop: 8,
  },
  section: {
    fontFamily: PDF_FONTS.bold,
    fontSize: STATEMENT_FONT_SIZE.section,
    marginTop: 14,
    marginBottom: 4,
  },
  total: { fontSize: STATEMENT_FONT_SIZE.total, marginTop: 14 },
  note: {
    fontSize: STATEMENT_FONT_SIZE.note,
    color: PDF_COLORS.muted,
    marginTop: 14,
  },
});

function renderHeader(model: PayStatementModel): ReactElement {
  return h(
    View,
    null,
    h(Text, { style: PDF_STYLES.brand }, BUSINESS_NAME),
    h(Text, { style: STATEMENT_STYLES.title }, "Pay statement"),
    h(Text, { style: STATEMENT_STYLES.name }, model.cleanerName),
    h(Text, { style: PDF_STYLES.meta }, model.periodLine),
    h(Text, { style: PDF_STYLES.meta }, model.paidLine),
  );
}

function renderTotalPaid(model: PayStatementModel): ReactElement {
  return h(
    View,
    {
      wrap: false,
      style: [PDF_STYLES.tableTotal, STATEMENT_STYLES.total, { justifyContent: "space-between" }],
    },
    h(Text, { style: PDF_STYLES.cell }, "Total paid"),
    h(Text, { style: PDF_STYLES.cell }, model.totalPaid),
  );
}

// A plain function, not a component: renderToBuffer wants the Document element itself.
function createPayStatementDocument(
  model: PayStatementModel,
): ReactElement<DocumentProps> {
  const adjustments =
    model.adjustmentsTotalRow === null
      ? []
      : [
          h(Text, { style: STATEMENT_STYLES.section }, "Adjustments"),
          h(PdfTable, {
            columns: ADJUSTMENT_COLUMNS,
            rows: model.adjustmentRows,
            totalRow: model.adjustmentsTotalRow,
          }),
        ];

  return h(
    Document,
    { title: model.documentTitle, author: BUSINESS_NAME },
    h(
      PdfPage,
      null,
      renderHeader(model),
      h(Text, { style: STATEMENT_STYLES.section }, "Shifts"),
      h(PdfTable, {
        columns: SHIFT_COLUMNS,
        rows: model.shiftRows,
        totalRow: model.shiftsTotalRow,
      }),
      ...adjustments,
      renderTotalPaid(model),
      h(Text, { style: STATEMENT_STYLES.note }, "All amounts in CAD."),
    ),
  );
}

export async function renderPayStatementPdf(
  model: PayStatementModel,
): Promise<Buffer> {
  return renderToBuffer(createPayStatementDocument(model));
}
