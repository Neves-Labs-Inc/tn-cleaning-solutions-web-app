import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  clientBalances,
  daysOverdue,
  dueLabel,
  filterInvoices,
  groupUnbilled,
  invoiceLabel,
  overdueInvoices,
  receivablesTotals,
  type InvoiceFilter,
  type InvoiceViewRow,
  type UnbilledVisit,
} from '../../src/lib/invoices/view.ts'
import { invoiceStatusBadge, lineStateBadge } from '../../src/components/ui/status-badge-tones.ts'

const TODAY = '2026-10-07'

const ALL: InvoiceFilter = { query: '', status: 'all', clientId: '', automaticOnly: false, showArchived: false }

function row(overrides: Partial<InvoiceViewRow> & { id: string }): InvoiceViewRow {
  return {
    client_id: 'c1',
    status: 'issued',
    effective_status: 'issued',
    invoice_number: '2026-0001',
    due_date: '2026-10-20',
    total_cents: 10000,
    is_archived: false,
    is_automatic: false,
    clients: { name: 'Acme Corp' },
    ...overrides,
  }
}

function ids(rows: InvoiceViewRow[]): string[] {
  return rows.map((r) => r.id)
}

test('invoiceStatusBadge maps each effective status to its tone and sentence-case label', () => {
  assert.deepEqual(invoiceStatusBadge('draft'), { tone: 'neutral', label: 'Draft' })
  assert.deepEqual(invoiceStatusBadge('issued'), { tone: 'info', label: 'Issued' })
  assert.deepEqual(invoiceStatusBadge('overdue'), { tone: 'warning', label: 'Overdue' })
  assert.deepEqual(invoiceStatusBadge('paid'), { tone: 'success', label: 'Paid' })
  assert.deepEqual(invoiceStatusBadge('void'), { tone: 'danger', label: 'Void' })
})

test('lineStateBadge maps problem states and renders nothing for ok', () => {
  assert.equal(lineStateBadge('ok'), null)
  assert.deepEqual(lineStateBadge('unpriced'), { tone: 'warning', label: 'Unpriced' })
  assert.deepEqual(lineStateBadge('upcoming'), { tone: 'info', label: 'Upcoming' })
  assert.deepEqual(lineStateBadge('cancelled'), { tone: 'danger', label: 'Cancelled' })
})

test('invoiceLabel shows the number when numbered and Draft otherwise', () => {
  assert.equal(invoiceLabel({ invoice_number: '2026-0007' }), '2026-0007')
  assert.equal(invoiceLabel({ invoice_number: null }), 'Draft')
})

test('dueLabel says No due date for an issued invoice without one', () => {
  assert.equal(dueLabel({ status: 'issued', due_date: null }, TODAY), 'No due date')
})

test('dueLabel is not late on the due date itself', () => {
  assert.equal(dueLabel({ status: 'issued', due_date: TODAY }, TODAY), 'Oct 7, 2026')
  assert.equal(daysOverdue({ status: 'issued', due_date: TODAY }, TODAY), 0)
})

test('dueLabel counts days late once past due', () => {
  assert.equal(dueLabel({ status: 'issued', due_date: '2026-10-06' }, TODAY), 'Oct 6, 2026 · 1d late')
  assert.equal(dueLabel({ status: 'issued', due_date: '2026-10-03' }, TODAY), 'Oct 3, 2026 · 4d late')
  assert.equal(daysOverdue({ status: 'issued', due_date: '2026-10-03' }, TODAY), 4)
})

test('dueLabel for a non-issued invoice is the plain date or Not set, never late', () => {
  assert.equal(dueLabel({ status: 'draft', due_date: null }, TODAY), 'Not set')
  assert.equal(dueLabel({ status: 'paid', due_date: '2026-10-03' }, TODAY), 'Oct 3, 2026')
  assert.equal(daysOverdue({ status: 'paid', due_date: '2026-10-03' }, TODAY), 0)
})

test('filterInvoices hides archived rows unless asked', () => {
  const rows = [row({ id: 'a' }), row({ id: 'b', is_archived: true })]

  assert.deepEqual(ids(filterInvoices(rows, ALL)), ['a'])
  assert.deepEqual(ids(filterInvoices(rows, { ...ALL, showArchived: true })), ['a', 'b'])
})

test('filterInvoices narrows by status, client and automatic', () => {
  const rows = [
    row({ id: 'a' }),
    row({ id: 'b', status: 'paid', effective_status: 'paid' }),
    row({ id: 'c', client_id: 'c2', is_automatic: true }),
  ]

  assert.deepEqual(ids(filterInvoices(rows, { ...ALL, status: 'paid' })), ['b'])
  assert.deepEqual(ids(filterInvoices(rows, { ...ALL, clientId: 'c2' })), ['c'])
  assert.deepEqual(ids(filterInvoices(rows, { ...ALL, automaticOnly: true })), ['c'])
})

test('filterInvoices query matches number or client name, case-insensitively', () => {
  const rows = [
    row({ id: 'a', invoice_number: '2026-0042', clients: { name: 'Acme Corp' } }),
    row({
      id: 'b',
      invoice_number: null,
      status: 'draft',
      effective_status: 'draft',
      clients: [{ name: 'Birch Dental' }],
    }),
  ]

  assert.deepEqual(ids(filterInvoices(rows, { ...ALL, query: '0042' })), ['a'])
  assert.deepEqual(ids(filterInvoices(rows, { ...ALL, query: ' birch ' })), ['b'])
  assert.deepEqual(ids(filterInvoices(rows, { ...ALL, query: 'ACME' })), ['a'])
  assert.deepEqual(filterInvoices(rows, { ...ALL, query: 'nope' }), [])
})

test('receivablesTotals counts only issued unarchived rows and splits overdue and no-due-date', () => {
  const rows = [
    row({ id: 'issued', total_cents: 10000, due_date: '2026-10-20' }),
    row({ id: 'late', effective_status: 'overdue', total_cents: 5000, due_date: '2026-10-01' }),
    row({ id: 'nodue', total_cents: 2000, due_date: null }),
    row({ id: 'draft', status: 'draft', effective_status: 'draft', invoice_number: null, total_cents: 9900 }),
    row({ id: 'void', status: 'void', effective_status: 'void', total_cents: 9900 }),
    row({ id: 'paid', status: 'paid', effective_status: 'paid', total_cents: 9900 }),
    row({ id: 'archived', total_cents: 9900, is_archived: true }),
  ]

  assert.deepEqual(receivablesTotals(rows), {
    outstandingCents: 17000,
    overdueCents: 5000,
    noDueDateCents: 2000,
    unpaidCount: 3,
  })
})

test('clientBalances drops zero balances and sorts overdue desc then owed desc', () => {
  const rows = [
    row({ id: '1', client_id: 'a', total_cents: 9000 }),
    row({ id: '2', client_id: 'b', effective_status: 'overdue', total_cents: 1000, due_date: '2026-10-02' }),
    row({ id: '3', client_id: 'b', total_cents: 500, due_date: '2026-09-30' }),
    row({ id: '4', client_id: 'c', effective_status: 'overdue', total_cents: 3000, due_date: '2026-10-05' }),
    row({ id: '5', client_id: 'd', status: 'paid', effective_status: 'paid', total_cents: 7000 }),
    row({ id: '6', client_id: 'e', total_cents: 4000 }),
  ]
  const clients = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, name: `Client ${id}` }))

  assert.deepEqual(clientBalances(rows, clients), [
    { clientId: 'c', name: 'Client c', owedCents: 3000, overdueCents: 3000, oldestDue: '2026-10-05' },
    { clientId: 'b', name: 'Client b', owedCents: 1500, overdueCents: 1000, oldestDue: '2026-09-30' },
    { clientId: 'a', name: 'Client a', owedCents: 9000, overdueCents: 0, oldestDue: '2026-10-20' },
    { clientId: 'e', name: 'Client e', owedCents: 4000, overdueCents: 0, oldestDue: '2026-10-20' },
  ])
})

test('overdueInvoices lists overdue unarchived rows, oldest due first', () => {
  const rows = [
    row({ id: 'new', effective_status: 'overdue', due_date: '2026-10-05' }),
    row({ id: 'old', effective_status: 'overdue', due_date: '2026-09-01' }),
    row({ id: 'arch', effective_status: 'overdue', due_date: '2026-08-01', is_archived: true }),
    row({ id: 'fine' }),
  ]

  assert.deepEqual(ids(overdueInvoices(rows)), ['old', 'new'])
})

test('groupUnbilled groups per client and tags excluded and unpriced visits', () => {
  const visit = (id: string, client: string, name: string, overrides: Partial<UnbilledVisit> = {}): UnbilledVisit => ({
    id,
    client_id: client,
    client_name: name,
    scheduled_date: '2026-10-01',
    live_price_cents: 5000,
    is_excluded: false,
    ...overrides,
  })

  const groups = groupUnbilled([
    visit('v1', 'b', 'Birch'),
    visit('v2', 'a', 'Acme', { live_price_cents: null }),
    visit('v3', 'b', 'Birch', { is_excluded: true, live_price_cents: null }),
  ])

  assert.deepEqual(
    groups.map((g) => [g.clientName, g.visits.map((v) => [v.id, v.tag])]),
    [
      ['Acme', [['v2', 'unpriced']]],
      ['Birch', [['v1', null], ['v3', 'excluded']]],
    ],
  )
})
