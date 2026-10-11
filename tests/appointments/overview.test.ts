import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  appointmentsHref,
  appointmentsInView,
  createPendingTile,
  getNavQuery,
  isLockedRow,
  parseAppointmentsQuery,
  resolveBillingSelection,
  syncPendingTile,
  summarizeOverview,
  tileCaption,
  toggleView,
  type AppointmentsQuery,
  type ScheduleAppointment,
} from '../../src/lib/appointments/overview.ts'
import type { NeedsBillingAppointment } from '../../src/lib/invoices/payment-state-queries.ts'

const BUSINESS_DATE = '2026-10-11'

const OCTOBER: AppointmentsQuery = { view: 'schedule', month: 10, year: 2026, showCancelled: false }

describe('parseAppointmentsQuery', () => {
  it('opens on the schedule for the Business date month when no params are given', () => {
    assert.deepEqual(parseAppointmentsQuery({}, BUSINESS_DATE), OCTOBER)
  })

  it('reads every view, the month, the year and Show cancelled', () => {
    assert.deepEqual(
      parseAppointmentsQuery({ view: 'paid', month: '3', year: '2025', showCancelled: 'true' }, BUSINESS_DATE),
      { view: 'paid', month: 3, year: 2025, showCancelled: true }
    )
    assert.equal(parseAppointmentsQuery({ view: 'needs-billing' }, BUSINESS_DATE).view, 'needs-billing')
    assert.equal(parseAppointmentsQuery({ view: 'billed' }, BUSINESS_DATE).view, 'billed')
  })

  it('falls back to the schedule and the current month for unknown or repeated values', () => {
    assert.deepEqual(
      parseAppointmentsQuery({ view: 'unbilled', month: '13', year: '1999', showCancelled: 'yes' }, BUSINESS_DATE),
      OCTOBER
    )
    assert.equal(parseAppointmentsQuery({ view: ['paid', 'billed'] }, BUSINESS_DATE).view, 'schedule')
  })
})

describe('appointmentsHref', () => {
  it('leaves out the view on the schedule and Show cancelled when off', () => {
    assert.equal(appointmentsHref(OCTOBER), '/solutions/appointments?month=10&year=2026')
  })

  it('keeps the view, month, year and Show cancelled', () => {
    assert.equal(
      appointmentsHref({ view: 'needs-billing', month: 3, year: 2025, showCancelled: true }),
      '/solutions/appointments?view=needs-billing&month=3&year=2025&showCancelled=true'
    )
  })
})

describe('toggleView', () => {
  it('opens a view from the schedule, keeping month, year and Show cancelled', () => {
    const query = { ...OCTOBER, showCancelled: true }

    assert.deepEqual(toggleView(query, 'billed'), { ...query, view: 'billed' })
  })

  it('switches from one view to another', () => {
    assert.equal(toggleView({ ...OCTOBER, view: 'paid' }, 'needs-billing').view, 'needs-billing')
  })

  it('returns to the schedule when the active view is chosen again', () => {
    assert.deepEqual(toggleView({ ...OCTOBER, view: 'paid' }, 'paid'), OCTOBER)
  })
})

function needsBilling(id: string, livePriceCents: number | null): NeedsBillingAppointment {
  return {
    id,
    clientId: 'smith',
    clientName: 'Maria Silva',
    scheduledDate: '2025-09-15',
    startTime: '09:00:00',
    endTime: '12:00:00',
    jobName: 'Standard clean',
    livePriceCents,
  }
}

function scheduled(
  id: string,
  overrides: Partial<ScheduleAppointment> = {}
): ScheduleAppointment {
  return {
    id,
    clientId: 'smith',
    clientName: 'Maria Silva',
    jobName: 'Standard clean',
    scheduledDate: '2026-10-07',
    startTime: '09:00:00',
    endTime: '12:00:00',
    status: 'completed',
    priceCents: 12000,
    paymentState: null,
    claim: null,
    isNotClocked: false,
    ...overrides,
  }
}

describe('summarizeOverview', () => {
  it('sums the Live prices of priced Needs billing appointments and counts the Unpriced ones', () => {
    const overview = summarizeOverview(
      [needsBilling('a', 12000), needsBilling('b', null), needsBilling('c', 8050)],
      []
    )

    assert.deepEqual(overview.needsBilling, { totalCents: 20050, count: 3, unpricedCount: 1 })
  })

  it("sums the month's Billed and Paid appointments by their displayed price", () => {
    const overview = summarizeOverview(
      [],
      [
        scheduled('billed-draft', { paymentState: 'billed', priceCents: 9000 }),
        scheduled('billed-issued', { paymentState: 'billed', priceCents: 11000 }),
        scheduled('billed-unpriced', { paymentState: 'billed', priceCents: null }),
        scheduled('paid', { paymentState: 'paid', priceCents: 15000 }),
        scheduled('unbilled', { paymentState: 'unbilled' }),
        scheduled('upcoming', { status: 'scheduled' }),
      ]
    )

    assert.deepEqual(overview.billed, { totalCents: 20000, count: 3, unpricedCount: 1 })
    assert.deepEqual(overview.paid, { totalCents: 15000, count: 1, unpricedCount: 0 })
  })

  it('shows zero totals when nothing is in a state', () => {
    const overview = summarizeOverview([], [])

    assert.deepEqual(overview, {
      needsBilling: { totalCents: 0, count: 0, unpricedCount: 0 },
      billed: { totalCents: 0, count: 0, unpricedCount: 0 },
      paid: { totalCents: 0, count: 0, unpricedCount: 0 },
    })
  })
})

describe('tileCaption', () => {
  it('names the count and scope, and the Unpriced ones when there are any', () => {
    assert.equal(tileCaption(14, 'all months', 2), '14 appointments · all months · 2 Unpriced')
    assert.equal(tileCaption(0, 'all months', 0), '0 appointments · all months')
    assert.equal(tileCaption(6, 'this month'), '6 appointments · this month')
  })

  it('uses the singular for one appointment', () => {
    assert.equal(tileCaption(1, 'this month'), '1 appointment · this month')
  })
})

describe('appointmentsInView', () => {
  const month = [
    scheduled('billed', { paymentState: 'billed' }),
    scheduled('paid', { paymentState: 'paid' }),
    scheduled('upcoming', { status: 'scheduled' }),
    scheduled('cancelled', { status: 'cancelled' }),
  ]

  function ids(appointments: ScheduleAppointment[]): string[] {
    return appointments.map((appointment) => appointment.id)
  }

  it('shows the whole schedule without cancelled appointments unless Show cancelled is on', () => {
    assert.deepEqual(ids(appointmentsInView(month, OCTOBER)), ['billed', 'paid', 'upcoming'])
    assert.deepEqual(ids(appointmentsInView(month, { ...OCTOBER, showCancelled: true })), [
      'billed',
      'paid',
      'upcoming',
      'cancelled',
    ])
  })

  it('keeps only the Billed or Paid appointments in those views', () => {
    assert.deepEqual(ids(appointmentsInView(month, { ...OCTOBER, view: 'billed' })), ['billed'])
    assert.deepEqual(ids(appointmentsInView(month, { ...OCTOBER, view: 'paid' })), ['paid'])
  })
})

describe('getNavQuery', () => {
  const BILLED = { ...OCTOBER, view: 'billed' as const }

  it('builds on the URL when no tile navigation is pending', () => {
    assert.deepEqual(getNavQuery(createPendingTile(OCTOBER), OCTOBER), OCTOBER)
  })

  it("builds on a pending tile's view while its navigation is still in flight", () => {
    const pending = createPendingTile(OCTOBER, BILLED)

    assert.deepEqual(getNavQuery(pending, OCTOBER), BILLED)
  })

  it('builds on the URL once the tile navigation lands', () => {
    const pending = createPendingTile(OCTOBER, BILLED)

    assert.deepEqual(getNavQuery(pending, BILLED), BILLED)
  })

  // The component keeps each render's synced state, as these steps do.
  it('never revives a landed tile when the URL returns to where it was clicked (Back or "Show all")', () => {
    let pending = createPendingTile(OCTOBER, BILLED)
    pending = syncPendingTile(pending, BILLED)
    pending = syncPendingTile(pending, OCTOBER)

    assert.deepEqual(getNavQuery(pending, OCTOBER), OCTOBER)
  })

  it('drops a tile navigation that was abandoned for another URL', () => {
    const november = { ...OCTOBER, month: 11 }
    let pending = createPendingTile(OCTOBER, BILLED)
    pending = syncPendingTile(pending, november)

    assert.deepEqual(getNavQuery(pending, november), november)
    assert.deepEqual(getNavQuery(syncPendingTile(pending, OCTOBER), OCTOBER), OCTOBER)
  })
})

describe('resolveBillingSelection', () => {
  const rows = [
    { ...needsBilling('a1', 10000), clientId: 'smith' },
    { ...needsBilling('b1', 8000), clientId: 'jones' },
    { ...needsBilling('a2', 9000), clientId: 'smith' },
  ]

  it('locks nothing while no row is checked', () => {
    const { selected, lockedClientId } = resolveBillingSelection(rows, [])

    assert.deepEqual(selected, [])
    assert.equal(lockedClientId, null)
    assert.equal(isLockedRow('jones', lockedClientId), false)
  })

  it("locks every other client's rows once one row is checked", () => {
    const { lockedClientId } = resolveBillingSelection(rows, ['a1'])

    assert.equal(lockedClientId, 'smith')
    assert.equal(isLockedRow('smith', lockedClientId), false)
    assert.equal(isLockedRow('jones', lockedClientId), true)
  })

  it('keeps only checked rows still listed after a refresh, and unlocks when none remain', () => {
    const refreshed = rows.filter((row) => row.id !== 'a1')

    assert.deepEqual(
      resolveBillingSelection(refreshed, ['a1', 'a2']).selected.map((row) => row.id),
      ['a2']
    )
    assert.equal(resolveBillingSelection(refreshed, ['a1']).lockedClientId, null)
  })
})
