import assert from 'node:assert/strict'
import { test } from 'node:test'

import { allowedActions } from '../../src/lib/invoices/transitions.ts'

test('a draft can be edited, issued or archived', () => {
  assert.deepEqual(allowedActions({ status: 'draft', is_archived: false }), new Set(['edit', 'issue', 'archive']))
})

test('an issued invoice can take a payment or be voided, never archived', () => {
  assert.deepEqual(allowedActions({ status: 'issued', is_archived: false }), new Set(['recordPayment', 'void']))
})

test('a paid invoice can have its payment edited or undone, be voided or archived', () => {
  assert.deepEqual(
    allowedActions({ status: 'paid', is_archived: false }),
    new Set(['editPayment', 'undoPayment', 'void', 'archive'])
  )
})

test('a void invoice can only be archived', () => {
  assert.deepEqual(allowedActions({ status: 'void', is_archived: false }), new Set(['archive']))
})

test('an archived invoice of any status can only be unarchived', () => {
  for (const status of ['draft', 'issued', 'paid', 'void'] as const) {
    assert.deepEqual(allowedActions({ status, is_archived: true }), new Set(['unarchive']), status)
  }
})
