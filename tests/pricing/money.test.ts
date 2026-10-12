import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  AMOUNT_TOO_LARGE_MESSAGE,
  durationMinutes,
  formatCents,
  formatRate,
  hourlyAmountCents,
  MAX_AMOUNT_CENTS,
  parseDollarsToCents,
} from '../../src/lib/pricing/money.ts'

test('parseDollarsToCents converts plain decimal amounts to cents', () => {
  assert.deepEqual(parseDollarsToCents('0'), { cents: 0 })
  assert.deepEqual(parseDollarsToCents('12'), { cents: 1200 })
  assert.deepEqual(parseDollarsToCents('12.5'), { cents: 1250 })
  assert.deepEqual(parseDollarsToCents('12.'), { cents: 1200 })
  assert.deepEqual(parseDollarsToCents('.5'), { cents: 50 })
  assert.deepEqual(parseDollarsToCents(' 45 '), { cents: 4500 })
  assert.deepEqual(parseDollarsToCents('12.345'), { cents: 1235 })
})

test('parseDollarsToCents accepts amounts up to $1,000,000.00 after rounding', () => {
  assert.deepEqual(parseDollarsToCents('1000000'), { cents: 100000000 })
  assert.deepEqual(parseDollarsToCents('1000000.004'), { cents: 100000000 })
  assert.equal(MAX_AMOUNT_CENTS, 100000000)
  assert.equal(AMOUNT_TOO_LARGE_MESSAGE, 'Enter an amount up to $1,000,000.00.')
})

test('parseDollarsToCents refuses amounts over $1,000,000.00 as too large', () => {
  assert.deepEqual(parseDollarsToCents('1000000.01'), { error: 'too_large' })
  assert.deepEqual(parseDollarsToCents('1000000.005'), { error: 'too_large' })
  assert.deepEqual(parseDollarsToCents('99999999'), { error: 'too_large' })
})

test('parseDollarsToCents refuses empty, signed, formatted and non-decimal input as invalid', () => {
  for (const raw of ['', '   ', '.', '-1', '+5', 'abc', 'Infinity', 'NaN', '1e3', '0x10', '12,50', '$5']) {
    assert.deepEqual(parseDollarsToCents(raw), { error: 'invalid' }, `input ${JSON.stringify(raw)}`)
  }
})

test('parseDollarsToCents rejects a long non-decimal input as invalid', () => {
  const hostile = '1'.repeat(100_000) + 'x'

  assert.deepEqual(parseDollarsToCents(hostile), { error: 'invalid' })
})

test('formatCents renders whole dollars, cents and thousands separators', () => {
  assert.equal(formatCents(4500), '$45.00')
  assert.equal(formatCents(0), '$0.00')
  assert.equal(formatCents(1), '$0.01')
  assert.equal(formatCents(100001), '$1,000.01')
  assert.equal(formatCents(123456), '$1,234.56')
})

test('formatRate suffixes the hourly unit', () => {
  assert.equal(formatRate(4500), '$45.00/h')
  assert.equal(formatRate(0), '$0.00/h')
})

test('durationMinutes accepts both HH:MM and HH:MM:SS and ignores seconds', () => {
  assert.equal(durationMinutes('09:00', '11:30'), 150)
  assert.equal(durationMinutes('09:00:00', '11:30:00'), 150)
  assert.equal(durationMinutes('09:00:45', '11:30:15'), 150)
  assert.equal(durationMinutes('23:00', '23:45'), 45)
  assert.equal(durationMinutes('08:15', '08:16'), 1)
})

test('hourlyAmountCents rounds half up, exactly once', () => {
  assert.equal(hourlyAmountCents(4500, 150), 11250)
  assert.equal(hourlyAmountCents(3333, 50), 2778)
  assert.equal(hourlyAmountCents(4500, 0), 0)
  assert.equal(hourlyAmountCents(999999, 9999), Math.round((999999 * 9999) / 60))
  assert.equal(hourlyAmountCents(999999, 9999), 166649833)
})

test('hourlyAmountCents rounds the half-cent boundaries up', () => {
  assert.equal(hourlyAmountCents(1, 1), 0)
  assert.equal(hourlyAmountCents(1, 30), 1)
  assert.equal(hourlyAmountCents(1, 90), 2)
  assert.equal(hourlyAmountCents(4500, 1), 75)
})

test('an invoice total is the sum of already-rounded lines, never a rounded sum', () => {
  const lineCents = hourlyAmountCents(6667, 30)
  const total = lineCents * 3

  assert.equal(lineCents, 3334)
  assert.equal(total, 10002)
  assert.notEqual(total, Math.round((6667 * 30 * 3) / 60))
})
