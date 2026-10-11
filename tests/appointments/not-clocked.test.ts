import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isNotClocked } from '../../src/lib/appointments/overview.ts'
import type { AppointmentStatus } from '../../src/lib/appointments/lifecycle.ts'

// 2026-10-07 is Eastern daylight time (UTC-4): 11:30 ends at 15:30Z, the grace ends at 16:30Z.
const VISIT = { status: 'scheduled' as AppointmentStatus, scheduledDate: '2026-10-07', endTime: '11:30:00' }

describe('isNotClocked', () => {
  it('is not yet true at exactly one hour after the scheduled end', () => {
    assert.equal(isNotClocked(VISIT, new Date('2026-10-07T16:30:00Z')), false)
  })

  it('is true just after the grace hour ends', () => {
    assert.equal(isNotClocked(VISIT, new Date('2026-10-07T16:30:01Z')), true)
  })

  it('is true for a scheduled appointment on a past date', () => {
    assert.equal(isNotClocked(VISIT, new Date('2026-10-09T12:00:00Z')), true)
  })

  it('is false today before the scheduled end', () => {
    assert.equal(isNotClocked(VISIT, new Date('2026-10-07T14:00:00Z')), false)
  })

  it('is false on a future date', () => {
    assert.equal(isNotClocked(VISIT, new Date('2026-10-06T12:00:00Z')), false)
  })

  it('is never true for an appointment that is not scheduled', () => {
    const longAfter = new Date('2026-10-20T12:00:00Z')
    for (const status of ['in_progress', 'completed', 'cancelled'] as const) {
      assert.equal(isNotClocked({ ...VISIT, status }, longAfter), false, status)
    }
  })

  it('is false when the date or time cannot be read', () => {
    assert.equal(isNotClocked({ ...VISIT, scheduledDate: 'nope' }, new Date('2026-10-20T12:00:00Z')), false)
  })
})
