import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  filterNeedsRows,
  isAppointmentsFilterActive,
  matchesFilters,
  resolveFilterOptions,
} from '../../src/lib/appointments/filters.ts'
import {
  appointmentsHref,
  appointmentsInView,
  parseAppointmentsQuery,
  type AppointmentsQuery,
  type ScheduleAppointment,
} from '../../src/lib/appointments/overview.ts'

const BUSINESS_DATE = '2026-10-11'

const OCTOBER: AppointmentsQuery = {
  view: 'schedule',
  layout: 'week',
  from: null,
  weeks: 8,
  month: 10,
  year: 2026,
  showCancelled: false,
  clientId: '',
  jobId: '',
  status: 'all',
}

function row(id: string, overrides: Partial<ScheduleAppointment> = {}): ScheduleAppointment {
  return {
    id,
    clientId: 'smith',
    clientName: 'Maria Silva',
    jobId: 'standard',
    jobName: 'Standard clean',
    scheduledDate: '2026-10-07',
    startTime: '09:00:00',
    endTime: '12:00:00',
    status: 'completed',
    priceCents: 12000,
    paymentState: null,
    claim: null,
    isNotClocked: false,
    isMissedClock: false,
    ...overrides,
  }
}

function ids(appointments: ScheduleAppointment[]): string[] {
  return appointments.map((appointment) => appointment.id)
}

describe('appointment filters in the URL', () => {
  it('reads the Missed clock status', () => {
    assert.equal(parseAppointmentsQuery({ status: 'missed_clock' }, BUSINESS_DATE).status, 'missed_clock')
  })

  it('reads the client, job and status', () => {
    const query = parseAppointmentsQuery({ client: 'smith', job: 'deep', status: 'not_clocked' }, BUSINESS_DATE)

    assert.deepEqual(query, { ...OCTOBER, clientId: 'smith', jobId: 'deep', status: 'not_clocked' })
  })

  it('round-trips every filter through the href', () => {
    const query: AppointmentsQuery = {
      view: 'billed',
      layout: 'month',
      from: null,
      weeks: 8,
      month: 3,
      year: 2025,
      showCancelled: true,
      clientId: 'smith',
      jobId: 'deep',
      status: 'completed',
    }
    const params = Object.fromEntries(new URL(appointmentsHref(query), 'http://localhost').searchParams)

    assert.deepEqual(parseAppointmentsQuery(params, BUSINESS_DATE), query)
  })

  it('leaves the defaults out of the href', () => {
    assert.equal(appointmentsHref(OCTOBER), '/solutions/appointments')
    assert.equal(
      appointmentsHref({ ...OCTOBER, clientId: 'smith', status: 'cancelled' }),
      '/solutions/appointments?client=smith&status=cancelled'
    )
  })

  it('falls back to All for unknown or repeated values', () => {
    assert.deepEqual(parseAppointmentsQuery({ status: 'overdue' }, BUSINESS_DATE), OCTOBER)
    assert.deepEqual(
      parseAppointmentsQuery({ client: ['smith', 'jones'], job: ['deep', 'standard'], status: ['all', 'completed'] }, BUSINESS_DATE),
      OCTOBER
    )
  })

  it('counts as filtered only when a client, job or status is set', () => {
    assert.equal(isAppointmentsFilterActive(OCTOBER), false)
    assert.equal(isAppointmentsFilterActive({ ...OCTOBER, showCancelled: true, view: 'paid' }), false)
    assert.equal(isAppointmentsFilterActive({ ...OCTOBER, clientId: 'smith' }), true)
    assert.equal(isAppointmentsFilterActive({ ...OCTOBER, jobId: 'deep' }), true)
    assert.equal(isAppointmentsFilterActive({ ...OCTOBER, status: 'scheduled' }), true)
  })
})

describe('resolveFilterOptions', () => {
  const options = { clients: [{ id: 'smith', name: 'Maria Silva' }], jobs: [{ id: 'deep', name: 'Deep clean' }] }

  it('keeps a client and job the selects can show', () => {
    const filter = { clientId: 'smith', jobId: 'deep', status: 'all' as const }

    assert.deepEqual(resolveFilterOptions(filter, options), filter)
  })

  it('treats an id outside the active options as All', () => {
    const resolved = resolveFilterOptions({ ...OCTOBER, clientId: 'archived', jobId: 'gone', status: 'completed' }, options)

    assert.deepEqual(resolved, { ...OCTOBER, clientId: '', jobId: '', status: 'completed' })
  })
})

describe('filtering the schedule', () => {
  const month = [
    row('upcoming', { status: 'scheduled' }),
    row('not-clocked', { status: 'scheduled', isNotClocked: true }),
    row('in-progress', { status: 'in_progress' }),
    row('missed-clock', { status: 'in_progress', isMissedClock: true }),
    row('completed', { status: 'completed', paymentState: 'billed' }),
    row('cancelled', { status: 'cancelled' }),
  ]

  it('splits Scheduled from Not clocked so they never overlap', () => {
    assert.deepEqual(ids(appointmentsInView(month, { ...OCTOBER, status: 'scheduled' })), ['upcoming'])
    assert.deepEqual(ids(appointmentsInView(month, { ...OCTOBER, status: 'not_clocked' })), ['not-clocked'])
  })

  it('keeps only the chosen In progress or Completed status', () => {
    assert.deepEqual(ids(appointmentsInView(month, { ...OCTOBER, status: 'in_progress' })), ['in-progress'])
    assert.deepEqual(ids(appointmentsInView(month, { ...OCTOBER, status: 'missed_clock' })), ['missed-clock'])
    assert.deepEqual(ids(appointmentsInView(month, { ...OCTOBER, status: 'completed' })), ['completed'])
  })

  it('hides cancelled under All unless Show cancelled is on', () => {
    assert.deepEqual(ids(appointmentsInView(month, OCTOBER)), ['upcoming', 'not-clocked', 'in-progress', 'missed-clock', 'completed'])
    assert.deepEqual(ids(appointmentsInView(month, { ...OCTOBER, showCancelled: true })), [
      'upcoming',
      'not-clocked',
      'in-progress',
      'missed-clock',
      'completed',
      'cancelled',
    ])
  })

  it('shows only cancelled visits under Cancelled, whatever Show cancelled says', () => {
    assert.deepEqual(ids(appointmentsInView(month, { ...OCTOBER, status: 'cancelled' })), ['cancelled'])
    assert.deepEqual(ids(appointmentsInView(month, { ...OCTOBER, status: 'cancelled', showCancelled: true })), [
      'cancelled',
    ])
  })

  it('keeps other statuses free of cancelled visits even with Show cancelled on', () => {
    assert.deepEqual(ids(appointmentsInView(month, { ...OCTOBER, status: 'completed', showCancelled: true })), [
      'completed',
    ])
  })

  it('narrows to one client and one job', () => {
    const rows = [
      row('smith-standard'),
      row('smith-deep', { jobId: 'deep' }),
      row('jones-standard', { clientId: 'jones' }),
      row('jones-deep', { clientId: 'jones', jobId: 'deep' }),
    ]

    assert.deepEqual(ids(appointmentsInView(rows, { ...OCTOBER, clientId: 'jones' })), ['jones-standard', 'jones-deep'])
    assert.deepEqual(ids(appointmentsInView(rows, { ...OCTOBER, jobId: 'deep' })), ['smith-deep', 'jones-deep'])
    assert.deepEqual(ids(appointmentsInView(rows, { ...OCTOBER, clientId: 'jones', jobId: 'deep' })), ['jones-deep'])
  })

  it('applies the filters inside the Billed and Paid views', () => {
    const rows = [
      row('smith-billed', { paymentState: 'billed' }),
      row('jones-billed', { clientId: 'jones', paymentState: 'billed' }),
      row('jones-paid', { clientId: 'jones', paymentState: 'paid' }),
    ]

    assert.deepEqual(ids(appointmentsInView(rows, { ...OCTOBER, view: 'billed', clientId: 'jones' })), ['jones-billed'])
  })

  it('matches a single row against a filter', () => {
    const filter = { clientId: 'smith', jobId: '', status: 'not_clocked' as const }

    assert.equal(matchesFilters(row('a', { status: 'scheduled', isNotClocked: true }), filter, false), true)
    assert.equal(matchesFilters(row('b', { status: 'scheduled' }), filter, false), false)
  })

  it('narrows Needs billing and Needs completion rows by client and job, ignoring status', () => {
    const rows = [
      { id: 'smith-standard', clientId: 'smith', jobId: 'standard' },
      { id: 'smith-deep', clientId: 'smith', jobId: 'deep' },
      { id: 'jones-deep', clientId: 'jones', jobId: 'deep' },
    ]
    const filter = { clientId: '', jobId: 'deep', status: 'cancelled' as const }

    assert.deepEqual(filterNeedsRows(rows, filter).map((r) => r.id), ['smith-deep', 'jones-deep'])
    assert.deepEqual(filterNeedsRows(rows, { ...filter, clientId: 'jones' }).map((r) => r.id), ['jones-deep'])
    assert.equal(filterNeedsRows(rows, { clientId: '', jobId: '', status: 'completed' }).length, 3)
  })
})
