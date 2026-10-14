'use server'

import { revalidatePath } from 'next/cache'

import { messageFor, type LedgerErrorCode } from '@/lib/invoices/errors'
import { readOptionalDate } from '@/lib/invoices/form-input'
import { BULK_ISSUE_LIMIT } from '@/lib/invoices/view'
import {
  InvoiceLedger,
  type BulkIssueOutcome,
  type DraftInput,
  type LedgerResult,
  type MarkPaidInput,
  type PaymentInput,
} from '@/lib/invoices/ledger'
import { AMOUNT_TOO_LARGE_MESSAGE, parseDollarsToCents } from '@/lib/pricing/money'
import { createClient } from '@/lib/supabase/server'

// Thin by design: parse the form, check the session is an admin, call the ledger, revalidate,
// return. Every business rule lives in src/lib/invoices and the SQL functions behind it.

export type InvoiceActionResult<T = null> =
  // appointmentIds: every appointment whose Payment state, claim or price the change may have moved,
  // so the client can patch its appointments cache instead of discarding it.
  | { success: true; data: T; appointmentIds: string[] }
  | { success: false; error: string; code: LedgerErrorCode }

const INVOICES_PATH = '/solutions/invoices'
const APPOINTMENTS_PATH = '/solutions/appointments'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Caps on what a form can post: a bulk issue runs a few queries per draft in series.
const MAX_IDS = BULK_ISSUE_LIMIT
const MAX_NOTES_LENGTH = 2000
const MAX_SHORT_TEXT_LENGTH = 200
// The ledger logs the raw cause; the page gets no Postgres text.
const UNKNOWN_ERROR_MESSAGE = 'Something went wrong. Try again.'

type Refusal = { success: false; error: string; code: LedgerErrorCode }

// The inline total editor shows a bad amount under its input, not as a page-level error.
export type DraftLinePriceResult = InvoiceActionResult | (Refusal & { fieldErrors: { amount: string } })

const INVALID_AMOUNT_MESSAGE = 'Enter a valid dollar amount.'

function refuse(code: Exclude<LedgerErrorCode, 'unknown'>): Refusal {
  return { success: false, error: messageFor(code), code }
}

// One admin check for every invoice action; the SQL functions check the role again themselves.
async function requireAdmin(): Promise<{ ledger: InvoiceLedger } | { refusal: Refusal }> {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()

  if (user?.app_metadata?.role !== 'admin') return { refusal: refuse('not_admin') }
  return { ledger: new InvoiceLedger(db) }
}

// Every parser returns undefined for input it rejects, which the action refuses as invalid_input.
// A bad date is the exception: it gets its own code so the form can show it under the field, which is
// why payment and draftDetails hand back the refusal itself. invalid_input wins when both apply.

function text(formData: FormData, name: string, maxLength: number): string | undefined {
  const value = String(formData.get(name) ?? '').trim()
  return value.length <= maxLength ? value : undefined
}

function optionalText(formData: FormData, name: string, maxLength: number): string | null | undefined {
  const value = text(formData, name, maxLength)
  return value === undefined ? undefined : value || null
}

function id(formData: FormData, name: string): string | undefined {
  const value = String(formData.get(name) ?? '').trim()
  return UUID.test(value) ? value : undefined
}

function ids(formData: FormData, name: string): string[] | undefined {
  const values = [...new Set(formData.getAll(name).map((value) => String(value).trim()).filter(Boolean))]
  const isValid = values.length <= MAX_IDS && values.every((value) => UUID.test(value))
  return isValid ? values : undefined
}

// A checkbox or switch posts "on" when checked and nothing when not.
function flag(formData: FormData, name: string): boolean {
  return ['on', 'true'].includes(String(formData.get(name) ?? ''))
}

function payment(formData: FormData): { input: PaymentInput } | { refusal: Refusal } {
  const paidDate = readOptionalDate(formData, 'paid_date')
  // A blank method is passed through: SQL refuses it with method_required.
  const method = text(formData, 'payment_method', MAX_SHORT_TEXT_LENGTH)
  const reference = optionalText(formData, 'payment_reference', MAX_SHORT_TEXT_LENGTH)
  if (method === undefined || reference === undefined) return { refusal: refuse('invalid_input') }
  if (paidDate === undefined) return { refusal: refuse('invalid_paid_date') }

  return { input: { paidDate, method, reference } }
}

// Each appointment's amount is posted as amount_<appointment id>, in dollars. One that is blank,
// not a valid amount or over the cap makes every line undefined: the caller refuses it as unpriced_line.
function markPaidLines(formData: FormData, appointmentIds: string[]): MarkPaidInput['lines'] | undefined {
  const lines = appointmentIds.flatMap((appointmentId) => {
    const amount = parseDollarsToCents(String(formData.get(`amount_${appointmentId}`) ?? ''))
    return 'error' in amount ? [] : [{ appointmentId, amountCents: amount.cents }]
  })
  return lines.length === appointmentIds.length ? lines : undefined
}

// Only the details form's Save posts write_details. A line change doesn't, so a page with stale
// details can't overwrite a due date or notes saved elsewhere: null leaves them as stored.
function draftDetails(formData: FormData): { details: DraftInput | null } | { refusal: Refusal } {
  if (!flag(formData, 'write_details')) return { details: null }

  const dueDate = readOptionalDate(formData, 'due_date')
  const notes = optionalText(formData, 'notes', MAX_NOTES_LENGTH)
  if (notes === undefined) return { refusal: refuse('invalid_input') }
  if (dueDate === undefined) return { refusal: refuse('invalid_due_date') }

  return { details: { dueDate, notes } }
}

// Called only with an id the parser accepted as a UUID, so the detail path is never free text.
function revalidateInvoicing(invoiceId?: string) {
  revalidatePath(INVOICES_PATH)
  revalidatePath(`${INVOICES_PATH}/receivables`)
  revalidatePath(`${INVOICES_PATH}/payment-methods`)
  revalidatePath('/(internal)/solutions/(admin)/clients/[id]/(overview)', 'page')
  revalidatePath('/solutions/dashboard')
  if (invoiceId) {
    revalidatePath(`${INVOICES_PATH}/${invoiceId}`)
  }
}

function toRefusal(failure: Extract<LedgerResult<unknown>, { ok: false }>): Refusal {
  const error = failure.code === 'unknown' ? UNKNOWN_ERROR_MESSAGE : failure.message
  return { success: false, error, code: failure.code }
}

function toActionResult<T>(result: LedgerResult<T>, appointmentIds: string[] = []): InvoiceActionResult<T> {
  if (result.ok) return { success: true, data: result.data, appointmentIds }
  return toRefusal(result)
}

// The appointments on these invoices, read before the change: a line can leave the invoice with it.
// A failed read refuses here, before anything is written.
async function readTouched(
  ledger: InvoiceLedger,
  invoiceIds: string[]
): Promise<{ appointmentIds: string[] } | { refusal: Refusal }> {
  const result = await ledger.appointmentIdsOn(invoiceIds)
  if (!result.ok) return { refusal: toRefusal(result) }
  return { appointmentIds: result.data }
}

// Returns the new id instead of redirecting, so the page can toast "Draft created" before it navigates.
export async function createInvoice(_previous: unknown, formData: FormData): Promise<InvoiceActionResult<{ id: string }>> {
  const clientId = id(formData, 'client_id')
  const appointmentIds = ids(formData, 'appointment_ids')
  const dueDate = readOptionalDate(formData, 'due_date')
  const notes = optionalText(formData, 'notes', MAX_NOTES_LENGTH)
  if (!clientId || !appointmentIds || notes === undefined) return refuse('invalid_input')
  if (dueDate === undefined) return refuse('invalid_due_date')

  const admin = await requireAdmin()
  if ('refusal' in admin) return admin.refusal

  const result = await admin.ledger.createDraft({ clientId, appointmentIds, dueDate, notes })
  if (!result.ok) return toActionResult(result)

  revalidateInvoicing()
  return toActionResult(result, appointmentIds)
}

// Takes the visits added and removed against what the page loaded, and the due date and notes only
// from Save (see draftDetails).
export async function updateDraft(
  _previous: unknown,
  formData: FormData
): Promise<InvoiceActionResult<{ isDeleted: boolean }>> {
  const invoiceId = id(formData, 'invoice_id')
  const addAppointmentIds = ids(formData, 'add_appointment_ids')
  const removeAppointmentIds = ids(formData, 'remove_appointment_ids')
  const parsedDetails = draftDetails(formData)
  if (!invoiceId || !addAppointmentIds || !removeAppointmentIds) return refuse('invalid_input')
  if ('refusal' in parsedDetails) return parsedDetails.refusal
  const { details } = parsedDetails

  const admin = await requireAdmin()
  if ('refusal' in admin) return admin.refusal

  const result = await admin.ledger.updateDraft(invoiceId, { addAppointmentIds, removeAppointmentIds, details })
  // Any revalidation re-renders the open page with the action's response, and a deleted draft's page
  // is not-found: it would flash before the client reaches the ledger. The ledger and the other
  // pages are dynamic, so they read fresh when navigated to.
  const isDeleted = result.ok && result.data.isDeleted
  if (!isDeleted) revalidateInvoicing(invoiceId)
  return toActionResult(result, [...addAppointmentIds, ...removeAppointmentIds])
}

// Posts invoice_id, appointment_id and either amount (dollars; $0 is valid) or clear=1, which
// drops the override so the line goes back to the Live price. A blank amount is not a clear.
export async function setDraftLinePrice(_previous: unknown, formData: FormData): Promise<DraftLinePriceResult> {
  const invoiceId = id(formData, 'invoice_id')
  const appointmentId = id(formData, 'appointment_id')
  if (!invoiceId || !appointmentId) return refuse('invalid_input')

  // Auth before parsing the amount, so an anonymous caller can't probe its validation messages.
  const admin = await requireAdmin()
  if ('refusal' in admin) return admin.refusal

  const isClear = String(formData.get('clear') ?? '') === '1'
  const amount = isClear ? null : parseDollarsToCents(String(formData.get('amount') ?? ''))
  if (amount && 'error' in amount) {
    const message = amount.error === 'too_large' ? AMOUNT_TOO_LARGE_MESSAGE : INVALID_AMOUNT_MESSAGE
    return { ...refuse('invalid_input'), error: message, fieldErrors: { amount: message } }
  }
  const amountCents = amount ? amount.cents : null

  const result = await admin.ledger.setDraftLinePrice(invoiceId, appointmentId, amountCents)
  if (result.ok) {
    // Both ids passed the UUID parser, so the paths are never free text.
    revalidateInvoicing(invoiceId)
    revalidatePath(`${APPOINTMENTS_PATH}/${appointmentId}`)
  }
  return toActionResult(result, [appointmentId])
}

export async function issueInvoice(
  _previous: unknown,
  formData: FormData
): Promise<InvoiceActionResult<{ invoiceNumber: string }>> {
  const invoiceId = id(formData, 'invoice_id')
  const dueDate = readOptionalDate(formData, 'due_date')
  if (!invoiceId) return refuse('invalid_input')
  if (dueDate === undefined) return refuse('invalid_due_date')

  const admin = await requireAdmin()
  if ('refusal' in admin) return admin.refusal

  const touched = await readTouched(admin.ledger, [invoiceId])
  if ('refusal' in touched) return touched.refusal

  const result = await admin.ledger.issue(invoiceId, dueDate)
  revalidateInvoicing(invoiceId)
  return toActionResult(result, touched.appointmentIds)
}

export async function bulkIssueInvoices(_previous: unknown, formData: FormData): Promise<InvoiceActionResult<BulkIssueOutcome>> {
  const invoiceIds = ids(formData, 'invoice_ids')
  const dueDate = readOptionalDate(formData, 'due_date')
  if (!invoiceIds || invoiceIds.length === 0) return refuse('invalid_input')
  if (dueDate === undefined) return refuse('invalid_due_date')

  const admin = await requireAdmin()
  if ('refusal' in admin) return admin.refusal

  // Every requested draft, not only the ones that issue: re-reading a skipped draft's rows is harmless.
  const touched = await readTouched(admin.ledger, invoiceIds)
  if ('refusal' in touched) return touched.refusal

  const result = await admin.ledger.bulkIssue(invoiceIds, dueDate)
  revalidateInvoicing()
  return toActionResult(result, touched.appointmentIds)
}

export async function voidInvoice(_previous: unknown, formData: FormData): Promise<InvoiceActionResult> {
  const invoiceId = id(formData, 'invoice_id')
  if (!invoiceId) return refuse('invalid_input')

  const admin = await requireAdmin()
  if ('refusal' in admin) return admin.refusal

  const touched = await readTouched(admin.ledger, [invoiceId])
  if ('refusal' in touched) return touched.refusal

  const result = await admin.ledger.voidInvoice(invoiceId)
  revalidateInvoicing(invoiceId)
  return toActionResult(result, touched.appointmentIds)
}

export async function recordPayment(_previous: unknown, formData: FormData): Promise<InvoiceActionResult> {
  const invoiceId = id(formData, 'invoice_id')
  const parsedPayment = payment(formData)
  if (!invoiceId) return refuse('invalid_input')
  if ('refusal' in parsedPayment) return parsedPayment.refusal
  const { input } = parsedPayment

  const admin = await requireAdmin()
  if ('refusal' in admin) return admin.refusal

  const touched = await readTouched(admin.ledger, [invoiceId])
  if ('refusal' in touched) return touched.refusal

  const result = await admin.ledger.recordPayment(invoiceId, input)
  revalidateInvoicing(invoiceId)
  return toActionResult(result, touched.appointmentIds)
}

// Mark paid: the appointments' new invoice is created issued and paid. Posts client_id,
// appointment_ids, amount_<id> per appointment and the payment fields of the Record payment form.
export async function markAppointmentsPaid(
  _previous: unknown,
  formData: FormData
): Promise<InvoiceActionResult<{ invoiceId: string; invoiceNumber: string }>> {
  const clientId = id(formData, 'client_id')
  const appointmentIds = ids(formData, 'appointment_ids')
  const parsedPayment = payment(formData)
  if (!clientId || !appointmentIds) return refuse('invalid_input')
  if ('refusal' in parsedPayment) return parsedPayment.refusal
  const { input } = parsedPayment
  if (appointmentIds.length === 0) return refuse('empty_lines')

  // Auth before parsing amounts, so an anonymous caller can't make the server do that work.
  const admin = await requireAdmin()
  if ('refusal' in admin) return admin.refusal

  const lines = markPaidLines(formData, appointmentIds)
  if (!lines) return refuse('unpriced_line')

  const result = await admin.ledger.markPaid({ clientId, lines, ...input })
  if (!result.ok) return toActionResult(result)

  // The ids passed the UUID parser, so the detail paths are never free text.
  revalidateInvoicing(result.data.invoiceId)
  revalidatePath(APPOINTMENTS_PATH)
  for (const appointmentId of appointmentIds) {
    revalidatePath(`${APPOINTMENTS_PATH}/${appointmentId}`)
  }
  return toActionResult(result, appointmentIds)
}

export async function updatePayment(_previous: unknown, formData: FormData): Promise<InvoiceActionResult> {
  const invoiceId = id(formData, 'invoice_id')
  const parsedPayment = payment(formData)
  if (!invoiceId) return refuse('invalid_input')
  if ('refusal' in parsedPayment) return parsedPayment.refusal
  const { input } = parsedPayment

  const admin = await requireAdmin()
  if ('refusal' in admin) return admin.refusal

  const touched = await readTouched(admin.ledger, [invoiceId])
  if ('refusal' in touched) return touched.refusal

  const result = await admin.ledger.updatePayment(invoiceId, input)
  revalidateInvoicing(invoiceId)
  return toActionResult(result, touched.appointmentIds)
}

export async function undoPayment(_previous: unknown, formData: FormData): Promise<InvoiceActionResult> {
  const invoiceId = id(formData, 'invoice_id')
  if (!invoiceId) return refuse('invalid_input')

  const admin = await requireAdmin()
  if ('refusal' in admin) return admin.refusal

  const touched = await readTouched(admin.ledger, [invoiceId])
  if ('refusal' in touched) return touched.refusal

  const result = await admin.ledger.undoPayment(invoiceId)
  revalidateInvoicing(invoiceId)
  return toActionResult(result, touched.appointmentIds)
}

export async function archiveInvoice(_previous: unknown, formData: FormData): Promise<InvoiceActionResult> {
  const invoiceId = id(formData, 'invoice_id')
  if (!invoiceId) return refuse('invalid_input')

  const admin = await requireAdmin()
  if ('refusal' in admin) return admin.refusal

  const touched = await readTouched(admin.ledger, [invoiceId])
  if ('refusal' in touched) return touched.refusal

  const result = await admin.ledger.archive(invoiceId)
  revalidateInvoicing(invoiceId)
  return toActionResult(result, touched.appointmentIds)
}

export async function unarchiveInvoice(_previous: unknown, formData: FormData): Promise<InvoiceActionResult> {
  const invoiceId = id(formData, 'invoice_id')
  if (!invoiceId) return refuse('invalid_input')

  const admin = await requireAdmin()
  if ('refusal' in admin) return admin.refusal

  const touched = await readTouched(admin.ledger, [invoiceId])
  if ('refusal' in touched) return touched.refusal

  const result = await admin.ledger.unarchive(invoiceId)
  revalidateInvoicing(invoiceId)
  return toActionResult(result, touched.appointmentIds)
}

// Posts invoice_id and internal_note. Allowed at any status and while archived; blank clears it.
export async function setInternalNote(_previous: unknown, formData: FormData): Promise<InvoiceActionResult> {
  const invoiceId = id(formData, 'invoice_id')
  const internalNote = optionalText(formData, 'internal_note', MAX_NOTES_LENGTH)
  if (!invoiceId || internalNote === undefined) return refuse('invalid_input')

  const admin = await requireAdmin()
  if ('refusal' in admin) return admin.refusal

  const result = await admin.ledger.setInternalNote(invoiceId, internalNote)
  if (result.ok) revalidateInvoicing(invoiceId)
  return toActionResult(result)
}

export async function setClientAutomaticInvoicing(_previous: unknown, formData: FormData): Promise<InvoiceActionResult> {
  const clientId = id(formData, 'client_id')
  if (!clientId) return refuse('invalid_input')

  const admin = await requireAdmin()
  if ('refusal' in admin) return admin.refusal

  const result = await admin.ledger.setAutomaticInvoicing(clientId, flag(formData, 'automatic_invoicing'))
  revalidateInvoicing()
  return toActionResult(result)
}

export async function renamePaymentMethod(_previous: unknown, formData: FormData): Promise<InvoiceActionResult> {
  const methodId = id(formData, 'payment_method_id')
  const name = text(formData, 'name', MAX_SHORT_TEXT_LENGTH)
  if (!methodId || name === undefined) return refuse('invalid_input')

  const admin = await requireAdmin()
  if ('refusal' in admin) return admin.refusal

  const result = await admin.ledger.renamePaymentMethod(methodId, name)
  revalidateInvoicing()
  return toActionResult(result)
}

export async function setPaymentMethodHidden(_previous: unknown, formData: FormData): Promise<InvoiceActionResult> {
  const methodId = id(formData, 'payment_method_id')
  if (!methodId) return refuse('invalid_input')

  const admin = await requireAdmin()
  if ('refusal' in admin) return admin.refusal

  const result = await admin.ledger.setPaymentMethodHidden(methodId, flag(formData, 'is_hidden'))
  revalidateInvoicing()
  return toActionResult(result)
}
