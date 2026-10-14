import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { previewScope } from '../../src/lib/appointments/scope-changes.ts'
import { createFakeSupabase } from '../invoices/fake-supabase.ts'

const SERIES_ID = 'series-1'

type LineSeed = { invoiceStatus: string; isArchived?: boolean; isCancelled?: boolean }

type VisitSeed = {
  id: string
  date: string
  status?: string
  isArchived?: boolean
  seriesId?: string | null
  lines?: LineSeed[]
}

function visit(seed: VisitSeed) {
  return {
    id: seed.id,
    scheduled_date: seed.date,
    status: seed.status ?? 'scheduled',
    is_archived: seed.isArchived ?? false,
    recurrence_series_id: seed.seriesId === undefined ? SERIES_ID : seed.seriesId,
    invoice_lines: (seed.lines ?? []).map((line) => ({
      is_archived: line.isArchived ?? false,
      cancelled_at: line.isCancelled ? '2026-10-01T12:00:00Z' : null,
      invoices: { status: line.invoiceStatus },
    })),
  }
}

// Sep 30 is paid, Oct 7 completed and invoiced, Oct 14 chosen, Oct 21 cancelled, Oct 28 archived.
function mixedSeries() {
  return [
    visit({ id: 'sep-30', date: '2026-09-30', status: 'completed', lines: [{ invoiceStatus: 'paid' }] }),
    visit({ id: 'oct-07', date: '2026-10-07', status: 'completed', lines: [{ invoiceStatus: 'issued' }] }),
    visit({ id: 'oct-14', date: '2026-10-14' }),
    visit({
      id: 'oct-21',
      date: '2026-10-21',
      status: 'cancelled',
      lines: [{ invoiceStatus: 'paid', isCancelled: true }],
    }),
    visit({ id: 'oct-28', date: '2026-10-28', isArchived: true }),
    visit({ id: 'other-series', date: '2026-10-15', seriesId: 'series-2' }),
  ]
}

describe('previewScope', () => {
  it('counts a whole-series cancel, leaving the cancelled visit out and skipping the paid one', async () => {
    const { db } = createFakeSupabase({ appointments: mixedSeries() })

    const preview = await previewScope(db, { appointmentId: 'oct-14', scope: 'series', action: 'cancel' })

    assert.deepEqual(preview, {
      value: {
        visitCount: 4,
        actCount: 2,
        skipped: [{ id: 'sep-30', reason: 'paid_invoice' }],
        chosenDate: '2026-10-14',
        seriesId: SERIES_ID,
      },
      error: null,
    })
  })

  it('counts a this-and-following delete, skipping the visit with a Cancelled line on a paid invoice', async () => {
    const { db } = createFakeSupabase({ appointments: mixedSeries() })

    const preview = await previewScope(db, { appointmentId: 'oct-14', scope: 'future', action: 'delete' })

    assert.deepEqual(preview.value, {
      visitCount: 2,
      actCount: 1,
      skipped: [{ id: 'oct-21', reason: 'paid_invoice' }],
      chosenDate: '2026-10-14',
      seriesId: SERIES_ID,
    })
  })

  it('counts only the chosen visit for occurrence', async () => {
    const { db } = createFakeSupabase({ appointments: mixedSeries() })

    const preview = await previewScope(db, { appointmentId: 'oct-07', scope: 'occurrence', action: 'delete' })

    assert.deepEqual(preview.value, {
      visitCount: 1,
      actCount: 1,
      skipped: [],
      chosenDate: '2026-10-07',
      seriesId: SERIES_ID,
    })
  })

  it('refuses a series scope on a visit without a Series', async () => {
    const { db } = createFakeSupabase({
      appointments: [visit({ id: 'one-off', date: '2026-10-14', seriesId: null })],
    })

    const preview = await previewScope(db, { appointmentId: 'one-off', scope: 'series', action: 'cancel' })

    assert.deepEqual(preview, { value: null, error: "This appointment isn't part of a series." })
  })

  it('answers "Appointment not found." for an archived or missing visit', async () => {
    const { db } = createFakeSupabase({ appointments: mixedSeries() })

    for (const appointmentId of ['oct-28', 'missing']) {
      const preview = await previewScope(db, { appointmentId, scope: 'occurrence', action: 'cancel' })

      assert.deepEqual(preview, { value: null, error: 'Appointment not found.' })
    }
  })

  it('reads a long Series in pages', async () => {
    const visits = Array.from({ length: 1200 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 0, 1) + index * 86_400_000).toISOString().slice(0, 10)
      return visit({ id: `visit-${String(index).padStart(4, '0')}`, date })
    })
    const { db } = createFakeSupabase({ appointments: visits })

    const preview = await previewScope(db, { appointmentId: 'visit-0000', scope: 'series', action: 'delete' })

    assert.equal(preview.value?.actCount, 1200)
  })

  it('throws when the database read fails', async () => {
    const { db } = createFakeSupabase({ appointments: mixedSeries() }, undefined, ['appointments'])

    await assert.rejects(previewScope(db, { appointmentId: 'oct-14', scope: 'series', action: 'cancel' }))
  })
})
