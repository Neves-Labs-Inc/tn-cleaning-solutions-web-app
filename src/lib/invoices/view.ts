import { getBusinessDate } from '../schedule/business-time.ts'

export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'void'
export type InvoiceEffectiveStatus = InvoiceStatus | 'overdue'
export type LineState = 'ok' | 'unpriced' | 'upcoming' | 'cancelled'

type ClientRelation = { name: string } | { name: string }[] | null

export type InvoiceViewRow = {
  id: string
  client_id: string
  status: InvoiceStatus
  effective_status: InvoiceEffectiveStatus
  invoice_number: string | null
  issued_date: string | null
  due_date: string | null
  total_cents: number
  is_archived: boolean
  is_automatic: boolean
  // A draft holding an Unpriced line can't be issued; always false once issued.
  has_unpriced: boolean
  clients: ClientRelation
}

// From invoice_receivables_totals: owed figures over issued, unarchived invoices, and open drafts.
export type ReceivablesTotals = {
  outstandingCents: number
  overdueCents: number
  noDueDateCents: number
  unpaidCount: number
  draftCount: number
}

export type ClientBalance = {
  clientId: string
  name: string
  owedCents: number
  overdueCents: number
  oldestDue: string | null
}

export type UnbilledVisit = {
  id: string
  client_id: string
  client_name: string
  scheduled_date: string
  live_price_cents: number | null
}

export type UnbilledTag = 'unpriced' | null

// Generic so a caller's richer visit rows (time, job, location) survive grouping.
export type UnbilledGroup<T extends UnbilledVisit = UnbilledVisit> = {
  clientId: string
  clientName: string
  visits: Array<T & { tag: UnbilledTag }>
}

// One open (unarchived) draft as the Receivables Drafts section reads it. totalCents is the Live price.
export type OpenDraft = {
  id: string
  clientId: string
  clientName: string
  createdAt: string
  appointmentCount: number
  unpricedCount: number
  totalCents: number
}

export type DraftRow = OpenDraft & { ageDays: number; ageLabel: string }

const MS_PER_DAY = 86_400_000

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

export function invoiceLabel(row: { invoice_number: string | null }): string {
  return row.invoice_number ?? 'Draft'
}

// Overdue is issued with a due date before the business date.
export function effectiveStatus(
  row: { status: InvoiceStatus; due_date: string | null },
  businessDate: string,
): InvoiceEffectiveStatus {
  const isLate = row.status === 'issued' && row.due_date !== null && row.due_date < businessDate
  return isLate ? 'overdue' : row.status
}

// Date-only strings are parsed as UTC so day arithmetic never crosses a DST edge.
function parseDateOnly(value: string): number {
  const [year, month, day] = value.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

export function formatDateOnly(value: string): string {
  return dateFormatter.format(parseDateOnly(value))
}

export function daysOverdue(
  row: { status: InvoiceStatus; due_date: string | null },
  businessDate: string,
): number {
  if (effectiveStatus(row, businessDate) !== 'overdue' || row.due_date === null) return 0

  return Math.round((parseDateOnly(businessDate) - parseDateOnly(row.due_date)) / MS_PER_DAY)
}

export function dueLabel(
  row: { status: InvoiceStatus; due_date: string | null },
  businessDate: string,
): string {
  if (row.status !== 'issued') return row.due_date ? formatDateOnly(row.due_date) : 'Not set'
  if (row.due_date === null) return 'No due date'

  const late = daysOverdue(row, businessDate)
  const formatted = formatDateOnly(row.due_date)
  return late > 0 ? `${formatted} · ${late}d late` : formatted
}

function draftAgeLabel(ageDays: number): string {
  if (ageDays === 0) return 'Created today'
  return `Created ${ageDays} day${ageDays === 1 ? '' : 's'} ago`
}

// Oldest first, to match Overdue. Age counts Business dates, so a late-evening draft isn't a day old at midnight UTC.
export function draftRows(drafts: OpenDraft[], businessDate: string): DraftRow[] {
  return drafts
    .map((draft) => {
      const createdDate = getBusinessDate(new Date(draft.createdAt))
      const ageDays = Math.max(0, Math.round((parseDateOnly(businessDate) - parseDateOnly(createdDate)) / MS_PER_DAY))
      return { ...draft, ageDays, ageLabel: draftAgeLabel(ageDays) }
    })
    .sort((a, b) => b.ageDays - a.ageDays || a.createdAt.localeCompare(b.createdAt))
}

function isOwed(row: InvoiceViewRow): boolean {
  return (row.effective_status === 'issued' || row.effective_status === 'overdue') && !row.is_archived
}

function sumCents(rows: InvoiceViewRow[]): number {
  return rows.reduce((total, row) => total + row.total_cents, 0)
}

export function clientBalances(
  rows: InvoiceViewRow[],
  clients: Array<{ id: string; name: string }>,
): ClientBalance[] {
  const owed = rows.filter(isOwed)

  return clients
    .map((client) => {
      const theirs = owed.filter((row) => row.client_id === client.id)
      const dues = theirs.flatMap((row) => (row.due_date ? [row.due_date] : []))

      return {
        clientId: client.id,
        name: client.name,
        owedCents: sumCents(theirs),
        overdueCents: sumCents(theirs.filter((row) => row.effective_status === 'overdue')),
        oldestDue: dues.length > 0 ? dues.reduce((oldest, due) => (due < oldest ? due : oldest)) : null,
      }
    })
    .filter((balance) => balance.owedCents > 0)
    .sort((a, b) => b.overdueCents - a.overdueCents || b.owedCents - a.owedCents)
}

export function overdueInvoices<T extends InvoiceViewRow>(rows: T[]): T[] {
  return rows
    .filter((row) => isOwed(row) && row.effective_status === 'overdue')
    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
}

// Issued and overdue, unarchived, newest issued first: what a client still owes.
export function owedInvoices(rows: InvoiceViewRow[]): InvoiceViewRow[] {
  return rows.filter(isOwed).sort((a, b) => (b.issued_date ?? '').localeCompare(a.issued_date ?? ''))
}

export type UnbilledSummary = { count: number; pricedCents: number; unpricedCount: number }

export function unbilledSummary(visits: Array<{ live_price_cents: number | null }>): UnbilledSummary {
  return {
    count: visits.length,
    pricedCents: visits.reduce((total, visit) => total + (visit.live_price_cents ?? 0), 0),
    unpricedCount: visits.filter((visit) => visit.live_price_cents === null).length,
  }
}

function tagFor(visit: UnbilledVisit): UnbilledTag {
  return visit.live_price_cents === null ? 'unpriced' : null
}

export function groupUnbilled<T extends UnbilledVisit>(visits: T[]): Array<UnbilledGroup<T>> {
  const groups = new Map<string, UnbilledGroup<T>>()

  for (const visit of visits) {
    const group = groups.get(visit.client_id) ?? {
      clientId: visit.client_id,
      clientName: visit.client_name,
      visits: [],
    }
    group.visits.push({ ...visit, tag: tagFor(visit) })
    groups.set(visit.client_id, group)
  }

  return [...groups.values()].sort((a, b) => a.clientName.localeCompare(b.clientName))
}

// --- Payment methods (ticket 14) ---

// Same collapse as write_invoice_payment's btrim(regexp_replace(p_method, '\s+', ' ', 'g')).
export function normalizePaymentMethodName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

type NamedMethod = { id: string; name: string }

// The payment_methods_name_lower_key rule, checked early so the page can name the clash.
export function findDuplicateMethod<T extends NamedMethod>(name: string, methods: T[], selfId: string): T | null {
  const wanted = normalizePaymentMethodName(name).toLowerCase()
  const match = methods.find(
    (method) => method.id !== selfId && normalizePaymentMethodName(method.name).toLowerCase() === wanted,
  )
  return match ?? null
}

// --- Contact links (ticket 12) ---

export type ContactLinks = { phone: string | null; phoneHref: string | null; emailHref: string | null }

// The @ stays literal: encoding each side keeps odd characters out of the URL without breaking it.
function mailtoHref(email: string): string {
  const at = email.lastIndexOf('@')
  if (at < 0) return `mailto:${encodeURIComponent(email)}`
  return `mailto:${encodeURIComponent(email.slice(0, at))}@${encodeURIComponent(email.slice(at + 1))}`
}

// Phone and email can be NULL. A trailing extension ("ext 2", "x2") is cut off, since tel: can't dial it.
export function contactLinks(client: { phone: string | null; email: string | null } | null): ContactLinks {
  const phone = client?.phone?.trim() ?? ''
  const email = client?.email?.trim() ?? ''
  const dialable = phone.replace(/\s*(?:ext\.?|x)\s*\d+\s*$/i, '').replace(/[^\d+]/g, '')

  return {
    phone: phone || null,
    phoneHref: dialable ? `tel:${dialable}` : null,
    emailHref: email ? mailtoHref(email) : null,
  }
}
