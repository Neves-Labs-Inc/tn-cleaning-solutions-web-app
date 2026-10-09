import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  canCancel,
  canClockIn,
  canEdit,
  canMarkComplete,
  canRestore,
  canUndoComplete,
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
  it('refuses completed and cancelled appointments', () => {
    assert.deepEqual(STATUSES.map(canEdit), [true, true, false, false])
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
