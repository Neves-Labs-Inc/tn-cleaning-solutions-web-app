import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { cancelInScope } from '../../src/lib/appointments/scope-cancel.ts'
import { createFakeSupabase, refusal, success } from '../invoices/fake-supabase.ts'

const SERIES_ID = 'series-1'

type VisitSeed = {
  id: string
  date: string
  status?: string
  seriesId?: string | null
  paidLine?: boolean
}

function visit(seed: VisitSeed) {
  return {
    id: seed.id,
    scheduled_date: seed.date,
    status: seed.status ?? 'scheduled',
    is_archived: false,
    recurrence_series_id: seed.seriesId === undefined ? SERIES_ID : seed.seriesId,
    invoice_lines: seed.paidLine
      ? [{ is_archived: false, cancelled_at: null, invoices: { status: 'paid' } }]
      : [],
  }
}

// Oct 7 is on a paid invoice, Oct 14 is chosen, Oct 21 is already cancelled.
function series() {
  return [
    visit({ id: 'oct-07', date: '2026-10-07', status: 'completed', paidLine: true }),
    visit({ id: 'oct-14', date: '2026-10-14' }),
    visit({ id: 'oct-21', date: '2026-10-21', status: 'cancelled' }),
    visit({ id: 'oct-28', date: '2026-10-28' }),
  ]
}

describe('cancelInScope', () => {
  it("calls cancel_appointments with the planner's ids and maps its answer", async () => {
    const { db, rpcCalls } = createFakeSupabase({ appointments: series() }, () =>
      success({ cancelled: ['oct-14', 'oct-28'], skipped: [], invoice_ids: ['inv-1'] })
    )

    const result = await cancelInScope(db, { appointmentId: 'oct-14', scope: 'series' })

    assert.deepEqual(rpcCalls, [
      { name: 'cancel_appointments', args: { p_appointment_ids: ['oct-14', 'oct-28'] } },
    ])
    assert.deepEqual(result, {
      value: {
        cancelledIds: ['oct-14', 'oct-28'],
        skipped: [{ id: 'oct-07', reason: 'paid_invoice' }],
        invoiceIds: ['inv-1'],
      },
      error: null,
    })
  })

  it("trusts the function's counts, merging its skips with the planner's without repeats", async () => {
    const { db } = createFakeSupabase({ appointments: series() }, () =>
      success({
        cancelled: ['oct-14'],
        skipped: [
          { id: 'oct-28', reason: 'paid_invoice' },
          { id: 'oct-07', reason: 'paid_invoice' },
        ],
        invoice_ids: [],
      })
    )

    const result = await cancelInScope(db, { appointmentId: 'oct-14', scope: 'series' })

    assert.deepEqual(result.value, {
      cancelledIds: ['oct-14'],
      skipped: [
        { id: 'oct-07', reason: 'paid_invoice' },
        { id: 'oct-28', reason: 'paid_invoice' },
      ],
      invoiceIds: [],
    })
  })

  it('skips the call when the planner leaves nothing to cancel', async () => {
    const { db, rpcCalls } = createFakeSupabase({ appointments: series() })

    const result = await cancelInScope(db, { appointmentId: 'oct-07', scope: 'occurrence' })

    assert.deepEqual(rpcCalls, [])
    assert.deepEqual(result.value, {
      cancelledIds: [],
      skipped: [{ id: 'oct-07', reason: 'paid_invoice' }],
      invoiceIds: [],
    })
  })

  it("answers the planner's refusal without calling the function", async () => {
    const { db, rpcCalls } = createFakeSupabase({
      appointments: [visit({ id: 'one-off', date: '2026-10-14', seriesId: null })],
    })

    const result = await cancelInScope(db, { appointmentId: 'one-off', scope: 'future' })

    assert.deepEqual(rpcCalls, [])
    assert.deepEqual(result, { value: null, error: "This appointment isn't part of a series." })
  })

  it('throws a not_admin refusal so the action can translate it', async () => {
    const { db } = createFakeSupabase({ appointments: series() }, () => refusal('not_admin'))

    await assert.rejects(cancelInScope(db, { appointmentId: 'oct-14', scope: 'occurrence' }), {
      code: 'P0001',
      details: 'not_admin',
    })
  })
})
