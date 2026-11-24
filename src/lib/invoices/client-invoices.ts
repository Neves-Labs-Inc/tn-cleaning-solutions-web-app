import { getBusinessDate } from '../schedule/business-time.ts'
import { effectiveStatus, type InvoiceEffectiveStatus, type InvoiceStatus } from './view.ts'

// The client Billing tab's invoice rows and how they split into Drafts, Owed and History. Pure, so
// node:test and the client component both load it.

export type ClientInvoice = {
  id: string
  status: InvoiceStatus
  invoice_number: string | null
  created_at: string | null
  issued_date: string | null
  due_date: string | null
  paid_date: string | null
  payment_method: string | null
  // An open draft's total is its Live price; every other invoice's is the view's Billed amounts.
  total_cents: number
  is_archived: boolean
  is_automatic: boolean
  is_mark_paid: boolean
  // Live lines on an open draft; null elsewhere (a released draft holds none, a paid or void one is a record).
  line_count: number | null
}

export type ClientInvoiceRow = ClientInvoice & { effective_status: InvoiceEffectiveStatus }

export type GroupedClientInvoices = {
  drafts: ClientInvoiceRow[]
  owed: ClientInvoiceRow[]
  history: ClientInvoiceRow[]
}

const NO_DUE_DATE = 'No due date'
const FAR_FUTURE = '9999-12-31'

const shortDateFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

// "Nov 20" from a date-only string; parsed as UTC so no zone shifts the day.
function formatShortDate(dateOnly: string): string {
  const [year, month, day] = dateOnly.split('-').map(Number)
  return shortDateFormatter.format(Date.UTC(year, month - 1, day))
}

// The Business date the invoice was created on (the same Eastern day the activity_date view uses).
function createdDate(invoice: ClientInvoice): string {
  return invoice.created_at ? getBusinessDate(new Date(invoice.created_at)) : ''
}

// The date History orders by: when it was paid, else issued, else created.
function activityDate(invoice: ClientInvoice): string {
  return invoice.paid_date ?? invoice.issued_date ?? createdDate(invoice)
}

function byOverdueThenDueDate(a: ClientInvoiceRow, b: ClientInvoiceRow): number {
  const overdueRank = Number(b.effective_status === 'overdue') - Number(a.effective_status === 'overdue')
  return overdueRank || (a.due_date ?? FAR_FUTURE).localeCompare(b.due_date ?? FAR_FUTURE) || a.id.localeCompare(b.id)
}

function byNewestActivity(a: ClientInvoiceRow, b: ClientInvoiceRow): number {
  return (
    activityDate(b).localeCompare(activityDate(a)) ||
    (b.created_at ?? '').localeCompare(a.created_at ?? '') ||
    a.id.localeCompare(b.id)
  )
}

function byNewestCreated(a: ClientInvoiceRow, b: ClientInvoiceRow): number {
  return (b.created_at ?? '').localeCompare(a.created_at ?? '') || a.id.localeCompare(b.id)
}

// Drafts: open drafts, newest first. Owed: issued and overdue, overdue first then by due date.
// History: everything else, newest activity first; archived rows only when showArchived.
export function groupClientInvoices(
  invoices: ClientInvoice[],
  businessDate: string,
  showArchived: boolean
): GroupedClientInvoices {
  const rows = invoices.map((invoice) => ({ ...invoice, effective_status: effectiveStatus(invoice, businessDate) }))
  const isDraft = (row: ClientInvoiceRow) => row.status === 'draft' && !row.is_archived
  const isOwed = (row: ClientInvoiceRow) => row.status === 'issued' && !row.is_archived

  return {
    drafts: rows.filter(isDraft).sort(byNewestCreated),
    owed: rows.filter(isOwed).sort(byOverdueThenDueDate),
    history: rows
      .filter((row) => !isDraft(row) && !isOwed(row) && (showArchived || !row.is_archived))
      .sort(byNewestActivity),
  }
}

export function invoiceTitle(invoice: Pick<ClientInvoice, 'invoice_number' | 'is_automatic'>): string {
  if (invoice.invoice_number) return invoice.invoice_number
  return invoice.is_automatic ? 'Automatic draft' : 'Draft'
}

// "Created Nov 20 · 2 lines", "Due Dec 3", "Paid Nov 2 · Cash", "Voided · issued Nov 2".
export function invoiceSubtitle(invoice: ClientInvoice): string {
  const created = createdDate(invoice)
  const issued = invoice.issued_date

  if (invoice.status === 'draft') {
    const base = created ? `Created ${formatShortDate(created)}` : 'Created'
    return invoice.line_count === null ? base : `${base} · ${pluralize(invoice.line_count, 'line')}`
  }
  if (invoice.status === 'issued') return invoice.due_date ? `Due ${formatShortDate(invoice.due_date)}` : NO_DUE_DATE
  if (invoice.status === 'paid') {
    const date = activityDate(invoice)
    const paid = `${invoice.is_mark_paid ? 'Marked paid' : 'Paid'}${date ? ` ${formatShortDate(date)}` : ''}`
    return invoice.payment_method ? `${paid} · ${invoice.payment_method}` : paid
  }
  const voidedFrom = issued ?? created
  return voidedFrom ? `Voided · issued ${formatShortDate(voidedFrom)}` : 'Voided'
}

// The add-or-new dialog's rows: "Draft created Nov 20" over "3 appointments · $540.00".
export function draftChoiceTitle(draft: ClientInvoice): string {
  const created = createdDate(draft)
  return created ? `Draft created ${formatShortDate(created)}` : 'Draft'
}

export function draftChoiceSubline(draft: ClientInvoice, formatMoney: (cents: number) => string): string {
  return `${pluralize(draft.line_count ?? 0, 'appointment')} · ${formatMoney(draft.total_cents)}`
}
