import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { listMonthAppointments } from '../../src/lib/appointments/month-appointments.ts'
import { createFakeSupabase } from '../invoices/fake-supabase.ts'

const JOB_RATE_CENTS = 4000
const OCTOBER_2026 = { month: 10, year: 2026 }
const NOW = new Date('2026-10-11T12:00:00Z')

type AppointmentSeed = {
  id: string
  date?: string
  start?: string
  end?: string
  status?: string
  completedAt?: string | null
  isArchived?: boolean
  hourlyRateCents?: number | null
}

function appointment(seed: AppointmentSeed) {
  const rate = seed.hourlyRateCents === undefined ? JOB_RATE_CENTS : seed.hourlyRateCents
  return {
    id: seed.id,
    client_id: 'smith',
    job_id: 'standard',
    scheduled_date: seed.date ?? '2026-10-07',
    scheduled_start_time: seed.start ?? '09:00:00',
    scheduled_end_time: seed.end ?? '12:00:00',
    price_override_cents: null,
    pricing_job: rate === null ? null : { hourly_rate_cents: rate },
    status: seed.status ?? 'completed',
    completed_at: seed.completedAt === undefined ? '2026-10-07T16:00:00Z' : seed.completedAt,
    is_archived: seed.isArchived ?? false,
    clients: { name: 'Maria Silva' },
    jobs: { name: 'Standard clean' },
  }
}

type InvoiceSeed = { id: string; status: 'draft' | 'issued' | 'paid'; invoice_number: string | null }

const DRAFT: InvoiceSeed = { id: 'inv-draft', status: 'draft', invoice_number: null }
const PAID: InvoiceSeed = { id: 'inv-paid', status: 'paid', invoice_number: 'INV-002-SMI2026' }

function line(appointmentId: string, invoice: InvoiceSeed, billedAmountCents: number | null) {
  return {
    appointment_id: appointmentId,
    invoice_id: invoice.id,
    billed_amount_cents: billedAmountCents,
    is_archived: false,
    cancelled_at: null,
    invoice,
  }
}

describe('listMonthAppointments', () => {
  it("lists the month's appointments in order with their displayed price and Payment state", async () => {
    const { db } = createFakeSupabase({
      appointments: [
        appointment({ id: 'oct-9-paid', date: '2026-10-09' }),
        appointment({ id: 'oct-7-afternoon', start: '13:00:00', end: '15:30:00' }),
        appointment({ id: 'oct-7-on-draft' }),
        appointment({ id: 'oct-20-upcoming', date: '2026-10-20', status: 'scheduled', completedAt: null, hourlyRateCents: null }),
      ],
      invoice_appointments: [line('oct-9-paid', PAID, 9900), line('oct-7-on-draft', DRAFT, null)],
    })

    const appointments = await listMonthAppointments(db, OCTOBER_2026, NOW)

    assert.deepEqual(appointments, [
      {
        id: 'oct-7-on-draft',
        clientId: 'smith',
        clientName: 'Maria Silva',
        jobId: 'standard',
        jobName: 'Standard clean',
        scheduledDate: '2026-10-07',
        startTime: '09:00:00',
        endTime: '12:00:00',
        status: 'completed',
        priceCents: 12000,
        paymentState: 'billed',
        claim: { id: 'inv-draft', number: null, status: 'draft' },
        isNotClocked: false,
      },
      {
        id: 'oct-7-afternoon',
        clientId: 'smith',
        clientName: 'Maria Silva',
        jobId: 'standard',
        jobName: 'Standard clean',
        scheduledDate: '2026-10-07',
        startTime: '13:00:00',
        endTime: '15:30:00',
        status: 'completed',
        priceCents: 10000,
        paymentState: 'unbilled',
        claim: null,
        isNotClocked: false,
      },
      {
        id: 'oct-9-paid',
        clientId: 'smith',
        clientName: 'Maria Silva',
        jobId: 'standard',
        jobName: 'Standard clean',
        scheduledDate: '2026-10-09',
        startTime: '09:00:00',
        endTime: '12:00:00',
        status: 'completed',
        priceCents: 9900,
        paymentState: 'paid',
        claim: { id: 'inv-paid', number: 'INV-002-SMI2026', status: 'paid' },
        isNotClocked: false,
      },
      {
        id: 'oct-20-upcoming',
        clientId: 'smith',
        clientName: 'Maria Silva',
        jobId: 'standard',
        jobName: 'Standard clean',
        scheduledDate: '2026-10-20',
        startTime: '09:00:00',
        endTime: '12:00:00',
        status: 'scheduled',
        priceCents: null,
        paymentState: null,
        claim: null,
        isNotClocked: false,
      },
    ])
  })

  it('leaves out other months and archived appointments', async () => {
    const { db } = createFakeSupabase({
      appointments: [
        appointment({ id: 'sep-30', date: '2026-09-30' }),
        appointment({ id: 'oct-1', date: '2026-10-01' }),
        appointment({ id: 'oct-31', date: '2026-10-31' }),
        appointment({ id: 'nov-1', date: '2026-11-01' }),
        appointment({ id: 'archived', isArchived: true }),
      ],
    })

    const appointments = await listMonthAppointments(db, OCTOBER_2026, NOW)

    assert.deepEqual(
      appointments.map((row) => row.id),
      ['oct-1', 'oct-31']
    )
  })

  it("reads a busy month's prices and claims in batches", async () => {
    const ids = Array.from({ length: 600 }, (_, index) => `appt-${String(index).padStart(4, '0')}`)
    const { db } = createFakeSupabase({
      appointments: ids.map((id) => appointment({ id })),
      invoice_appointments: ids.map((id) => line(id, PAID, 12000)),
    })

    const appointments = await listMonthAppointments(db, OCTOBER_2026, NOW)

    assert.equal(appointments.length, ids.length)
    assert.ok(appointments.every((row) => row.paymentState === 'paid'))
  })
})
