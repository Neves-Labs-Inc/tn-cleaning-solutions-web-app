import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  draftTotalCents,
  hasUnpricedLine,
  lineAmountCents,
  lineState,
  type LineFacts,
  type VisitFacts,
} from '../../src/lib/invoices/lines.ts'
import type { LivePrice } from '../../src/lib/pricing/index.ts'

const DRAFT = { status: 'draft' } as const
const ISSUED = { status: 'issued' } as const

function priced(amountCents: number): LivePrice {
  return { source: 'job', amount_cents: amountCents, rate_cents: 4500, minutes: 120, headcount: 1 }
}

const UNPRICED: LivePrice = { source: 'unpriced' }

function line(overrides: Partial<LineFacts> = {}): LineFacts {
  return { billed_amount_cents: null, cancelled_at: null, ...overrides }
}

function visit(overrides: Partial<VisitFacts> = {}): VisitFacts {
  return { status: 'completed', live: priced(9000), ...overrides }
}

test('a completed, priced visit on a draft is ok and charges its Live price', () => {
  assert.equal(lineState(line(), visit(), DRAFT), 'ok')
  assert.equal(lineAmountCents(line(), visit(), DRAFT), 9000)
})

test('an issued line charges its Billed amount, not the Live price', () => {
  const issued = line({ billed_amount_cents: 7500 })

  assert.equal(lineState(issued, visit(), ISSUED), 'ok')
  assert.equal(lineAmountCents(issued, visit(), ISSUED), 7500)
})

test('a cancelled line is Cancelled and charges nothing', () => {
  const cancelled = line({ billed_amount_cents: 7500, cancelled_at: '2026-10-05T12:00:00Z' })
  const cancelledVisit = visit({ status: 'cancelled' })

  assert.equal(lineState(cancelled, cancelledVisit, ISSUED), 'cancelled')
  assert.equal(lineAmountCents(cancelled, cancelledVisit, ISSUED), 0)
})

test('a visit not completed yet is an Upcoming line that still charges', () => {
  const scheduled = visit({ status: 'scheduled' })

  assert.equal(lineState(line(), scheduled, DRAFT), 'upcoming')
  assert.equal(lineState(line(), visit({ status: 'in_progress' }), DRAFT), 'upcoming')
  assert.equal(lineAmountCents(line(), scheduled, DRAFT), 9000)
  assert.equal(lineState(line({ billed_amount_cents: 9000 }), scheduled, ISSUED), 'upcoming')
})

test('an Unpriced visit on a draft is Unpriced and counts as $0', () => {
  const unpriced = visit({ live: UNPRICED })

  assert.equal(lineState(line(), unpriced, DRAFT), 'unpriced')
  assert.equal(lineState(line(), visit({ status: 'scheduled', live: UNPRICED }), DRAFT), 'unpriced')
  assert.equal(lineAmountCents(line(), unpriced, DRAFT), 0)
})

test('once issued, a line keeps its Billed amount even if the visit is now Unpriced', () => {
  const issued = line({ billed_amount_cents: 7500 })
  const unpriced = visit({ live: UNPRICED })

  assert.equal(lineState(issued, unpriced, ISSUED), 'ok')
  assert.equal(lineAmountCents(issued, unpriced, ISSUED), 7500)
})

test("a draft's total sums its lines at Live price, Unpriced at $0", () => {
  const entries = [
    { line: line(), visit: visit({ live: priced(9000) }) },
    { line: line(), visit: visit({ status: 'scheduled', live: priced(4500) }) },
    { line: line(), visit: visit({ live: UNPRICED }) },
  ]

  assert.equal(draftTotalCents(entries), 13500)
  assert.equal(draftTotalCents([]), 0)
})

test('a draft has an Unpriced line only when one of its visits is Unpriced', () => {
  assert.equal(hasUnpricedLine([{ line: line(), visit: visit() }]), false)
  assert.equal(
    hasUnpricedLine([
      { line: line(), visit: visit() },
      { line: line(), visit: visit({ live: UNPRICED }) },
    ]),
    true
  )
})
