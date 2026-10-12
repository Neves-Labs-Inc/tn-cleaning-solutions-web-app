import assert from 'node:assert/strict'
import { test } from 'node:test'

import { estimateAppointmentTotal } from '../../src/lib/pricing/estimate.ts'
import type { ClientJobRule } from '../../src/lib/pricing/resolve.ts'

type EstimateInput = Parameters<typeof estimateAppointmentTotal>[0]

function rule(effectiveFrom: string, hourlyRateCents: number): ClientJobRule {
  return { hourly_rate_cents: hourlyRateCents, effective_from: effectiveFrom, is_archived: false }
}

function estimate(overrides: Partial<EstimateInput> = {}) {
  return estimateAppointmentTotal({
    jobRateCents: 4500,
    clientRules: [],
    date: '2026-10-12',
    startTime: '09:00',
    endTime: '12:00',
    cleaners: 1,
    overrideCents: null,
    ...overrides,
  })
}

function calculated(overrides: Partial<EstimateInput>) {
  const result = estimate(overrides)
  if (result.kind !== 'calculated') throw new Error('expected a calculated estimate')
  return result
}

test('uses the Job rate when the client has no rule for the Job', () => {
  assert.deepEqual(estimate(), {
    kind: 'calculated',
    rateCents: 4500,
    minutes: 180,
    cleaners: 1,
    amountCents: 13500,
    rateSource: 'job',
    overrideCents: null,
  })
})

test("uses the client's rule in effect on the date and ignores a future-dated one", () => {
  const result = calculated({
    clientRules: [rule('2026-01-01', 3800), rule('2026-11-01', 6000)],
  })

  assert.equal(result.rateCents, 3800)
  assert.equal(result.amountCents, 11400)
  assert.equal(result.rateSource, 'client_job_pricing')
})

test('bills a visit with no cleaners selected as one cleaner', () => {
  const result = calculated({ cleaners: 0 })

  assert.equal(result.cleaners, 1)
  assert.equal(result.amountCents, 13500)
})

test('multiplies the hourly amount by the number of cleaners', () => {
  const result = calculated({ cleaners: 3 })

  assert.equal(result.cleaners, 3)
  assert.equal(result.amountCents, 40500)
})

test('is incomplete until a Job is picked', () => {
  assert.deepEqual(estimate({ jobRateCents: null }), { kind: 'incomplete' })
})

test('is incomplete while a time is missing', () => {
  assert.deepEqual(estimate({ startTime: null }), { kind: 'incomplete' })
  assert.deepEqual(estimate({ endTime: '' }), { kind: 'incomplete' })
})

test('is incomplete unless the end time is after the start time', () => {
  assert.deepEqual(estimate({ endTime: '09:00' }), { kind: 'incomplete' })
  assert.deepEqual(estimate({ endTime: '08:30' }), { kind: 'incomplete' })
})

test('passes an override through without changing the calculated amount', () => {
  const result = calculated({ cleaners: 2, overrideCents: 12000 })

  assert.equal(result.overrideCents, 12000)
  assert.equal(result.amountCents, 27000)
})

test('rounds fractional hours per cleaner before multiplying, like the saved price', () => {
  // $33.34/h × 1h 40m = 5556.67 → 5557 cents per cleaner, so 2 cleaners bill 11114 (not 11113).
  const result = calculated({ jobRateCents: 3334, endTime: '10:40', cleaners: 2 })

  assert.equal(result.minutes, 100)
  assert.equal(result.amountCents, 11114)
})
