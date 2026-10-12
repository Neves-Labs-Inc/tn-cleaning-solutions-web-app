import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { completeAppointments, listNeedsCompletion } from '../../src/lib/appointments/needs-completion.ts'
import { createFakeSupabase } from '../invoices/fake-supabase.ts'

const JOB_RATE_CENTS = 4000
// 08:00 Eastern on Oct 11.
const NOW = new Date('2026-10-11T12:00:00Z')

type AppointmentSeed = {
  id: string
  date?: string
  start?: string
  end?: string
  status?: string
  isArchived?: boolean
  hourlyRateCents?: number | null
  clientId?: string
  clientName?: string
}

function appointment(seed: AppointmentSeed) {
  const rate = seed.hourlyRateCents === undefined ? JOB_RATE_CENTS : seed.hourlyRateCents
  return {
    id: seed.id,
    client_id: seed.clientId ?? 'smith',
    job_id: 'standard',
    scheduled_date: seed.date ?? '2026-09-30',
    scheduled_start_time: seed.start ?? '09:00:00',
    scheduled_end_time: seed.end ?? '12:00:00',
    price_override_cents: null,
    pricing_job: rate === null ? null : { hourly_rate_cents: rate },
    status: seed.status ?? 'scheduled',
    manually_completed: false,
    is_archived: seed.isArchived ?? false,
    clients: { name: seed.clientName ?? 'Maria Silva' },
    jobs: { name: 'Standard clean' },
  }
}

describe('listNeedsCompletion', () => {
  it('lists every Not clocked appointment across months, oldest first, with its displayed price', async () => {
    const { db } = createFakeSupabase({
      appointments: [
        appointment({ id: 'oct-11-ended-early', date: '2026-10-11', start: '05:00:00', end: '06:30:00' }),
        appointment({ id: 'sep-30-afternoon', start: '13:00:00', end: '15:30:00', hourlyRateCents: null }),
        appointment({ id: 'aug-4', date: '2026-08-04', clientId: 'acme', clientName: 'Acme Co' }),
      ],
    })

    const appointments = await listNeedsCompletion(db, NOW)

    assert.deepEqual(appointments, [
      {
        id: 'aug-4',
        clientId: 'acme',
        clientName: 'Acme Co',
        jobId: 'standard',
        jobName: 'Standard clean',
        scheduledDate: '2026-08-04',
        startTime: '09:00:00',
        endTime: '12:00:00',
        priceCents: 12000,
      },
      {
        id: 'sep-30-afternoon',
        clientId: 'smith',
        clientName: 'Maria Silva',
        jobId: 'standard',
        jobName: 'Standard clean',
        scheduledDate: '2026-09-30',
        startTime: '13:00:00',
        endTime: '15:30:00',
        priceCents: null,
      },
      {
        id: 'oct-11-ended-early',
        clientId: 'smith',
        clientName: 'Maria Silva',
        jobId: 'standard',
        jobName: 'Standard clean',
        scheduledDate: '2026-10-11',
        startTime: '05:00:00',
        endTime: '06:30:00',
        priceCents: 6000,
      },
    ])
  })

  it('leaves out visits still in their clock-in window, upcoming, clocked, completed, cancelled or archived', async () => {
    const { db } = createFakeSupabase({
      appointments: [
        appointment({ id: 'not-clocked' }),
        // Ended 07:30 Eastern, so the hour's grace runs to 08:30.
        appointment({ id: 'within-grace', date: '2026-10-11', start: '06:00:00', end: '07:30:00' }),
        appointment({ id: 'upcoming', date: '2026-10-20' }),
        appointment({ id: 'in-progress', status: 'in_progress' }),
        appointment({ id: 'completed', status: 'completed' }),
        appointment({ id: 'cancelled', status: 'cancelled' }),
        appointment({ id: 'archived', isArchived: true }),
      ],
    })

    const appointments = await listNeedsCompletion(db, NOW)

    assert.deepEqual(
      appointments.map((row) => row.id),
      ['not-clocked']
    )
  })

  it('shows nothing when every visit was clocked', async () => {
    const { db } = createFakeSupabase({ appointments: [appointment({ id: 'completed', status: 'completed' })] })

    assert.deepEqual(await listNeedsCompletion(db, NOW), [])
  })

  it('reads a long backlog in pages and prices it in batches', async () => {
    const ids = Array.from({ length: 1200 }, (_, index) => `appt-${String(index).padStart(4, '0')}`)
    const { db } = createFakeSupabase({ appointments: ids.map((id) => appointment({ id })) })

    const appointments = await listNeedsCompletion(db, NOW)

    assert.equal(appointments.length, ids.length)
    assert.ok(appointments.every((row) => row.priceCents === 12000))
  })
})

type CompletionSeed = {
  id: string
  status?: string
  manuallyCompleted?: boolean
  isArchived?: boolean
}

function completionRow(seed: CompletionSeed) {
  return {
    id: seed.id,
    status: seed.status ?? 'scheduled',
    manually_completed: seed.manuallyCompleted ?? false,
    is_archived: seed.isArchived ?? false,
  }
}

describe('completeAppointments', () => {
  it('marks the still-scheduled visits complete and skips the ones that changed', async () => {
    const { db, tables } = createFakeSupabase({
      appointments: [
        completionRow({ id: 'untouched' }),
        completionRow({ id: 'clocked-in', status: 'in_progress' }),
        completionRow({ id: 'cancelled', status: 'cancelled' }),
        completionRow({ id: 'already-done', status: 'completed', manuallyCompleted: true }),
        completionRow({ id: 'archived', isArchived: true }),
        completionRow({ id: 'also-untouched' }),
      ],
    })
    const ids = ['untouched', 'clocked-in', 'cancelled', 'already-done', 'archived', 'also-untouched']

    const result = await completeAppointments(db, ids)

    assert.deepEqual([...result.completed].sort(), ['also-untouched', 'untouched'])
    assert.deepEqual([...result.skipped].sort(), ['already-done', 'archived', 'cancelled', 'clocked-in'])
    const flagged = tables.appointments.filter((row) => row.manually_completed).map((row) => row.id)
    assert.deepEqual(flagged.sort(), ['already-done', 'also-untouched', 'untouched'])
  })

  it('skips an id that matches no appointment', async () => {
    const { db } = createFakeSupabase({ appointments: [completionRow({ id: 'untouched' })] })

    const result = await completeAppointments(db, ['untouched', 'deleted'])

    assert.deepEqual(result, { completed: ['untouched'], skipped: ['deleted'], failed: [] })
  })

  it('skips every id when nothing matches', async () => {
    const { db } = createFakeSupabase({
      appointments: [completionRow({ id: 'clocked-in', status: 'in_progress' })],
    })

    const result = await completeAppointments(db, ['clocked-in', 'deleted'])

    assert.deepEqual(result, { completed: [], skipped: ['clocked-in', 'deleted'], failed: [] })
  })

  it('does nothing for an empty list', async () => {
    const { db } = createFakeSupabase({ appointments: [completionRow({ id: 'untouched' })] })

    const result = await completeAppointments(db, [])

    assert.deepEqual(result, { completed: [], skipped: [], failed: [] })
  })

  it('completes a long selection in batches the request URL can carry', async () => {
    const ids = Array.from({ length: 300 }, (_, index) => `appt-${String(index).padStart(4, '0')}`)
    const { db } = createFakeSupabase({ appointments: ids.map((id) => completionRow({ id })) })

    const result = await completeAppointments(db, ids)

    assert.equal(result.completed.length, ids.length)
    assert.deepEqual(result.skipped, [])
  })

  it('reports the ids it never reached when a later batch fails after earlier ones committed', async () => {
    const ids = Array.from({ length: 250 }, (_, index) => `appt-${String(index).padStart(4, '0')}`)
    const tables = { appointments: ids.map((id) => completionRow({ id })) }
    const healthy = createFakeSupabase(tables).db
    const dropped = createFakeSupabase(tables, undefined, ['appointments']).db
    let requests = 0
    // The first batch reaches the database; the connection drops before the second.
    const db = {
      from: (table: string) => {
        requests += 1
        return (requests === 1 ? healthy : dropped).from(table)
      },
    } as unknown as typeof healthy

    const result = await completeAppointments(db, ids)

    assert.deepEqual(result.completed, ids.slice(0, 100))
    assert.deepEqual(result.skipped, [])
    assert.deepEqual(result.failed, ids.slice(100))
  })

  it('throws when the update fails', async () => {
    const { db } = createFakeSupabase({ appointments: [completionRow({ id: 'untouched' })] }, undefined, [
      'appointments',
    ])

    await assert.rejects(completeAppointments(db, ['untouched']))
  })
})
