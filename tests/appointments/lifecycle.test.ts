import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  canCancel,
  canClockIn,
  canEdit,
  canMarkComplete,
  canRestore,
  canUndoComplete,
  completedDateError,
  type AppointmentStatus,
} from '../../src/lib/appointments/lifecycle.ts'

const STATUSES: AppointmentStatus[] = ['scheduled', 'in_progress', 'completed', 'cancelled']

describe('canCancel', () => {
  it('allows every status except cancelled, including completed', () => {
    assert.deepEqual(STATUSES.map(canCancel), [true, true, true, false])
  })
})

describe('canRestore', () => {
  it('allows only a cancelled appointment', () => {
    assert.deepEqual(STATUSES.map(canRestore), [false, false, false, true])
  })
})

describe('canEdit', () => {
  it('allows every status except cancelled, including completed', () => {
    assert.deepEqual(STATUSES.map(canEdit), [true, true, true, false])
  })
})

describe('completedDateError', () => {
  const TODAY = '2026-10-11'
  const REFUSAL = "A completed appointment can't move to a date after today."

  it('refuses a completed appointment moved to tomorrow', () => {
    assert.equal(
      completedDateError({ status: 'completed', scheduledDate: '2026-10-12', businessDate: TODAY }),
      REFUSAL
    )
  })

  it('refuses a completed appointment moved into a later month or year', () => {
    assert.equal(
      completedDateError({ status: 'completed', scheduledDate: '2027-01-01', businessDate: TODAY }),
      REFUSAL
    )
  })

  it('lets a completed appointment move to today or any past date', () => {
    for (const scheduledDate of [TODAY, '2026-10-10', '2025-12-31']) {
      assert.equal(completedDateError({ status: 'completed', scheduledDate, businessDate: TODAY }), null)
    }
  })

  it('lets an appointment that is not completed move to a future date', () => {
    for (const status of ['scheduled', 'in_progress'] as const) {
      assert.equal(completedDateError({ status, scheduledDate: '2026-10-12', businessDate: TODAY }), null)
    }
  })
})

describe('canMarkComplete', () => {
  it('allows a non-cancelled appointment that is not manually completed', () => {
    assert.deepEqual(
      STATUSES.map((status) => canMarkComplete({ status, manually_completed: false })),
      [true, true, true, false]
    )
  })

  it('refuses every status once manually completed', () => {
    assert.deepEqual(
      STATUSES.map((status) => canMarkComplete({ status, manually_completed: true })),
      [false, false, false, false]
    )
  })
})

describe('canUndoComplete', () => {
  it('allows a manually completed appointment that is not cancelled', () => {
    assert.deepEqual(
      STATUSES.map((status) => canUndoComplete({ status, manually_completed: true })),
      [true, true, true, false]
    )
  })

  it('refuses every status when not manually completed', () => {
    assert.deepEqual(
      STATUSES.map((status) => canUndoComplete({ status, manually_completed: false })),
      [false, false, false, false]
    )
  })
})

describe('canClockIn', () => {
  it('allows a non-cancelled appointment not manually completed, even one completed by its clocks', () => {
    assert.deepEqual(
      STATUSES.map((status) => canClockIn({ status, manually_completed: false })),
      [true, true, true, false]
    )
  })

  it('refuses every status once manually completed', () => {
    assert.deepEqual(
      STATUSES.map((status) => canClockIn({ status, manually_completed: true })),
      [false, false, false, false]
    )
  })
})
