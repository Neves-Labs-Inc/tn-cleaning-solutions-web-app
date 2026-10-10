import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  durationMinutes,
  formatCents,
  formatRate,
  hourlyAmountCents,
  parseDollarsToCents,
} from '../../src/lib/pricing/money.ts'

test('parseDollarsToCents converts well-formed dollar strings', () => {
  assert.equal(parseDollarsToCents('0'), 0)
  assert.equal(parseDollarsToCents('12'), 1200)
  assert.equal(parseDollarsToCents('12.5'), 1250)
  assert.equal(parseDollarsToCents('12.345'), 1235)
  assert.equal(parseDollarsToCents('1e3'), 100000)
  assert.equal(parseDollarsToCents(' 45 '), 4500)
})

test('parseDollarsToCents returns null for absent, negative and unparseable input', () => {
  assert.equal(parseDollarsToCents(''), null)
  assert.equal(parseDollarsToCents('   '), null)
  assert.equal(parseDollarsToCents('-1'), null)
  assert.equal(parseDollarsToCents('abc'), null)
  assert.equal(parseDollarsToCents('Infinity'), null)
  assert.equal(parseDollarsToCents('12,50'), null)
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
