import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { calendarEventTitle } from '../../../src/components/admin/calendar-event-title.ts'
import type { ScheduleAppointment } from '../../../src/lib/appointments/overview.ts'

const APPOINTMENT: ScheduleAppointment = {
  id: 'appt-1',
  clientId: 'smith',
  clientName: 'Smith Residence',
  jobName: 'Deep clean',
  scheduledDate: '2026-10-07',
  startTime: '09:00:00',
  endTime: '11:30:00',
  status: 'completed',
  priceCents: 12000,
  paymentState: 'unbilled',
  claim: null,
}

describe('calendarEventTitle', () => {
  it('names the time, Job, client and status when there is no claim', () => {
    assert.equal(calendarEventTitle(APPOINTMENT), '09:00 Deep clean · Smith Residence · Completed')
    assert.equal(
      calendarEventTitle({ ...APPOINTMENT, status: 'scheduled', paymentState: null }),
      '09:00 Deep clean · Smith Residence · Scheduled'
    )
  })

  it("adds the Payment state and the claim's invoice number", () => {
    const title = calendarEventTitle({
      ...APPOINTMENT,
      paymentState: 'paid',
      claim: { id: 'inv-1', number: 'INV-004-SMI2026', status: 'paid' },
    })

    assert.equal(title, '09:00 Deep clean · Smith Residence · Completed · Paid · INV-004-SMI2026')
  })

  it('says Draft for a claim on a draft invoice', () => {
    const title = calendarEventTitle({
      ...APPOINTMENT,
      paymentState: 'billed',
      claim: { id: 'inv-2', number: null, status: 'draft' },
    })

    assert.equal(title, '09:00 Deep clean · Smith Residence · Completed · Billed · Draft')
  })
})
