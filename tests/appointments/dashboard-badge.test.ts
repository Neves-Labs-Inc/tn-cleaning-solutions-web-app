import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { CircleDashed, Clock } from 'lucide-react'

import { todayAppointmentBadge, type TodayAppointmentRow } from '../../src/lib/helpers/dashboard.ts'

// 2026-10-07 is Eastern daylight time (UTC-4): 11:30 ends at 15:30Z, the grace ends at 16:30Z.
const ROW: TodayAppointmentRow = {
  id: 'a1',
  scheduled_date: '2026-10-07',
  scheduled_start_time: '09:00:00',
  scheduled_end_time: '11:30:00',
  status: 'scheduled',
  clients: null,
  jobs: null,
  client_locations: null,
  appointment_employees: null,
}
const BEFORE_GRACE_END = new Date('2026-10-07T16:29:00Z')
const AFTER_GRACE_END = new Date('2026-10-07T16:31:00Z')

describe('todayAppointmentBadge', () => {
  it('shows Scheduled before the grace hour ends', () => {
    assert.deepEqual(todayAppointmentBadge(ROW, BEFORE_GRACE_END), { tone: 'info', label: 'Scheduled' })
  })

  it('shows Not clocked for a scheduled visit past the grace hour', () => {
    assert.deepEqual(todayAppointmentBadge(ROW, AFTER_GRACE_END), { tone: 'danger', label: 'Not clocked', icon: Clock })
  })

  it('shows In Progress before the grace hour ends', () => {
    const row = { ...ROW, status: 'in_progress' as const }
    assert.deepEqual(todayAppointmentBadge(row, BEFORE_GRACE_END), { tone: 'progress', label: 'In Progress' })
  })

  it('shows Missed clock for an in-progress visit past the grace hour', () => {
    const row = { ...ROW, status: 'in_progress' as const }
    assert.deepEqual(todayAppointmentBadge(row, AFTER_GRACE_END), { tone: 'danger', label: 'Missed clock', icon: CircleDashed })
  })

  it('shows Completed however late it is', () => {
    const row = { ...ROW, status: 'completed' as const }
    assert.deepEqual(todayAppointmentBadge(row, AFTER_GRACE_END), { tone: 'neutral', label: 'Completed' })
  })

  it('does not flag a visit whose date cannot be read', () => {
    const row = { ...ROW, scheduled_date: 'nope' }
    assert.deepEqual(todayAppointmentBadge(row, AFTER_GRACE_END), { tone: 'info', label: 'Scheduled' })
  })
})
