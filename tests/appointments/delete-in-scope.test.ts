import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { toAppointmentErrorMessage } from '../../src/lib/appointments/errors.ts'
import { deleteInScope } from '../../src/lib/appointments/scope-changes.ts'
import { createFakeSupabase, refusal, success, type RpcCall } from '../invoices/fake-supabase.ts'

const SERIES_ID = 'series-1'

type VisitSeed = {
  id: string
  date: string
  status?: string
  seriesId?: string | null
  paid?: boolean
}

function visit(seed: VisitSeed) {
  return {
    id: seed.id,
    scheduled_date: seed.date,
    status: seed.status ?? 'scheduled',
    is_archived: false,
    recurrence_series_id: seed.seriesId === undefined ? SERIES_ID : seed.seriesId,
    invoice_lines: seed.paid
      ? [{ is_archived: false, cancelled_at: null, invoices: { status: 'paid' } }]
      : [],
  }
}

// Sep 30 is on a paid invoice; the rest can go.
function series() {
  return [
    visit({ id: 'sep-30', date: '2026-09-30', status: 'completed', paid: true }),
    visit({ id: 'oct-07', date: '2026-10-07', status: 'completed' }),
    visit({ id: 'oct-14', date: '2026-10-14' }),
    visit({ id: 'oct-21', date: '2026-10-21', status: 'cancelled' }),
  ]
}

// Answers like delete_appointments: deletes every id it is sent unless told to skip it.
function answerDelete(skipIds: string[] = [], invoiceIds: string[] = []) {
  return (call: RpcCall) => {
    const ids = call.args.p_appointment_ids as string[]
    return success({
      deleted: ids.filter((id) => !skipIds.includes(id)),
      skipped: ids.filter((id) => skipIds.includes(id)).map((id) => ({ id, reason: 'paid_invoice' })),
      invoice_ids: invoiceIds,
    })
  }
}

describe('deleteInScope', () => {
  it('deletes only the chosen visit for occurrence and leaves the Series alone', async () => {
    const { db, rpcCalls } = createFakeSupabase({ appointments: series() }, answerDelete([], ['inv-1']))

    const result = await deleteInScope(db, { appointmentId: 'oct-14', scope: 'occurrence' })

    assert.deepEqual(rpcCalls, [
      {
        name: 'delete_appointments',
        args: {
          p_appointment_ids: ['oct-14'],
          p_series_id: null,
          p_series_change: 'none',
          p_end_before: null,
        },
      },
    ])
    assert.deepEqual(result, {
      value: { deletedIds: ['oct-14'], skipped: [], invoiceIds: ['inv-1'], chosenDeleted: true },
      error: null,
    })
  })

  it('ends the Series before the chosen visit for future', async () => {
    const { db, rpcCalls } = createFakeSupabase({ appointments: series() }, answerDelete())

    const result = await deleteInScope(db, { appointmentId: 'oct-14', scope: 'future' })

    assert.deepEqual(rpcCalls[0].args, {
      p_appointment_ids: ['oct-14', 'oct-21'],
      p_series_id: SERIES_ID,
      p_series_change: 'end_before',
      p_end_before: '2026-10-14',
    })
    assert.deepEqual(result.value?.deletedIds, ['oct-14', 'oct-21'])
  })

  it('removes the Series for series, sending every visit but the paid one and reporting it skipped', async () => {
    const { db, rpcCalls } = createFakeSupabase({ appointments: series() }, answerDelete())

    const result = await deleteInScope(db, { appointmentId: 'oct-14', scope: 'series' })

    assert.deepEqual(rpcCalls[0].args, {
      p_appointment_ids: ['oct-07', 'oct-14', 'oct-21'],
      p_series_id: SERIES_ID,
      p_series_change: 'delete',
      p_end_before: null,
    })
    assert.deepEqual(result.value, {
      deletedIds: ['oct-07', 'oct-14', 'oct-21'],
      skipped: [{ id: 'sep-30', reason: 'paid_invoice' }],
      invoiceIds: [],
      chosenDeleted: true,
    })
  })

  it('merges the planner and function skips once each, and says when the chosen visit was skipped', async () => {
    // The chosen visit joined a paid invoice after the read; the function skips it under lock.
    const { db } = createFakeSupabase({ appointments: series() }, () =>
      success({
        deleted: ['oct-07', 'oct-21'],
        skipped: [
          { id: 'oct-14', reason: 'paid_invoice' },
          { id: 'sep-30', reason: 'paid_invoice' },
        ],
        invoice_ids: ['inv-2'],
      })
    )

    const result = await deleteInScope(db, { appointmentId: 'oct-14', scope: 'series' })

    assert.deepEqual(result.value, {
      deletedIds: ['oct-07', 'oct-21'],
      skipped: [
        { id: 'sep-30', reason: 'paid_invoice' },
        { id: 'oct-14', reason: 'paid_invoice' },
      ],
      invoiceIds: ['inv-2'],
      chosenDeleted: false,
    })
  })

  it('refuses with the paid-invoice message when the one visit is skipped', async () => {
    const { db, rpcCalls } = createFakeSupabase({ appointments: series() })

    const result = await deleteInScope(db, { appointmentId: 'sep-30', scope: 'occurrence' })

    assert.equal(rpcCalls.length, 0)
    assert.deepEqual(result, {
      value: null,
      error: 'This appointment is on a paid invoice. Void the invoice first to delete it.',
    })
  })

  it('refuses with the every-visit message when the function skips every visit in a wider scope', async () => {
    const { db } = createFakeSupabase({ appointments: series() }, answerDelete(['oct-14', 'oct-21']))

    const result = await deleteInScope(db, { appointmentId: 'oct-14', scope: 'future' })

    assert.deepEqual(result, {
      value: null,
      error: 'Every appointment in this scope is on a paid invoice. Void the invoice first to delete them.',
    })
  })

  it('answers "Appointment not found." when the function finds none of the visits left', async () => {
    const { db } = createFakeSupabase({ appointments: series() }, () =>
      success({ deleted: [], skipped: [], invoice_ids: [] })
    )

    const result = await deleteInScope(db, { appointmentId: 'oct-14', scope: 'occurrence' })

    assert.deepEqual(result, { value: null, error: 'Appointment not found.' })
  })

  it('refuses a series scope on a visit without a Series without calling the function', async () => {
    const { db, rpcCalls } = createFakeSupabase({
      appointments: [visit({ id: 'one-off', date: '2026-10-14', seriesId: null })],
    })

    const result = await deleteInScope(db, { appointmentId: 'one-off', scope: 'future' })

    assert.equal(rpcCalls.length, 0)
    assert.deepEqual(result, { value: null, error: "This appointment isn't part of a series." })
  })

  it('throws the not_admin refusal, which reads as an admin-only message', async () => {
    const { db } = createFakeSupabase({ appointments: series() }, () => refusal('not_admin'))

    const rejection = await deleteInScope(db, { appointmentId: 'oct-14', scope: 'occurrence' }).then(
      () => null,
      (error: unknown) => error
    )

    assert.ok(rejection, 'expected deleteInScope to throw')
    assert.equal(
      toAppointmentErrorMessage(rejection as { message: string; code: string; details: string }, 'test'),
      'Only an admin can change invoices.'
    )
  })
})
