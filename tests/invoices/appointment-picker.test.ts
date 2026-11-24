import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  groupByMonth,
  isUpcomingOpenInitially,
  parsePick,
  selectionSummary,
  splitClaimable,
  tickState,
  type PickerAppointment,
} from '../../src/lib/invoices/appointment-picker.ts'

function appt(id: string, date: string, priceCents: number | null, extra: Partial<PickerAppointment> = {}): PickerAppointment {
  return {
    id,
    scheduled_date: date,
    scheduled_start_time: '09:00:00',
    job_name: 'Standard clean',
    location_label: 'Queen St W clinic',
    price_cents: priceCents,
    ...extra,
  }
}

test('groupByMonth returns months in date order with a label, count and total', () => {
  const months = groupByMonth([
    appt('c', '2026-04-02', 5000),
    appt('a', '2026-03-20', 18000),
    appt('b', '2026-03-05', 9000),
  ])

  assert.deepEqual(
    months.map((month) => [month.label, month.count, month.totalCents, month.rows.map((row) => row.id)]),
    [
      ['March 2026', 2, 27000, ['b', 'a']],
      ['April 2026', 1, 5000, ['c']],
    ]
  )
})

test('groupByMonth counts an Unpriced appointment as $0 in the total', () => {
  const [month] = groupByMonth([appt('a', '2026-03-05', null), appt('b', '2026-03-06', 7000)])

  assert.equal(month.count, 2)
  assert.equal(month.totalCents, 7000)
})

test('groupByMonth separates the same month of different years and orders same-day rows by start time', () => {
  const months = groupByMonth([
    appt('late', '2027-03-01', 100),
    appt('b', '2026-03-01', 100, { scheduled_start_time: '13:00:00' }),
    appt('a', '2026-03-01', 100, { scheduled_start_time: '08:00:00' }),
  ])

  assert.deepEqual(months.map((month) => month.label), ['March 2026', 'March 2027'])
  assert.deepEqual(months[0].rows.map((row) => row.id), ['a', 'b'])
})

test('groupByMonth of nothing is no months', () => {
  assert.deepEqual(groupByMonth([]), [])
})

test('tickState is all, some or none of the ids selected', () => {
  const selected = new Set(['a', 'b'])

  assert.equal(tickState(['a', 'b'], selected), 'all')
  assert.equal(tickState(['a', 'c'], selected), 'some')
  assert.equal(tickState(['c', 'd'], selected), 'none')
  assert.equal(tickState([], selected), 'none')
})

test('selectionSummary counts and totals only the selected appointments, Unpriced as $0', () => {
  const all = [appt('a', '2026-03-05', 18000), appt('b', '2026-03-06', null), appt('c', '2026-03-07', 500)]

  assert.deepEqual(selectionSummary(new Set(['a', 'b']), all), { count: 2, totalCents: 18000 })
  assert.deepEqual(selectionSummary(new Set(['gone']), all), { count: 0, totalCents: 0 })
})

test('parsePick splits the param and drops ids that are not in the picker', () => {
  assert.deepEqual(parsePick('a,b,zzz', ['a', 'b', 'c']), ['a', 'b'])
  assert.deepEqual(parsePick('a, a,,b', ['a', 'b']), ['a', 'b'])
  assert.deepEqual(parsePick(null, ['a']), [])
  assert.deepEqual(parsePick('', ['a']), [])
  assert.deepEqual(parsePick(undefined, ['a']), [])
})

test('isUpcomingOpenInitially is true only when a picked id is Upcoming', () => {
  const upcoming = [appt('u1', '2026-12-01', 100)]

  assert.equal(isUpcomingOpenInitially(['u1'], upcoming), true)
  assert.equal(isUpcomingOpenInitially(['x', 'u1'], upcoming), true)
  assert.equal(isUpcomingOpenInitially(['x'], upcoming), false)
  assert.equal(isUpcomingOpenInitially([], upcoming), false)
})

test('splitClaimable puts completed visits in Unbilled and every other status in Upcoming, whatever the date', () => {
  const visit = (id: string, status: string, date: string, cents: number | null) => ({
    id,
    status,
    scheduled_date: date,
    scheduled_start_time: '09:00:00',
    job_name: 'Clean',
    location_label: null,
    live: cents === null ? { source: 'unpriced' } : { source: 'calculated', amount_cents: cents },
  })

  const { unbilled, upcoming } = splitClaimable([
    visit('done', 'completed', '2026-01-05', 100),
    visit('past-open', 'scheduled', '2026-01-06', null),
    visit('running', 'in_progress', '2026-01-07', 300),
    visit('future', 'scheduled', '2027-01-01', 400),
  ] as never)

  assert.deepEqual(unbilled.map((row) => [row.id, row.price_cents]), [['done', 100]])
  assert.deepEqual(upcoming.map((row) => [row.id, row.price_cents]), [['past-open', null], ['running', 300], ['future', 400]])
})
