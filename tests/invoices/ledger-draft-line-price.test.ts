import assert from 'node:assert/strict'
import { test } from 'node:test'

import { messageFor } from '../../src/lib/invoices/errors.ts'
import { InvoiceLedger } from '../../src/lib/invoices/ledger.ts'
import { createFakeSupabase } from './fake-supabase.ts'

const SILENT_LOGGER = { warn: () => {}, error: () => {} }

type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'void'
type LineOptions = { isReleased?: boolean; isCancelled?: boolean }

function invoice(id: string, status: InvoiceStatus = 'draft') {
  return { id, status, is_archived: false }
}

function appointment(id: string, priceOverrideCents: number | null = null) {
  return { id, price_override_cents: priceOverrideCents }
}

function line(invoiceId: string, appointmentId: string, options: LineOptions = {}) {
  return {
    invoice_id: invoiceId,
    appointment_id: appointmentId,
    is_archived: options.isReleased ?? false,
    cancelled_at: options.isCancelled ? '2026-10-02T10:00:00Z' : null,
  }
}

function setup(tables: {
  invoices: ReturnType<typeof invoice>[]
  appointments: ReturnType<typeof appointment>[]
  invoice_appointments: ReturnType<typeof line>[]
}) {
  const fake = createFakeSupabase(tables)
  return { ...fake, ledger: new InvoiceLedger(fake.db, SILENT_LOGGER) }
}

function overrideOf(tables: Record<string, Array<Record<string, unknown>>>, appointmentId: string): unknown {
  return tables.appointments.find((row) => row.id === appointmentId)?.price_override_cents
}

test('setDraftLinePrice saves the amount as the appointment override', async () => {
  const { ledger, tables } = setup({
    invoices: [invoice('inv-1')],
    appointments: [appointment('appt-1')],
    invoice_appointments: [line('inv-1', 'appt-1')],
  })

  const result = await ledger.setDraftLinePrice('inv-1', 'appt-1', 12500)

  assert.deepEqual(result, { ok: true, data: null })
  assert.equal(overrideOf(tables, 'appt-1'), 12500)
})

test('setDraftLinePrice clears the override with null', async () => {
  const { ledger, tables } = setup({
    invoices: [invoice('inv-1')],
    appointments: [appointment('appt-1', 12500)],
    invoice_appointments: [line('inv-1', 'appt-1')],
  })

  const result = await ledger.setDraftLinePrice('inv-1', 'appt-1', null)

  assert.deepEqual(result, { ok: true, data: null })
  assert.equal(overrideOf(tables, 'appt-1'), null)
})

test('setDraftLinePrice refuses on an issued invoice and leaves the override alone', async () => {
  const { ledger, tables } = setup({
    invoices: [invoice('inv-1', 'issued')],
    appointments: [appointment('appt-1', 9000)],
    invoice_appointments: [line('inv-1', 'appt-1')],
  })

  const result = await ledger.setDraftLinePrice('inv-1', 'appt-1', 12500)

  assert.deepEqual(result, { ok: false, code: 'not_draft', message: messageFor('not_draft') })
  assert.equal(overrideOf(tables, 'appt-1'), 9000)
})

test('setDraftLinePrice refuses a cancelled line', async () => {
  const { ledger, tables } = setup({
    invoices: [invoice('inv-1')],
    appointments: [appointment('appt-1')],
    invoice_appointments: [line('inv-1', 'appt-1', { isCancelled: true })],
  })

  const result = await ledger.setDraftLinePrice('inv-1', 'appt-1', 12500)

  assert.deepEqual(result, { ok: false, code: 'line_not_on_draft', message: messageFor('line_not_on_draft') })
  assert.equal(overrideOf(tables, 'appt-1'), null)
})

test('setDraftLinePrice refuses a released line', async () => {
  const { ledger, tables } = setup({
    invoices: [invoice('inv-1')],
    appointments: [appointment('appt-1')],
    invoice_appointments: [line('inv-1', 'appt-1', { isReleased: true })],
  })

  const result = await ledger.setDraftLinePrice('inv-1', 'appt-1', 12500)

  assert.deepEqual(result, { ok: false, code: 'line_not_on_draft', message: messageFor('line_not_on_draft') })
  assert.equal(overrideOf(tables, 'appt-1'), null)
})

test('setDraftLinePrice refuses an appointment that is on another invoice', async () => {
  const { ledger, tables } = setup({
    invoices: [invoice('inv-1'), invoice('inv-2')],
    appointments: [appointment('appt-1'), appointment('appt-2')],
    invoice_appointments: [line('inv-1', 'appt-1'), line('inv-2', 'appt-2')],
  })

  const result = await ledger.setDraftLinePrice('inv-1', 'appt-2', 12500)

  assert.deepEqual(result, { ok: false, code: 'line_not_on_draft', message: messageFor('line_not_on_draft') })
  assert.equal(overrideOf(tables, 'appt-2'), null)
})

test('setDraftLinePrice refuses an invoice that does not exist', async () => {
  const { ledger } = setup({ invoices: [], appointments: [appointment('appt-1')], invoice_appointments: [] })

  const result = await ledger.setDraftLinePrice('inv-1', 'appt-1', 12500)

  assert.deepEqual(result, { ok: false, code: 'invoice_not_found', message: messageFor('invoice_not_found') })
})

test('setDraftLinePrice leaves a second appointment override unchanged', async () => {
  const { ledger, tables } = setup({
    invoices: [invoice('inv-1')],
    appointments: [appointment('appt-1'), appointment('appt-2', 7000)],
    invoice_appointments: [line('inv-1', 'appt-1'), line('inv-1', 'appt-2')],
  })

  await ledger.setDraftLinePrice('inv-1', 'appt-1', 12500)

  assert.equal(overrideOf(tables, 'appt-1'), 12500)
  assert.equal(overrideOf(tables, 'appt-2'), 7000)
})
