import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  invoiceClientOptions,
  invoiceFilterToSearchParams,
  isInvoiceFilterActive,
  parseInvoiceFilter,
  toLedgerListRow,
  type InvoiceFilter,
  type InvoiceViewRow,
} from '../../src/lib/invoices/view.ts'

const DEFAULT: InvoiceFilter = { query: '', status: 'all', clientId: '', showArchived: false }

test('an empty query string parses to the default filter', () => {
  assert.deepEqual(parseInvoiceFilter({}), DEFAULT)
})

test('every param is read into the filter', () => {
  const filter = parseInvoiceFilter({ q: ' lee ', status: 'overdue', client: 'c9', archived: '1' })

  assert.deepEqual(filter, {
    query: 'lee',
    status: 'overdue',
    clientId: 'c9',
    showArchived: true,
  })
})

test('?status=draft opens on drafts, the contract ticket 12 links to', () => {
  assert.equal(parseInvoiceFilter({ status: 'draft' }).status, 'draft')
})

test('an unknown or repeated status falls back to all', () => {
  assert.equal(parseInvoiceFilter({ status: 'bogus' }).status, 'all')
  assert.equal(parseInvoiceFilter({ status: ['draft', 'paid'] }).status, 'all')
})

test('toggles only turn on for exactly 1', () => {
  const filter = parseInvoiceFilter({ archived: 'true' })

  assert.equal(filter.showArchived, false)
  assert.equal(parseInvoiceFilter({ archived: '0' }).showArchived, false)
})

test('a leftover ?automatic=1 from an old link is ignored', () => {
  assert.deepEqual(parseInvoiceFilter({ automatic: '1' }), DEFAULT)
})

test('the default filter serializes to no params', () => {
  assert.equal(invoiceFilterToSearchParams(DEFAULT).toString(), '')
})

test('a filter round-trips through the URL', () => {
  const filter: InvoiceFilter = { query: 'a&b', status: 'paid', clientId: 'c1', showArchived: true }
  const params = invoiceFilterToSearchParams(filter)

  assert.deepEqual(parseInvoiceFilter(Object.fromEntries(params)), filter)
})

test('only non-default values reach the URL', () => {
  const params = invoiceFilterToSearchParams({ ...DEFAULT, status: 'void' })

  assert.equal(params.toString(), 'status=void')
})

test('a filter is active when anything differs from the default', () => {
  assert.equal(isInvoiceFilterActive(DEFAULT), false)
  assert.equal(isInvoiceFilterActive({ ...DEFAULT, showArchived: true }), true)
  assert.equal(isInvoiceFilterActive({ ...DEFAULT, query: 'x' }), true)
})

function row(id: string, clientId: string, name: string): InvoiceViewRow {
  return {
    id,
    client_id: clientId,
    status: 'draft',
    effective_status: 'draft',
    invoice_number: null,
    issued_date: null,
    due_date: null,
    total_cents: 500,
    is_archived: false,
    is_automatic: true,
    has_unpriced: false,
    clients: { name },
  }
}

test('client options are unique and sorted A to Z', () => {
  const options = invoiceClientOptions([row('1', 'c2', 'Zed'), row('2', 'c1', 'Ann'), row('3', 'c2', 'Zed')])

  assert.deepEqual(options, [
    { id: 'c1', name: 'Ann' },
    { id: 'c2', name: 'Zed' },
  ])
})

test('a ledger row carries the client name and drops the contact details', () => {
  const ledgerRow = toLedgerListRow({ ...row('1', 'c1', 'Ann'), clients: { name: 'Ann' } })

  assert.equal(ledgerRow.client_name, 'Ann')
  assert.equal('clients' in ledgerRow, false)
})
