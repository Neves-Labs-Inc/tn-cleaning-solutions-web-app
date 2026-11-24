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
import { BUSINESS_NAME, PdfPage } from "../pdf/components.ts";
import { PDF_COLORS, PDF_FONTS } from "../pdf/theme.ts";
import type {
  InvoicePdfLine,
  InvoicePdfLineStatus,
  InvoicePdfModel,
} from "./invoice-pdf-model.ts";

// The Invoice PDF, layout A "classic table" (prototype/invoice-pdf, #203): business and Bill to on
// the left, the invoice block on the right, a bordered table, the total, the PAID stamp and Notes.

type Column = { label: string; widthPct: number; align: "left" | "right" };

const COLUMNS: Column[] = [
  { label: "Date", widthPct: 18, align: "left" },
  { label: "Description", widthPct: 44, align: "left" },
  { label: "Status", widthPct: 16, align: "left" },
  { label: "Amount", widthPct: 22, align: "right" },
];
const [DATE_COLUMN, DESCRIPTION_COLUMN, STATUS_COLUMN, AMOUNT_COLUMN] = COLUMNS;
const LAST_COLUMN_INDEX = COLUMNS.length - 1;

// Print colors the shared theme has no token for: the status pills and the faint watermarks.
const INVOICE_COLORS = {
  upcomingPillBackground: "#e0f2fe",
  upcomingPillText: "#0369a1",
  neutralPillBackground: "#f3f4f6",
  draftWatermark: "#e5e5e5",
  voidWatermark: "#fee2e2",
} as const;

const FONT_SIZE = {
  invoiceTitle: 20,
  clientName: 11,
  pill: 7,
  total: 11,
  stamp: 22,
  stampDetail: 9,
  watermark: 140,
} as const;

const WATERMARK = { top: 300, left: 40, rotation: "rotate(-35deg)" } as const;
const STAMP_ROTATION = "rotate(-8deg)";
const INVOICE_BLOCK_WIDTH = 190;
const TOTAL_LABEL_WIDTH_PCT = 100 - AMOUNT_COLUMN.widthPct;

const STYLES = StyleSheet.create({
  top: { flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  billTo: { marginTop: 14, color: PDF_COLORS.muted },
  clientName: { fontFamily: PDF_FONTS.bold, fontSize: FONT_SIZE.clientName },
  invoiceBlock: { width: INVOICE_BLOCK_WIDTH },
  invoiceTitle: {
    fontFamily: PDF_FONTS.bold,
    fontSize: FONT_SIZE.invoiceTitle,
    textAlign: "right",
    marginBottom: 6,
  },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  metaLabel: { color: PDF_COLORS.muted, marginRight: 14 },
  bold: { fontFamily: PDF_FONTS.bold },
  // Each row carries its own side borders rather than one box around the table: the closing block
  // (total, stamp, Notes) sits outside the lines and must not split from the last row.
  head: {
    flexDirection: "row",
    borderLeftWidth: 0.5,
    borderRightWidth: 0.5,
    borderColor: PDF_COLORS.border,
    backgroundColor: PDF_COLORS.primary,
    color: PDF_COLORS.onPrimary,
    fontFamily: PDF_FONTS.bold,
  },
  row: {
    flexDirection: "row",
    borderTopWidth: 0.5,
    borderLeftWidth: 0.5,
    borderRightWidth: 0.5,
    borderColor: PDF_COLORS.border,
  },
  cell: { padding: 5, borderRightWidth: 0.5, borderColor: PDF_COLORS.border },
  lastCell: { borderRightWidth: 0 },
  struck: { textDecoration: "line-through", color: PDF_COLORS.muted },
  pill: {
    alignSelf: "flex-start",
    fontFamily: PDF_FONTS.bold,
    fontSize: FONT_SIZE.pill,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
    color: PDF_COLORS.muted,
    backgroundColor: INVOICE_COLORS.neutralPillBackground,
  },
  upcomingPill: {
    color: INVOICE_COLORS.upcomingPillText,
    backgroundColor: INVOICE_COLORS.upcomingPillBackground,
  },
  totalRow: {
    flexDirection: "row",
    borderTopWidth: 1.5,
    borderColor: PDF_COLORS.text,
    paddingVertical: 6,
    fontFamily: PDF_FONTS.bold,
    fontSize: FONT_SIZE.total,
  },
  totalLabel: { width: `${TOTAL_LABEL_WIDTH_PCT}%`, textAlign: "right", paddingRight: 5 },
  totalAmount: {
    width: `${AMOUNT_COLUMN.widthPct}%`,
    textAlign: "right",
    paddingRight: 5,
  },
  stamp: {
    alignSelf: "flex-end",
    marginTop: 14,
    marginRight: 30,
    transform: STAMP_ROTATION,
    borderWidth: 3,
    borderColor: PDF_COLORS.primary,
    padding: 6,
    alignItems: "center",
  },
  stampWord: {
    fontFamily: PDF_FONTS.bold,
    fontSize: FONT_SIZE.stamp,
    color: PDF_COLORS.primary,
  },
  stampDetail: { fontSize: FONT_SIZE.stampDetail, color: PDF_COLORS.primary },
  notes: { marginTop: 18 },
  notesTitle: { fontFamily: PDF_FONTS.bold, marginBottom: 3 },
  notesBody: { color: PDF_COLORS.muted, lineHeight: 1.4 },
  watermark: {
    position: "absolute",
    top: WATERMARK.top,
    left: WATERMARK.left,
    transform: WATERMARK.rotation,
  },
  watermarkWord: { fontFamily: PDF_FONTS.bold, fontSize: FONT_SIZE.watermark },
});

function cellStyle(column: Column, index: number) {
  return [
    STYLES.cell,
    { width: `${column.widthPct}%` },
    index === LAST_COLUMN_INDEX ? STYLES.lastCell : {},
  ];
}

function renderHeadRow(): ReactElement {
  return h(
    View,
    { fixed: true, style: STYLES.head },
    ...COLUMNS.map((column, index) =>
      h(
        View,
        { style: cellStyle(column, index) },
        h(Text, { style: { textAlign: column.align } }, column.label),
      ),
    ),
  );
}

function renderPill(status: InvoicePdfLineStatus | null): ReactElement {
  if (status === null) return h(Text, null, "");

  return h(
    Text,
    { style: [STYLES.pill, status === "Upcoming" ? STYLES.upcomingPill : {}] },
    status,
  );
}

function renderRow(line: InvoicePdfLine): ReactElement {
  return h(
    View,
    { wrap: false, style: STYLES.row },
    h(
      View,
      { style: cellStyle(DATE_COLUMN, 0) },
      h(Text, null, line.date),
    ),
    h(
      View,
      { style: cellStyle(DESCRIPTION_COLUMN, 1) },
      h(Text, null, line.description),
    ),
    h(View, { style: cellStyle(STATUS_COLUMN, 2) }, renderPill(line.status)),
    h(
      View,
      { style: cellStyle(AMOUNT_COLUMN, 3) },
      h(
        Text,
        { style: [{ textAlign: AMOUNT_COLUMN.align }, line.isStruck ? STYLES.struck : {}] },
        line.amount,
      ),
    ),
  );
}

function renderMetaRow(label: string, value: string): ReactElement {
  return h(
    View,
    { style: STYLES.metaRow },
    h(Text, { style: STYLES.metaLabel }, label),
    h(Text, { style: STYLES.bold }, value),
  );
}

function renderTop(model: InvoicePdfModel): ReactElement {
  return h(
    View,
    { style: STYLES.top },
    h(
      View,
      null,
      h(
        Text,
        { style: { fontFamily: PDF_FONTS.bold, fontSize: 16, color: PDF_COLORS.primary } },
        BUSINESS_NAME,
      ),
      h(Text, { style: STYLES.billTo }, "Bill to"),
      h(Text, { style: STYLES.clientName }, model.clientName),
    ),
    h(
      View,
      { style: STYLES.invoiceBlock },
      h(Text, { style: STYLES.invoiceTitle }, "INVOICE"),
      renderMetaRow("Invoice #", model.invoiceNumber),
      renderMetaRow("Issued", model.issuedDate),
      model.dueDate === null ? null : renderMetaRow("Due", model.dueDate),
    ),
  );
}

function renderTotalRow(model: InvoicePdfModel): ReactElement {
  return h(
    View,
    { style: STYLES.totalRow },
    h(Text, { style: STYLES.totalLabel }, "Total (CAD)"),
    h(Text, { style: STYLES.totalAmount }, model.total),
  );
}

function renderStamp(paid: NonNullable<InvoicePdfModel["paid"]>): ReactElement {
  return h(
    View,
    { style: STYLES.stamp },
    h(Text, { style: STYLES.stampWord }, "PAID"),
    h(Text, { style: STYLES.stampDetail }, `${paid.date} · ${paid.method}`),
  );
}

function renderNotes(notes: string): ReactElement {
  return h(
    View,
    { style: STYLES.notes },
    h(Text, { style: STYLES.notesTitle }, "Notes"),
    h(Text, { style: STYLES.notesBody }, notes),
  );
}

// The total, the PAID stamp and the Notes stay in one block: they never split across pages.
function renderClosing(model: InvoicePdfModel): ReactElement {
  return h(
    View,
    { wrap: false },
    renderTotalRow(model),
    model.paid === null ? null : renderStamp(model.paid),
    model.notes === null ? null : renderNotes(model.notes),
  );
}

function renderWatermark(word: NonNullable<InvoicePdfModel["watermark"]>): ReactElement {
  const color =
    word === "DRAFT" ? INVOICE_COLORS.draftWatermark : INVOICE_COLORS.voidWatermark;
  return h(
    View,
    { fixed: true, style: STYLES.watermark },
    h(Text, { style: [STYLES.watermarkWord, { color }] }, word),
  );
}

// The last line rides in the closing block, so the total never sits alone at the top of a page.
function renderTable(model: InvoicePdfModel): ReactElement {
  const rows = model.lines.map(renderRow);
  return h(
    View,
    null,
    renderHeadRow(),
    ...rows.slice(0, -1),
    h(View, { wrap: false }, ...rows.slice(-1), renderClosing(model)),
  );
}

// A plain function, not a component: renderToBuffer wants the Document element itself.
function createInvoiceDocument(model: InvoicePdfModel): ReactElement<DocumentProps> {
  return h(
    Document,
    { title: model.documentTitle, author: BUSINESS_NAME },
    h(
      PdfPage,
      null,
      model.watermark === null ? null : renderWatermark(model.watermark),
      renderTop(model),
      renderTable(model),
    ),
  );
}

export async function renderInvoicePdf(model: InvoicePdfModel): Promise<Buffer> {
  return renderToBuffer(createInvoiceDocument(model));
}
