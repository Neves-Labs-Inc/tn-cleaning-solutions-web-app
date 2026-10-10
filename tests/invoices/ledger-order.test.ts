import assert from 'node:assert/strict'
import { test } from 'node:test'

import { sortByActivity } from '../../src/lib/invoices/view.ts'

test('a draft issued today rises above an invoice created yesterday', () => {
  const rows = [
    { id: 'yesterday', issued_date: null, created_at: '2026-10-08T15:00:00Z' },
    { id: 'issued-today', issued_date: '2026-10-09', created_at: '2026-09-01T15:00:00Z' },
  ]

  assert.deepEqual(
    sortByActivity(rows).map((row) => row.id),
    ['issued-today', 'yesterday']
  )
})

test('on the same activity date the newer-created invoice comes first', () => {
  const rows = [
    { id: 'morning', issued_date: '2026-10-09', created_at: '2026-10-09T13:00:00Z' },
    { id: 'evening', issued_date: null, created_at: '2026-10-09T22:00:00Z' },
  ]

  assert.deepEqual(
    sortByActivity(rows).map((row) => row.id),
    ['evening', 'morning']
  )
})

test('within the same second, the invoice created later comes first', () => {
  // Postgres drops a zero fraction, so the two stamps differ in shape as well as value.
  const rows = [
    { id: 'whole-second', issued_date: null, created_at: '2026-10-09T15:00:32+00:00' },
    { id: 'half-second-later', issued_date: null, created_at: '2026-10-09T15:00:32.5+00:00' },
  ]

  assert.deepEqual(
    sortByActivity(rows).map((row) => row.id),
    ['half-second-later', 'whole-second']
  )
})

test('an invoice with no created time sorts after every dated one', () => {
  const rows = [
    { id: 'undated', issued_date: null, created_at: null },
    { id: 'dated', issued_date: null, created_at: '2026-01-01T15:00:00Z' },
  ]

  assert.deepEqual(
    sortByActivity(rows).map((row) => row.id),
    ['dated', 'undated']
  )
})

test("a draft's activity date is its Eastern created date", () => {
  // 02:00 UTC on Oct 10 is still Oct 9 in Toronto, so the invoice issued Oct 10 leads.
  const rows = [
    { id: 'late-night-draft', issued_date: null, created_at: '2026-10-10T02:00:00Z' },
    { id: 'issued-oct-10', issued_date: '2026-10-10', created_at: '2026-10-01T15:00:00Z' },
  ]

  assert.deepEqual(
    sortByActivity(rows).map((row) => row.id),
    ['issued-oct-10', 'late-night-draft']
  )
})
