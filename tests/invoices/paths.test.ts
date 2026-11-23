import assert from 'node:assert/strict'
import { test } from 'node:test'

import { clientBillingHref, invoiceHref, RECEIVABLES_PATH } from '../../src/lib/invoices/paths.ts'

test('invoiceHref nests the invoice under its client', () => {
  assert.equal(invoiceHref('c1', 'i1'), '/solutions/clients/c1/invoices/i1')
})

test('clientBillingHref opens the Billing tab', () => {
  assert.equal(clientBillingHref('c1'), '/solutions/clients/c1?tab=billing')
})

test('clientBillingHref carries picked appointment ids', () => {
  assert.equal(clientBillingHref('c1', ['a1', 'a2']), '/solutions/clients/c1?tab=billing&pick=a1,a2')
})

test('clientBillingHref leaves pick off when no ids are given', () => {
  assert.equal(clientBillingHref('c1', []), '/solutions/clients/c1?tab=billing')
})

test('Receivables lives at its own top-level path', () => {
  assert.equal(RECEIVABLES_PATH, '/solutions/receivables')
})
