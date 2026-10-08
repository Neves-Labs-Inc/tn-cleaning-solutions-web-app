import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildMapsUrl,
  buildStop,
  getBusinessDate,
  formatBusinessTime,
  toBusinessWallClock,
  calculateDuration,
  formatDuration,
  formatTimeRange,
  getClockStatus,
  groupAppointmentsByDay,
  resolveTimeSheetMonth,
  summarizeSessions,
} from '../../src/lib/schedule/index.ts'

const NOW = new Date(2026, 9, 14, 12, 0, 0) // Wed 14 Oct 2026, local

function row(id: string, date: string, time: string) {
  return { id, scheduled_date: date, scheduled_start_time: time }
}

test('getClockStatus: clocked_out wins over clocked_in, none is not_started', () => {
  assert.equal(getClockStatus(null, null), 'not_started')
  assert.equal(getClockStatus('2026-10-14T08:00:00Z', null), 'clocked_in')
  assert.equal(getClockStatus('2026-10-14T08:00:00Z', '2026-10-14T16:00:00Z'), 'clocked_out')
  assert.equal(getClockStatus(null, '2026-10-14T16:00:00Z'), 'clocked_out')
})

test('groupAppointmentsByDay splits today, upcoming and the 7-day recent window', () => {
  const rows = [
    row('today-late', '2026-10-14', '15:00:00'),
    row('today-early', '2026-10-14', '08:00:00'),
    row('tomorrow', '2026-10-15', '09:00:00'),
    row('seven-ago', '2026-10-07', '09:00:00'),
    row('eight-ago', '2026-10-06', '09:00:00'),
  ]
  const result = groupAppointmentsByDay(rows, NOW)

  assert.deepEqual(result.today.map((r) => r.id), ['today-early', 'today-late'])
  assert.deepEqual(result.upcoming.map((g) => g.date), ['2026-10-15'])
  assert.deepEqual(result.recent.map((r) => r.id), ['seven-ago'])
})

test('groupAppointmentsByDay groups upcoming by date with per-group time sort', () => {
  const rows = [
    row('c', '2026-10-20', '10:00:00'),
    row('b2', '2026-10-16', '13:00:00'),
    row('b1', '2026-10-16', '07:30:00'),
  ]
  const { upcoming } = groupAppointmentsByDay(rows, NOW)

  assert.deepEqual(
    upcoming.map((g) => ({ date: g.date, ids: g.items.map((r) => r.id) })),
    [
      { date: '2026-10-16', ids: ['b1', 'b2'] },
      { date: '2026-10-20', ids: ['c'] },
    ]
  )
})

test('groupAppointmentsByDay lists recent newest first', () => {
  const rows = [
    row('old', '2026-10-08', '09:00:00'),
    row('new', '2026-10-13', '09:00:00'),
    row('mid', '2026-10-13', '07:00:00'),
  ]
  const { recent } = groupAppointmentsByDay(rows, NOW)

  assert.deepEqual(recent.map((r) => r.id), ['new', 'mid', 'old'])
})

test('buildMapsUrl encodes spaces, commas and #, and returns empty for blank', () => {
  assert.equal(
    buildMapsUrl('  12 Main St, Apt #4  '),
    'https://maps.google.com/?q=12%20Main%20St%2C%20Apt%20%234'
  )
  assert.equal(buildMapsUrl(''), '')
  assert.equal(buildMapsUrl('   '), '')
})

test('resolveTimeSheetMonth accepts a valid past month', () => {
  const result = resolveTimeSheetMonth('2026-02', NOW)

  assert.deepEqual(result, {
    year: 2026,
    month: 2,
    start: '2026-02-01',
    end: '2026-02-28',
    label: 'February 2026',
    prevParam: '2026-01',
    nextParam: '2026-03',
  })
})

test('resolveTimeSheetMonth falls back to the current month for bad or missing input', () => {
  for (const param of ['2026-13', 'foo', '2026-1', undefined, '2027-01']) {
    const result = resolveTimeSheetMonth(param, NOW)
    assert.equal(result.start, '2026-10-01', String(param))
    assert.equal(result.end, '2026-10-31', String(param))
    assert.equal(result.label, 'October 2026', String(param))
    assert.equal(result.nextParam, null, String(param))
  }
})

test('resolveTimeSheetMonth rejects years before 2000', () => {
  const result = resolveTimeSheetMonth('0026-05', NOW)

  assert.equal(result.label, 'October 2026')
  assert.equal(result.nextParam, null)
})

test('resolveTimeSheetMonth uses the first element of an array param', () => {
  assert.equal(resolveTimeSheetMonth(['2026-08', '2026-09'], NOW).month, 8)
})

test('resolveTimeSheetMonth rolls nextParam from December to January', () => {
  const result = resolveTimeSheetMonth('2025-12', NOW)

  assert.equal(result.nextParam, '2026-01')
  assert.equal(result.prevParam, '2025-11')
})

test('resolveTimeSheetMonth wraps prevParam from January to December', () => {
  assert.equal(resolveTimeSheetMonth('2026-01', NOW).prevParam, '2025-12')
})

test('calculateDuration measures an open shift up to now', () => {
  const now = new Date('2026-10-14T10:30:00Z')
  const result = calculateDuration('2026-10-14T08:00:00Z', null, now)

  assert.deepEqual(result, { hours: 2, minutes: 30, totalMinutes: 150, isComplete: false })
})

test('calculateDuration measures a closed shift and flags it complete', () => {
  const result = calculateDuration('2026-10-14T08:00:00Z', '2026-10-14T08:45:00Z', NOW)

  assert.deepEqual(result, { hours: 0, minutes: 45, totalMinutes: 45, isComplete: true })
})

test('calculateDuration returns zeros without a clock-in and clamps negatives to 0', () => {
  assert.deepEqual(calculateDuration(null, null, NOW), {
    hours: 0,
    minutes: 0,
    totalMinutes: 0,
    isComplete: false,
  })
  assert.equal(
    calculateDuration('2026-10-14T09:00:00Z', '2026-10-14T08:00:00Z', NOW).totalMinutes,
    0
  )
})

test('formatDuration renders minutes only, hours only, both, and zero', () => {
  assert.equal(formatDuration(0, 0), '0m')
  assert.equal(formatDuration(0, 45), '45m')
  assert.equal(formatDuration(2, 0), '2h')
  assert.equal(formatDuration(2, 15), '2h 15m')
})

test('summarizeSessions totals and averages, including an open shift', () => {
  const now = new Date('2026-10-14T12:00:00Z')
  const result = summarizeSessions(
    [
      { clocked_in_at: '2026-10-13T08:00:00Z', clocked_out_at: '2026-10-13T09:00:00Z' },
      { clocked_in_at: '2026-10-14T10:00:00Z', clocked_out_at: null },
    ],
    now
  )

  assert.deepEqual(result, { count: 2, totalMinutes: 180, averageMinutes: 90 })
})

test('summarizeSessions with no records averages to 0', () => {
  assert.deepEqual(summarizeSessions([], NOW), { count: 0, totalMinutes: 0, averageMinutes: 0 })
})

test('formatTimeRange: renders 12-hour start and end joined by a spaced en dash', () => {
  assert.equal(formatTimeRange('2026-10-14', '08:00:00', '11:30:00'), '8:00 AM – 11:30 AM')
  assert.equal(formatTimeRange('2026-10-14', '13:05:00', '15:00:00'), '1:05 PM – 3:00 PM')
})

test('formatTimeRange: midnight is 12 AM and noon is 12 PM', () => {
  assert.equal(formatTimeRange('2026-10-14', '00:00:00', '12:00:00'), '12:00 AM – 12:00 PM')
})

test('getBusinessDate: summer 23:30 UTC is still the same Eastern day, 03:59 UTC is the earlier one', () => {
  assert.equal(getBusinessDate(new Date('2026-07-15T23:30:00Z')), '2026-07-15')
  assert.equal(getBusinessDate(new Date('2026-07-16T03:59:00Z')), '2026-07-15')
  assert.equal(getBusinessDate(new Date('2026-07-16T04:00:00Z')), '2026-07-16')
})

test('getBusinessDate: winter 23:30 UTC is still the same Eastern day, 04:59 UTC is the earlier one', () => {
  assert.equal(getBusinessDate(new Date('2026-01-15T23:30:00Z')), '2026-01-15')
  assert.equal(getBusinessDate(new Date('2026-01-16T04:59:00Z')), '2026-01-15')
  assert.equal(getBusinessDate(new Date('2026-01-16T05:00:00Z')), '2026-01-16')
})

test('toBusinessWallClock: local fields match the Eastern wall clock, so 00:30 UTC groups as the earlier day', () => {
  const evening = toBusinessWallClock(new Date('2026-10-09T00:30:00Z')) // 8:30 PM EDT on Oct 8
  const grouped = groupAppointmentsByDay(
    [row('tonight', '2026-10-08', '18:00:00'), row('tomorrow', '2026-10-09', '08:00:00')],
    evening
  )
  assert.deepEqual(grouped.today.map((r) => r.id), ['tonight'])
  assert.deepEqual(grouped.upcoming.map((g) => g.date), ['2026-10-09'])
})

const ME = { id: 'me', full_name: 'Zed Last', phone: null }

function assignment(clockedInAt: string | null = null) {
  return {
    id: 'assignment-1',
    appointment_id: 'appt-1',
    clocked_in_at: clockedInAt,
    clocked_out_at: null,
    appointments: {
      id: 'appt-1',
      scheduled_date: '2026-10-14',
      scheduled_start_time: '08:00:00',
      scheduled_end_time: '11:00:00',
      status: 'scheduled' as const,
      clients: { name: 'Acme', phone: null },
      client_locations: null,
      jobs: { name: 'Deep clean', description: null },
    },
  }
}

function teammate(id: string, fullName: string) {
  return {
    appointment_id: 'appt-1',
    clocked_in_at: null,
    clocked_out_at: null,
    employees_employee_view: { id, full_name: fullName, phone: null },
  }
}

test('buildStop: puts the signed-in Cleaner first and sorts the rest by name', () => {
  const stop = buildStop(
    assignment(),
    [teammate('b', 'Bea'), teammate('me', 'Zed Last'), teammate('a', 'Abe')],
    ME
  )
  assert.deepEqual(stop.crew.map((m) => m.full_name), ['Zed Last', 'Abe', 'Bea'])
  assert.equal(stop.you.id, 'me')
})

test('buildStop: falls back to the own assignment row when the team view omits the Cleaner', () => {
  const stop = buildStop(assignment('2026-10-14T12:00:00Z'), [teammate('a', 'Abe')], ME)
  assert.deepEqual(stop.crew.map((m) => m.id), ['me', 'a'])
  assert.equal(stop.you.clockStatus, 'clocked_in')
})

test('formatBusinessTime: renders Eastern clock time in summer and winter', () => {
  assert.equal(formatBusinessTime(new Date('2026-07-14T16:30:00Z')), '12:30 PM')
  assert.equal(formatBusinessTime(new Date('2026-01-14T16:30:00Z')), '11:30 AM')
})

test('resolveTimeSheetMonth: 02:00Z on 1 Nov is still October in Eastern time', () => {
  const month = resolveTimeSheetMonth(undefined, toBusinessWallClock(new Date('2026-11-01T02:00:00Z')))
  assert.equal(month.year, 2026)
  assert.equal(month.month, 10)
})
