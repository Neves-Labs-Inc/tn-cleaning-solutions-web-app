import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { appointmentCardTone, NOT_CLOCKED_BADGE } from '../../src/components/ui/status-badge-tones.ts'

type ToneInput = Parameters<typeof appointmentCardTone>[0]

const COMPLETED: ToneInput = { status: 'completed', isNotClocked: false, paymentState: null }

describe('appointmentCardTone', () => {
  it('tints each Payment state: unbilled warning, billed info, paid success', () => {
    assert.equal(appointmentCardTone({ ...COMPLETED, paymentState: 'unbilled' }), 'warning')
    assert.equal(appointmentCardTone({ ...COMPLETED, paymentState: 'billed' }), 'info')
    assert.equal(appointmentCardTone({ ...COMPLETED, paymentState: 'paid' }), 'success')
  })

  it('tints a Not clocked appointment danger', () => {
    assert.equal(appointmentCardTone({ status: 'scheduled', isNotClocked: true, paymentState: null }), 'danger')
  })

  it('lets Not clocked win over the Payment state', () => {
    assert.equal(appointmentCardTone({ status: 'scheduled', isNotClocked: true, paymentState: 'billed' }), 'danger')
    assert.equal(appointmentCardTone({ status: 'scheduled', isNotClocked: true, paymentState: 'paid' }), 'danger')
  })

  it('never tints a cancelled appointment', () => {
    assert.equal(appointmentCardTone({ status: 'cancelled', isNotClocked: false, paymentState: null }), null)
  })

  it('leaves Completed with no Payment state, Scheduled and In Progress untinted', () => {
    assert.equal(appointmentCardTone(COMPLETED), null)
    assert.equal(appointmentCardTone({ status: 'scheduled', isNotClocked: false, paymentState: null }), null)
    assert.equal(appointmentCardTone({ status: 'in_progress', isNotClocked: false, paymentState: null }), null)
  })
})

describe('NOT_CLOCKED_BADGE', () => {
  it('is danger', () => {
    assert.equal(NOT_CLOCKED_BADGE.tone, 'danger')
  })
})
