import assert from 'node:assert/strict'
import { test } from 'node:test'

import { messageFor } from '../../src/lib/invoices/errors.ts'
import { InvoiceLedger } from '../../src/lib/invoices/ledger.ts'
import { createFakeSupabase, refusal, success, type RpcCall, type RpcResponse } from './fake-supabase.ts'

const CLIENT_ID = 'client-1'
const JOB_ID = 'job-1'
const DUE_DATE = '2026-10-31'

const SILENT_LOGGER = { warn: () => {}, error: () => {} }

// 09:00-11:00 is 120 minutes; at the $45/h Job rate that is $90.00.
function visit(id: string, options: { isUnpriced?: boolean } = {}) {
  return {
    id,
    client_id: CLIENT_ID,
    job_id: JOB_ID,
    status: 'completed',
    scheduled_date: '2026-10-01',
    scheduled_start_time: '09:00:00',
    scheduled_end_time: '11:00:00',
    price_override_cents: null,
    pricing_job: options.isUnpriced ? null : { hourly_rate_cents: 4500 },
  }
}

function draftLine(invoiceId: string, appointmentId: string) {
  return {
    invoice_id: invoiceId,
    appointment_id: appointmentId,
    billed_amount_cents: null,
    is_archived: false,
    cancelled_at: null,
  }
}

function setup(
  tables: { appointments: ReturnType<typeof visit>[]; invoice_appointments: ReturnType<typeof draftLine>[] },
  answerRpc?: (call: RpcCall, callIndex: number) => RpcResponse,
  failingTables: string[] = []
) {
  const fake = createFakeSupabase(tables, answerRpc, failingTables)
  return { ...fake, ledger: new InvoiceLedger(fake.db, SILENT_LOGGER) }
}

test('issue prices every line at its Live price and returns the Invoice number', async () => {
  const { ledger, rpcCalls } = setup(
    {
      appointments: [visit('appt-1'), visit('appt-2')],
      invoice_appointments: [draftLine('inv-1', 'appt-1'), draftLine('inv-1', 'appt-2')],
    },
    () => success('INV-001-SMI2026')
  )

  const result = await ledger.issue('inv-1', DUE_DATE)

  assert.deepEqual(result, { ok: true, data: { invoiceNumber: 'INV-001-SMI2026' } })
  assert.deepEqual(rpcCalls, [
    {
      name: 'invoice_issue',
      args: {
        p_invoice_id: 'inv-1',
        p_due_date: DUE_DATE,
        p_lines: [
          { appointment_id: 'appt-1', billed_amount_cents: 9000, billed_rate_cents: 4500, billed_minutes: 120 },
          { appointment_id: 'appt-2', billed_amount_cents: 9000, billed_rate_cents: 4500, billed_minutes: 120 },
        ],
      },
    },
  ])
})

test('issue refuses an Unpriced line itself, without calling SQL', async () => {
  const { ledger, rpcCalls } = setup({
    appointments: [visit('appt-1'), visit('appt-2', { isUnpriced: true })],
    invoice_appointments: [draftLine('inv-1', 'appt-1'), draftLine('inv-1', 'appt-2')],
  })

  const result = await ledger.issue('inv-1', DUE_DATE)

  assert.deepEqual(result, { ok: false, code: 'unpriced_line', message: messageFor('unpriced_line') })
  assert.equal(rpcCalls.length, 0)
})

test('issue re-reads and re-prices the draft once when it changed meanwhile, then succeeds', async () => {
  const tables = {
    appointments: [visit('appt-1'), visit('appt-2')],
    invoice_appointments: [draftLine('inv-1', 'appt-1')],
  }
  const { ledger, rpcCalls } = setup(tables, (_call, callIndex) => {
    if (callIndex > 0) return success('INV-002-SMI2026')

    // A completion joined the draft between our read and SQL's lock.
    tables.invoice_appointments.push(draftLine('inv-1', 'appt-2'))
    return refusal('draft_changed')
  })

  const result = await ledger.issue('inv-1', DUE_DATE)

  assert.deepEqual(result, { ok: true, data: { invoiceNumber: 'INV-002-SMI2026' } })
  assert.equal(rpcCalls.length, 2)
  const retriedIds = (rpcCalls[1].args.p_lines as Array<{ appointment_id: string }>).map((line) => line.appointment_id)
  assert.deepEqual(retriedIds, ['appt-1', 'appt-2'])
})

test('issue retries exactly once and surfaces a second draft_changed', async () => {
  const { ledger, rpcCalls } = setup(
    { appointments: [visit('appt-1')], invoice_appointments: [draftLine('inv-1', 'appt-1')] },
    () => refusal('draft_changed')
  )

  const result = await ledger.issue('inv-1', DUE_DATE)

  assert.deepEqual(result, { ok: false, code: 'draft_changed', message: messageFor('draft_changed') })
  assert.equal(rpcCalls.length, 2)
})

test('issue surfaces any other refusal without retrying', async () => {
  const { ledger, rpcCalls } = setup(
    { appointments: [visit('appt-1')], invoice_appointments: [draftLine('inv-1', 'appt-1')] },
    () => refusal('due_before_issue')
  )

  const result = await ledger.issue('inv-1', '2020-01-01')

  assert.deepEqual(result, { ok: false, code: 'due_before_issue', message: messageFor('due_before_issue') })
  assert.equal(rpcCalls.length, 1)
})

test('bulkIssue issues the priced drafts and skips Unpriced ones without calling SQL for them', async () => {
  const { ledger, rpcCalls } = setup(
    {
      appointments: [visit('appt-1'), visit('appt-2', { isUnpriced: true }), visit('appt-3')],
      invoice_appointments: [draftLine('inv-1', 'appt-1'), draftLine('inv-2', 'appt-2'), draftLine('inv-3', 'appt-3')],
    },
    (call) => success(`NUM-${call.args.p_invoice_id}`)
  )

  const result = await ledger.bulkIssue(['inv-1', 'inv-2', 'inv-3'], null)

  assert.deepEqual(result, {
    ok: true,
    data: {
      issued: ['inv-1', 'inv-3'],
      skipped: [{ id: 'inv-2', code: 'unpriced_line', message: messageFor('unpriced_line') }],
    },
  })
  assert.deepEqual(
    rpcCalls.map((call) => call.args.p_invoice_id),
    ['inv-1', 'inv-3']
  )
})

test('bulkIssue reports any other refusal per draft and carries on with the rest', async () => {
  const { ledger } = setup(
    {
      appointments: [visit('appt-1'), visit('appt-2')],
      invoice_appointments: [draftLine('inv-1', 'appt-1'), draftLine('inv-2', 'appt-2')],
    },
    (call) => (call.args.p_invoice_id === 'inv-1' ? refusal('archived_invoice') : success('INV-001-SMI2026'))
  )

  const result = await ledger.bulkIssue(['inv-1', 'inv-2'], DUE_DATE)

  assert.deepEqual(result, {
    ok: true,
    data: {
      issued: ['inv-2'],
      skipped: [{ id: 'inv-1', code: 'archived_invoice', message: messageFor('archived_invoice') }],
    },
  })
})

test('issue returns a failed read as an unknown error instead of throwing, without calling SQL', async () => {
  const { ledger, rpcCalls } = setup(
    { appointments: [visit('appt-1')], invoice_appointments: [draftLine('inv-1', 'appt-1')] },
    undefined,
    ['appointments']
  )

  const result = await ledger.issue('inv-1', DUE_DATE)

  assert.deepEqual(result, { ok: false, code: 'unknown', message: 'connection reset' })
  assert.equal(rpcCalls.length, 0)
})

test('bulkIssue keeps going and reports each draft whose read failed', async () => {
  const { ledger } = setup(
    { appointments: [visit('appt-1')], invoice_appointments: [draftLine('inv-1', 'appt-1')] },
    undefined,
    ['appointments']
  )

  const result = await ledger.bulkIssue(['inv-1', 'inv-2'], DUE_DATE)

  assert.deepEqual(result, {
    ok: true,
    data: {
      issued: ['inv-2'],
      skipped: [{ id: 'inv-1', code: 'unknown', message: 'connection reset' }],
    },
  })
})
