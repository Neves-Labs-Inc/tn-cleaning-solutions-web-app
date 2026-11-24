// Relative imports: node --test runs this file without the @/ alias.
import { formatCad } from "../pdf/format.ts";
import { formatLongDate } from "../payroll/format.ts";
import type { InvoiceDetail } from "./queries.ts";
import type { InvoiceStatus } from "./view.ts";

// What the Invoice PDF says, as text (CONTEXT.md "Invoice PDF"). Pure and free of the renderer, so
// a client component can import hasInvoicePdf without bundling @react-pdf/renderer.

export type InvoicePdfLineStatus = "Upcoming" | "Cancelled" | "Unpriced";

export type InvoicePdfLine = {
  date: string;
  description: string;
  // The pill in the Status column; null leaves it blank.
  status: InvoicePdfLineStatus | null;
  amount: string;
  // A Cancelled line's amount is struck through.
  isStruck: boolean;
};

export type InvoicePdfModel = {
  documentTitle: string;
  clientName: string;
  invoiceNumber: string;
  issuedDate: string;
  // Null when no due date is set: the Due row is left out.
  dueDate: string | null;
  lines: InvoicePdfLine[];
  total: string;
  // The client-facing Notes; null when blank. The Internal note never reaches the model.
  notes: string | null;
  // Null unless the invoice is paid.
  paid: { date: string; method: string } | null;
  // One faint diagonal word on every page.
  watermark: "DRAFT" | "VOID" | null;
};

type InvoicePdfSource = Pick<InvoiceDetail, "invoice" | "lines" | "total_cents">;

const DRAFT_NUMBER_LABEL = "Draft";
const NOT_ISSUED_LABEL = "Not issued";
const UNKNOWN_CLIENT = "Client";
const FILENAME_FALLBACK = "client";

const LINE_STATUS_LABEL = {
  upcoming: "Upcoming",
  cancelled: "Cancelled",
  unpriced: "Unpriced",
  ok: null,
} as const;

const WATERMARK_BY_STATUS: Record<InvoiceStatus, InvoicePdfModel["watermark"]> = {
  draft: "DRAFT",
  void: "VOID",
  issued: null,
  paid: null,
};

// A Mark paid invoice is billed and paid in one step, so there is no invoice to send while it stays
// paid. Undoing the Payment clears the marker for good, and a void one has its PDF back.
export function hasInvoicePdf(invoice: {
  status: InvoiceStatus;
  is_mark_paid: boolean;
}): boolean {
  return !(invoice.status === "paid" && invoice.is_mark_paid);
}

// ASCII only, so the name is safe in a Content-Disposition header and on any file system.
function toFilenamePart(name: string): string {
  const safe = name
    .normalize("NFD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return safe === "" ? FILENAME_FALLBACK : safe;
}

// "INV-042-SMI2026.pdf", or "Draft-Margaret-Okafor-2026-11-23.pdf" for a draft.
export function getInvoicePdfFilename(
  source: Pick<InvoicePdfSource, "invoice">,
  businessDate: string,
): string {
  const { invoice } = source;
  if (invoice.status !== "draft" && invoice.invoice_number !== null) {
    return `${invoice.invoice_number}.pdf`;
  }
  const clientName = invoice.client?.name ?? UNKNOWN_CLIENT;
  return `Draft-${toFilenamePart(clientName)}-${businessDate}.pdf`;
}

function toLine(line: InvoicePdfSource["lines"][number]): InvoicePdfLine {
  return {
    date: formatLongDate(line.visit.scheduled_date),
    description: line.visit.job_name,
    status: LINE_STATUS_LABEL[line.state],
    amount: formatCad(line.amount_cents),
    isStruck: line.state === "cancelled",
  };
}

function toNotes(notes: string | null): string | null {
  const trimmed = notes?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

// A line's amount is already the right one for the status: the Billed amount once issued, paid or
// void, the Live price on a draft (an Unpriced line is $0), and $0 for a Cancelled line.
export function buildInvoicePdfModel(
  detail: InvoicePdfSource,
  businessDate: string,
): InvoicePdfModel {
  const { invoice } = detail;
  const isDraft = invoice.status === "draft";
  const clientName = invoice.client?.name ?? UNKNOWN_CLIENT;
  const invoiceNumber = isDraft
    ? DRAFT_NUMBER_LABEL
    : (invoice.invoice_number ?? DRAFT_NUMBER_LABEL);
  const lines = [...detail.lines].sort((left, right) =>
    left.visit.scheduled_date.localeCompare(right.visit.scheduled_date) ||
    left.visit.scheduled_start_time.localeCompare(right.visit.scheduled_start_time),
  );
  const { paid_date: paidDate, payment_method: paymentMethod } = invoice;

  return {
    documentTitle: isDraft
      ? `Draft invoice · ${clientName} · ${formatLongDate(businessDate)}`
      : `Invoice ${invoiceNumber}`,
    clientName,
    invoiceNumber,
    issuedDate:
      invoice.issued_date === null
        ? NOT_ISSUED_LABEL
        : formatLongDate(invoice.issued_date),
    dueDate: invoice.due_date === null ? null : formatLongDate(invoice.due_date),
    lines: lines.map(toLine),
    total: formatCad(detail.total_cents),
    notes: toNotes(invoice.notes),
    paid:
      invoice.status === "paid" && paidDate !== null && paymentMethod !== null
        ? { date: formatLongDate(paidDate), method: paymentMethod }
        : null,
    watermark: WATERMARK_BY_STATUS[invoice.status],
  };
}
