import assert from 'node:assert/strict'
import { test } from 'node:test'

import { invoiceFlagBadges } from '../../src/components/ui/status-badge-tones.ts'

const BASE = { effective_status: 'draft', is_automatic: false, is_archived: false } as const

test('a plain invoice shows only its status', () => {
  assert.deepEqual(invoiceFlagBadges(BASE), [{ tone: 'neutral', label: 'Draft' }])
})

test('flags follow the status in a fixed order', () => {
  const badges = invoiceFlagBadges({ ...BASE, is_automatic: true, is_archived: true, has_unpriced: true })

  assert.deepEqual(
    badges.map((badge) => badge.label),
    ['Draft', 'Automatic', 'Archived', 'Unpriced'],
  )
})

test('an old Automatic invoice keeps its Automatic badge', () => {
  for (const status of ['issued', 'paid', 'void'] as const) {
    const badges = invoiceFlagBadges({ ...BASE, effective_status: status, is_automatic: true })

    assert.deepEqual(
      badges.map((badge) => badge.label),
      [badges[0].label, 'Automatic'],
    )
  }
})

test('Automatic and Archived are neutral and Unpriced is a warning', () => {
  const badges = invoiceFlagBadges({ ...BASE, is_automatic: true, is_archived: true, has_unpriced: true })

  assert.deepEqual(
    badges.map((badge) => badge.tone),
    ['neutral', 'neutral', 'neutral', 'warning'],
  )
})

test('the status pill follows the effective status', () => {
  const [status] = invoiceFlagBadges({ ...BASE, effective_status: 'overdue' })

  assert.deepEqual(status, { tone: 'warning', label: 'Overdue' })
})
