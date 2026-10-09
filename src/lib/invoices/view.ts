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
