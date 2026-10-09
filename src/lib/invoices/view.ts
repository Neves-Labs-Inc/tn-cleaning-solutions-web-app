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

export type InvoiceFilter = {
  query: string
  status: 'all' | InvoiceEffectiveStatus
  clientId: string
  automaticOnly: boolean
  showArchived: boolean
}

export type ReceivablesTotals = {
  outstandingCents: number
  overdueCents: number
  noDueDateCents: number
  unpaidCount: number
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
  is_excluded: boolean
}

export type UnbilledTag = 'excluded' | 'unpriced' | null

export type UnbilledGroup = {
  clientId: string
  clientName: string
  visits: Array<UnbilledVisit & { tag: UnbilledTag }>
}

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

function relationName(clients: ClientRelation): string {
  const client = Array.isArray(clients) ? clients[0] : clients
  return client?.name ?? ''
}

export function filterInvoices(rows: InvoiceViewRow[], filter: InvoiceFilter): InvoiceViewRow[] {
  const query = filter.query.trim().toLowerCase()

  return rows.filter((row) => {
    if (row.is_archived && !filter.showArchived) return false
    if (filter.status !== 'all' && row.effective_status !== filter.status) return false
    if (filter.clientId && row.client_id !== filter.clientId) return false
    if (filter.automaticOnly && !row.is_automatic) return false
    if (!query) return true

    return `${row.invoice_number ?? ''} ${relationName(row.clients)}`.toLowerCase().includes(query)
  })
}

function isOwed(row: InvoiceViewRow): boolean {
  return (row.effective_status === 'issued' || row.effective_status === 'overdue') && !row.is_archived
}

function sumCents(rows: InvoiceViewRow[]): number {
  return rows.reduce((total, row) => total + row.total_cents, 0)
}

export function receivablesTotals(rows: InvoiceViewRow[]): ReceivablesTotals {
  const owed = rows.filter(isOwed)

  return {
    outstandingCents: sumCents(owed),
    overdueCents: sumCents(owed.filter((row) => row.effective_status === 'overdue')),
    noDueDateCents: sumCents(owed.filter((row) => row.due_date === null)),
    unpaidCount: owed.length,
  }
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

export function overdueInvoices(rows: InvoiceViewRow[]): InvoiceViewRow[] {
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
  if (visit.is_excluded) return 'excluded'
  return visit.live_price_cents === null ? 'unpriced' : null
}

export function groupUnbilled(visits: UnbilledVisit[]): UnbilledGroup[] {
  const groups = new Map<string, UnbilledGroup>()

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

// --- Ledger list: URL filter, row shape (ticket 09) ---

// listInvoices returns at most this many rows (PostgREST max_rows), so a list this long was cut off.
export const INVOICE_LIST_LIMIT = 1000

// The bulk-issue action rejects a post with more ids than this, so a selection stops here.
export const BULK_ISSUE_LIMIT = 200

const FILTER_STATUSES: InvoiceEffectiveStatus[] = ['draft', 'issued', 'overdue', 'paid', 'void']

type SearchParamValue = string | string[] | undefined

// What the ledger list needs per row; the client's contact details stay on the server.
export type LedgerListRow = Omit<InvoiceViewRow, 'clients'> & { client_name: string }

export type ClientOption = { id: string; name: string }

// A repeated param is ambiguous, so it counts as absent.
function singleParam(value: SearchParamValue): string {
  return typeof value === 'string' ? value : ''
}

function isFilterStatus(value: string): value is InvoiceEffectiveStatus {
  return (FILTER_STATUSES as string[]).includes(value)
}

export function parseInvoiceFilter(params: Record<string, SearchParamValue>): InvoiceFilter {
  const status = singleParam(params.status)

  return {
    query: singleParam(params.q).trim(),
    status: isFilterStatus(status) ? status : 'all',
    clientId: singleParam(params.client),
    automaticOnly: singleParam(params.automatic) === '1',
    showArchived: singleParam(params.archived) === '1',
  }
}

// Defaults are omitted so the unfiltered list keeps a clean URL.
export function invoiceFilterToSearchParams(filter: InvoiceFilter): URLSearchParams {
  const params = new URLSearchParams()
  if (filter.query) params.set('q', filter.query)
  if (filter.status !== 'all') params.set('status', filter.status)
  if (filter.clientId) params.set('client', filter.clientId)
  if (filter.automaticOnly) params.set('automatic', '1')
  if (filter.showArchived) params.set('archived', '1')
  return params
}

export function isInvoiceFilterActive(filter: InvoiceFilter): boolean {
  return invoiceFilterToSearchParams(filter).size > 0
}

// An archived draft is read-only, so only open drafts can join a bulk issue.
export function isSelectableDraft(row: { status: InvoiceStatus; is_archived: boolean }): boolean {
  return row.status === 'draft' && !row.is_archived
}

export function toLedgerListRow(row: InvoiceViewRow): LedgerListRow {
  const { clients, ...rest } = row
  return { ...rest, client_name: relationName(clients) || 'Unknown client' }
}

// Clients that have an invoice, A to Z: a client with none can't match a filter anyway.
export function invoiceClientOptions(rows: InvoiceViewRow[]): ClientOption[] {
  const byId = new Map(rows.map((row) => [row.client_id, relationName(row.clients)]))

  return [...byId.entries()]
    .map(([id, name]) => ({ id, name: name || 'Unknown client' }))
    .sort((a, b) => a.name.localeCompare(b.name))
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
