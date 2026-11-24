import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  draftChoiceSubline,
  draftChoiceTitle,
  groupClientInvoices,
  invoiceSubtitle,
  invoiceTitle,
  type ClientInvoice,
} from '../../src/lib/invoices/client-invoices.ts'

const TODAY = '2026-11-23'

function invoice(overrides: Partial<ClientInvoice> & { id: string }): ClientInvoice {
  return {
    status: 'issued',
    invoice_number: null,
    created_at: '2026-11-01T15:00:00Z',
    issued_date: null,
    due_date: null,
    paid_date: null,
    payment_method: null,
    total_cents: 0,
    is_archived: false,
    is_automatic: false,
    is_mark_paid: false,
    line_count: null,
    ...overrides,
  }
}

const ids = (rows: Array<{ id: string }>) => rows.map((row) => row.id)

test('Owed lists overdue first, then by due date, with no due date last', () => {
  const grouped = groupClientInvoices(
    [
      invoice({ id: 'later', due_date: '2026-12-20' }),
      invoice({ id: 'none' }),
      invoice({ id: 'late-new', due_date: '2026-11-20' }),
      invoice({ id: 'soon', due_date: '2026-11-30' }),
      invoice({ id: 'late-old', due_date: '2026-11-02' }),
    ],
    TODAY,
    false
  )

  assert.deepEqual(ids(grouped.owed), ['late-old', 'late-new', 'soon', 'later', 'none'])
  assert.equal(grouped.owed[0].effective_status, 'overdue')
  assert.equal(grouped.owed[2].effective_status, 'issued')
})

test('Drafts holds only open drafts, newest first', () => {
  const grouped = groupClientInvoices(
    [
      invoice({ id: 'old', status: 'draft', created_at: '2026-11-01T15:00:00Z' }),
      invoice({ id: 'new', status: 'draft', created_at: '2026-11-20T15:00:00Z' }),
      invoice({ id: 'gone', status: 'draft', is_archived: true }),
    ],
    TODAY,
    true
  )

  assert.deepEqual(ids(grouped.drafts), ['new', 'old'])
})

test('History is paid and void, newest activity first', () => {
  const grouped = groupClientInvoices(
    [
      invoice({ id: 'paid-oct', status: 'paid', issued_date: '2026-10-01', paid_date: '2026-10-09' }),
      invoice({ id: 'void-nov', status: 'void', issued_date: '2026-11-02' }),
      invoice({ id: 'paid-nov', status: 'paid', issued_date: '2026-09-01', paid_date: '2026-11-10' }),
    ],
    TODAY,
    false
  )

  assert.deepEqual(ids(grouped.history), ['paid-nov', 'void-nov', 'paid-oct'])
})

test('Show archived adds archived drafts, paid and void to History, and off hides them again', () => {
  const invoices = [
    invoice({ id: 'paid', status: 'paid', paid_date: '2026-11-10' }),
    invoice({ id: 'paid-archived', status: 'paid', paid_date: '2026-11-09', is_archived: true }),
    invoice({ id: 'void-archived', status: 'void', issued_date: '2026-11-08', is_archived: true }),
    invoice({ id: 'draft-archived', status: 'draft', is_archived: true, created_at: '2026-11-07T15:00:00Z' }),
  ]

  assert.deepEqual(ids(groupClientInvoices(invoices, TODAY, false).history), ['paid'])
  assert.deepEqual(ids(groupClientInvoices(invoices, TODAY, true).history), [
    'paid',
    'paid-archived',
    'void-archived',
    'draft-archived',
  ])
})

test('titles and date lines read as the Billing tab shows them', () => {
  assert.equal(invoiceTitle(invoice({ id: 'a', invoice_number: 'INV-1' })), 'INV-1')
  assert.equal(invoiceTitle(invoice({ id: 'a', status: 'draft' })), 'Draft')
  assert.equal(invoiceTitle(invoice({ id: 'a', is_automatic: true })), 'Automatic draft')

  const draft = invoice({ id: 'd', status: 'draft', created_at: '2026-11-20T15:00:00Z', line_count: 2 })
  assert.equal(invoiceSubtitle(draft), 'Created Nov 20 · 2 lines')
  assert.equal(invoiceSubtitle({ ...draft, line_count: 1 }), 'Created Nov 20 · 1 line')
  assert.equal(invoiceSubtitle(invoice({ id: 'i', due_date: '2026-12-03' })), 'Due Dec 3')
  assert.equal(invoiceSubtitle(invoice({ id: 'i' })), 'No due date')
  assert.equal(
    invoiceSubtitle(invoice({ id: 'p', status: 'paid', paid_date: '2026-11-02', payment_method: 'Cash' })),
    'Paid Nov 2 · Cash'
  )
  assert.equal(
    invoiceSubtitle(invoice({ id: 'p', status: 'paid', paid_date: '2026-11-02', is_mark_paid: true })),
    'Marked paid Nov 2'
  )
  assert.equal(invoiceSubtitle(invoice({ id: 'v', status: 'void', issued_date: '2026-11-02' })), 'Voided · issued Nov 2')
})

test('the add-or-new dialog names a draft by its creation date, count and total', () => {
  const draft = invoice({
    id: 'd',
    status: 'draft',
    created_at: '2026-11-20T15:00:00Z',
    line_count: 3,
    total_cents: 54000,
  })

  assert.equal(draftChoiceTitle(draft), 'Draft created Nov 20')
  assert.equal(draftChoiceSubline(draft, (cents) => `$${(cents / 100).toFixed(2)}`), '3 appointments · $540.00')
})
