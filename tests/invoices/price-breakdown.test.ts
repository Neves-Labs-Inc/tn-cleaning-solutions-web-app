import assert from 'node:assert/strict'
import { test } from 'node:test'

import { formatPriceBreakdown, type BreakdownLine } from '../../src/lib/invoices/price-breakdown.ts'
import { hourlyAmountCents } from '../../src/lib/pricing/money.ts'
import type { LivePrice } from '../../src/lib/pricing/index.ts'

function hourly(overrides: Partial<Extract<LivePrice, { amount_cents: number }>> = {}): LivePrice {
  return { source: 'client_job_pricing', amount_cents: 27000, rate_cents: 4500, minutes: 180, headcount: 2, ...overrides }
}

function line(overrides: Partial<BreakdownLine> = {}): BreakdownLine {
  return {
    cancelled_at: null,
    is_released: false,
    billed_rate_cents: null,
    billed_minutes: null,
    visit: { live: hourly() },
    ...overrides,
  }
}

test('a draft client-rate line shows rate, hours, cleaners and the source', () => {
  assert.equal(formatPriceBreakdown(line(), 'draft'), '$45.00/h × 3h × 2 cleaners · Client rate')
})

test('a draft job-rate line is labelled Job rate', () => {
  const live = hourly({ source: 'job' })
  assert.equal(formatPriceBreakdown(line({ visit: { live } }), 'draft'), '$45.00/h × 3h × 2 cleaners · Job rate')
})

test('one cleaner is singular and fractional hours keep up to two decimals', () => {
  const live = hourly({ minutes: 150, headcount: 1 })
  assert.equal(formatPriceBreakdown(line({ visit: { live } }), 'draft'), '$45.00/h × 2.5h × 1 cleaner · Client rate')
  const quarter = hourly({ minutes: 105, headcount: 1 })
  assert.equal(formatPriceBreakdown(line({ visit: { live: quarter } }), 'draft'), '$45.00/h × 1.75h × 1 cleaner · Client rate')
})

test('a draft appointment override shows a flat price with no cleaners', () => {
  const live = hourly({ source: 'appointment_override', rate_cents: null, minutes: null, headcount: 3 })
  assert.equal(formatPriceBreakdown(line({ visit: { live } }), 'draft'), 'Flat price (override)')
})

test('a draft unpriced line shows nothing', () => {
  assert.equal(formatPriceBreakdown(line({ visit: { live: { source: 'unpriced' } } }), 'draft'), null)
})

test('a draft cancelled or released line shows nothing', () => {
  assert.equal(formatPriceBreakdown(line({ cancelled_at: '2026-10-01T00:00:00Z' }), 'draft'), null)
  assert.equal(formatPriceBreakdown(line({ is_released: true }), 'draft'), null)
})

test('an issued line shows its billed rate and hours without a crew', () => {
  const issued = line({ billed_rate_cents: 4500, billed_minutes: 180 })
  assert.equal(formatPriceBreakdown(issued, 'issued'), '$45.00/h × 3h')
  assert.equal(formatPriceBreakdown(issued, 'paid'), '$45.00/h × 3h')
  assert.equal(formatPriceBreakdown(issued, 'void'), '$45.00/h × 3h')
})

test('an issued line without a billed rate shows nothing', () => {
  assert.equal(formatPriceBreakdown(line({ billed_minutes: 180 }), 'issued'), null)
  assert.equal(formatPriceBreakdown(line({ billed_rate_cents: 4500 }), 'issued'), null)
})

test('an issued cancelled or released line shows nothing', () => {
  const billed = { billed_rate_cents: 4500, billed_minutes: 180 }
  assert.equal(formatPriceBreakdown(line({ ...billed, cancelled_at: '2026-10-01T00:00:00Z' }), 'issued'), null)
  assert.equal(formatPriceBreakdown(line({ ...billed, is_released: true }), 'void'), null)
})

test('a zero-minute hourly line shows nothing rather than 0h', () => {
  const live = hourly({ minutes: 0 })
  assert.equal(formatPriceBreakdown(line({ visit: { live } }), 'draft'), null)
})

test('hours that are not exact at two decimals read as hours and minutes', () => {
  const at = (minutes: number) => formatPriceBreakdown(line({ visit: { live: hourly({ minutes }) } }), 'draft')
  assert.equal(at(100), '$45.00/h × 1h 40m × 2 cleaners · Client rate')
  assert.equal(at(40), '$45.00/h × 40m × 2 cleaners · Client rate')
  const issued = line({ billed_rate_cents: 4500, billed_minutes: 100 })
  assert.equal(formatPriceBreakdown(issued, 'issued'), '$45.00/h × 1h 40m')
})

// One cleaner's cents from the caption's hours exactly as shown (no rounding back to whole minutes), so a
// caption that rounds hours would not multiply out to the amount.
function shownCleanerCents(rateCents: number, caption: string): number {
  const hours = caption.split(' × ')[1]
  const decimal = /^(\d+(?:\.\d+)?)h$/.exec(hours)
  if (decimal) return Math.round((rateCents * Math.round(Number(decimal[1]) * 100)) / 100)

  const wholeHours = Number(/(\d+)h/.exec(hours)?.[1] ?? 0)
  const minutes = Number(/(\d+)m/.exec(hours)?.[1] ?? 0)
  return hourlyAmountCents(rateCents, wholeHours * 60 + minutes)
}

test('the caption multiplies out to the line amount', () => {
  for (const rate of [1500, 4500, 4999, 12500]) {
    for (let minutes = 1; minutes <= 240; minutes++) {
      for (const headcount of [1, 2, 3, 12]) {
        const amount = hourlyAmountCents(rate, minutes) * headcount
        const live = hourly({ rate_cents: rate, minutes, headcount, amount_cents: amount })
        const caption = formatPriceBreakdown(line({ visit: { live } }), 'draft') ?? ''
        assert.equal(shownCleanerCents(rate, caption) * headcount, amount, caption)
      }
    }
  }
})
