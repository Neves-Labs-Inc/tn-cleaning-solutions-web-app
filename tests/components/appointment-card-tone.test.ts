import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  appointmentCardTone,
  appointmentDisplayBadge,
  appointmentStatusBadge,
  MISSED_CLOCK_BADGE,
  NOT_CLOCKED_BADGE,
} from '../../src/components/ui/status-badge-tones.ts'

type ToneInput = Parameters<typeof appointmentCardTone>[0]

const COMPLETED: ToneInput = { status: 'completed', isNotClocked: false, isMissedClock: false, paymentState: null }

describe('appointmentCardTone', () => {
  it('tints each Payment state: unbilled warning, billed info, paid success', () => {
    assert.equal(appointmentCardTone({ ...COMPLETED, paymentState: 'unbilled' }), 'warning')
    assert.equal(appointmentCardTone({ ...COMPLETED, paymentState: 'billed' }), 'info')
    assert.equal(appointmentCardTone({ ...COMPLETED, paymentState: 'paid' }), 'success')
  })

  it('tints a Not clocked appointment danger', () => {
    assert.equal(appointmentCardTone({ status: 'scheduled', isNotClocked: true, isMissedClock: false, paymentState: null }), 'danger')
  })

  it('lets Not clocked win over the Payment state', () => {
    assert.equal(appointmentCardTone({ status: 'scheduled', isNotClocked: true, isMissedClock: false, paymentState: 'billed' }), 'danger')
    assert.equal(appointmentCardTone({ status: 'scheduled', isNotClocked: true, isMissedClock: false, paymentState: 'paid' }), 'danger')
  })

  it('never tints a cancelled appointment', () => {
    assert.equal(appointmentCardTone({ status: 'cancelled', isNotClocked: false, isMissedClock: false, paymentState: null }), null)
  })

  it('tints In Progress progress, with or without a Payment state', () => {
    const inProgress: ToneInput = { status: 'in_progress', isNotClocked: false, isMissedClock: false, paymentState: null }
    assert.equal(appointmentCardTone(inProgress), 'progress')
    for (const paymentState of ['unbilled', 'billed', 'paid'] as const) {
      assert.equal(appointmentCardTone({ ...inProgress, paymentState }), 'progress')
    }
  })

  it('keeps the In Progress badge label and gives it the progress tone', () => {
    assert.deepEqual(appointmentStatusBadge('in_progress'), { tone: 'progress', label: 'In Progress' })
  })

  it('leaves Completed with no Payment state and Scheduled untinted', () => {
    assert.equal(appointmentCardTone(COMPLETED), null)
    assert.equal(appointmentCardTone({ status: 'scheduled', isNotClocked: false, isMissedClock: false, paymentState: null }), null)
  })
})

describe('NOT_CLOCKED_BADGE', () => {
  it('is danger', () => {
    assert.equal(NOT_CLOCKED_BADGE.tone, 'danger')
  })
})

describe('Missed clock', () => {
  const missed: ToneInput = { status: 'in_progress', isNotClocked: false, isMissedClock: true, paymentState: null }

  it('tints danger even when the appointment is billed or paid', () => {
    assert.equal(appointmentCardTone(missed), 'danger')
    assert.equal(appointmentCardTone({ ...missed, paymentState: 'billed' }), 'danger')
    assert.equal(appointmentCardTone({ ...missed, paymentState: 'paid' }), 'danger')
  })

  it('badge is danger, labelled Missed clock', () => {
    assert.equal(MISSED_CLOCK_BADGE.tone, 'danger')
    assert.equal(MISSED_CLOCK_BADGE.label, 'Missed clock')
  })

  it('shows as the display badge instead of In progress', () => {
    assert.equal(appointmentDisplayBadge(missed), MISSED_CLOCK_BADGE)
  })

  it('leaves Not clocked and the plain status badges as they were', () => {
    assert.equal(appointmentDisplayBadge({ status: 'scheduled', isNotClocked: true, isMissedClock: false }), NOT_CLOCKED_BADGE)
    assert.equal(
      appointmentDisplayBadge({ status: 'in_progress', isNotClocked: false, isMissedClock: false }),
      appointmentStatusBadge('in_progress')
    )
  })
})
