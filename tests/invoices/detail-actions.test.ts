import assert from 'node:assert/strict'
import { test } from 'node:test'

import { actionLayout } from '../../src/lib/invoices/detail-actions.ts'
import { allowedActions } from '../../src/lib/invoices/transitions.ts'

test('a draft puts Issue in the bar and Archive behind More', () => {
  const layout = actionLayout(allowedActions({ status: 'draft', is_archived: false }))

  assert.equal(layout.primary, 'issue')
  assert.deepEqual(layout.more, ['archive'])
  assert.deepEqual(layout.desktop, ['archive', 'issue'])
})

test('an issued invoice puts Record payment in the bar and Void behind More', () => {
  const layout = actionLayout(allowedActions({ status: 'issued', is_archived: false }))

  assert.equal(layout.primary, 'recordPayment')
  assert.deepEqual(layout.more, ['void'])
  assert.deepEqual(layout.desktop, ['void', 'recordPayment'])
})

test('a paid invoice puts Edit payment in the bar and the rest behind More', () => {
  const layout = actionLayout(allowedActions({ status: 'paid', is_archived: false }))

  assert.equal(layout.primary, 'editPayment')
  assert.deepEqual(layout.more, ['undoPayment', 'void', 'archive'])
  assert.deepEqual(layout.desktop, ['void', 'undoPayment', 'archive', 'editPayment'])
})

test('a void invoice has only Archive, with no More menu', () => {
  const layout = actionLayout(allowedActions({ status: 'void', is_archived: false }))

  assert.equal(layout.primary, 'archive')
  assert.deepEqual(layout.more, [])
  assert.deepEqual(layout.desktop, ['archive'])
})

test('an archived invoice has only Unarchive', () => {
  for (const status of ['draft', 'issued', 'paid', 'void'] as const) {
    const layout = actionLayout(allowedActions({ status, is_archived: true }))

    assert.equal(layout.primary, 'unarchive', status)
    assert.deepEqual(layout.more, [], status)
    assert.deepEqual(layout.desktop, ['unarchive'], status)
  }
})
