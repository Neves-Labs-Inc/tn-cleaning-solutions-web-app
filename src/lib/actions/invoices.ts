'use server'

import { revalidatePath } from 'next/cache'

import { messageFor, type LedgerErrorCode } from '@/lib/invoices/errors'
import { BULK_ISSUE_LIMIT } from '@/lib/invoices/view'
import { InvoiceLedger, type BulkIssueOutcome, type LedgerResult, type PaymentInput } from '@/lib/invoices/ledger'
import { createClient } from '@/lib/supabase/server'

// Thin by design: parse the form, check the session is an admin, call the ledger, revalidate,
// return. Every business rule lives in src/lib/invoices and the SQL functions behind it.

export type InvoiceActionResult<T = null> =
  | { success: true; data: T }
  | { success: false; error: string; code: LedgerErrorCode }

const INVOICES_PATH = '/solutions/invoices'
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Caps on what a form can post: a bulk issue runs a few queries per draft in series.
const MAX_IDS = BULK_ISSUE_LIMIT
const MAX_NOTES_LENGTH = 2000
const MAX_SHORT_TEXT_LENGTH = 200
// The ledger logs the raw cause; the page gets no Postgres text.
const UNKNOWN_ERROR_MESSAGE = 'Something went wrong. Try again.'

type Refusal = { success: false; error: string; code: LedgerErrorCode }

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

// A blank date is null.
function optionalDate(formData: FormData, name: string): string | null | undefined {
  const value = String(formData.get(name) ?? '').trim()
  if (!value) return null
  return ISO_DATE.test(value) ? value : undefined
}

// A checkbox or switch posts "on" when checked and nothing when not.
function flag(formData: FormData, name: string): boolean {
  return ['on', 'true'].includes(String(formData.get(name) ?? ''))
}

function payment(formData: FormData): PaymentInput | undefined {
  const paidDate = optionalDate(formData, 'paid_date')
  // A blank method is passed through: SQL refuses it with method_required.
  const method = text(formData, 'payment_method', MAX_SHORT_TEXT_LENGTH)
  const reference = optionalText(formData, 'payment_reference', MAX_SHORT_TEXT_LENGTH)
  if (paidDate === undefined || method === undefined || reference === undefined) return undefined

  return { paidDate, method, reference }
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

function toActionResult<T>(result: LedgerResult<T>): InvoiceActionResult<T> {
  if (result.ok) return { success: true, data: result.data }

  const error = result.code === 'unknown' ? UNKNOWN_ERROR_MESSAGE : result.message
  return { success: false, error, code: result.code }
}

// Returns the new id instead of redirecting, so the page can toast "Draft created" before it navigates.
export async function createInvoice(_previous: unknown, formData: FormData): Promise<InvoiceActionResult<{ id: string }>> {
  const clientId = id(formData, 'client_id')
  const appointmentIds = ids(formData, 'appointment_ids')
  const dueDate = optionalDate(formData, 'due_date')
  const notes = optionalText(formData, 'notes', MAX_NOTES_LENGTH)
  if (!clientId || !appointmentIds || dueDate === undefined || notes === undefined) return refuse('invalid_input')

  const admin = await requireAdmin()
  if ('refusal' in admin) return admin.refusal

  const result = await admin.ledger.createDraft({ clientId, appointmentIds, dueDate, notes })
  if (!result.ok) return toActionResult(result)

  revalidateInvoicing()
  return toActionResult(result)
}

// Takes the visits added and removed against what the page loaded, and always the current due
// date and notes: SQL overwrites both, so a missing value would clear it.
export async function updateDraft(
  _previous: unknown,
  formData: FormData
): Promise<InvoiceActionResult<{ isDeleted: boolean }>> {
  const invoiceId = id(formData, 'invoice_id')
  const addAppointmentIds = ids(formData, 'add_appointment_ids')
  const removeAppointmentIds = ids(formData, 'remove_appointment_ids')
  const dueDate = optionalDate(formData, 'due_date')
  const notes = optionalText(formData, 'notes', MAX_NOTES_LENGTH)
  const isValid = invoiceId && addAppointmentIds && removeAppointmentIds && dueDate !== undefined && notes !== undefined
  if (!isValid) return refuse('invalid_input')

  const admin = await requireAdmin()
  if ('refusal' in admin) return admin.refusal

  const result = await admin.ledger.updateDraft(invoiceId, { addAppointmentIds, removeAppointmentIds, dueDate, notes })
  revalidateInvoicing(invoiceId)
  return toActionResult(result)
}

export async function issueInvoice(
  _previous: unknown,
  formData: FormData
): Promise<InvoiceActionResult<{ invoiceNumber: string }>> {
  const invoiceId = id(formData, 'invoice_id')
  const dueDate = optionalDate(formData, 'due_date')
  if (!invoiceId || dueDate === undefined) return refuse('invalid_input')

  const admin = await requireAdmin()
  if ('refusal' in admin) return admin.refusal

  const result = await admin.ledger.issue(invoiceId, dueDate)
  revalidateInvoicing(invoiceId)
  return toActionResult(result)
}

export async function bulkIssueInvoices(_previous: unknown, formData: FormData): Promise<InvoiceActionResult<BulkIssueOutcome>> {
  const invoiceIds = ids(formData, 'invoice_ids')
  const dueDate = optionalDate(formData, 'due_date')
  if (!invoiceIds || invoiceIds.length === 0 || dueDate === undefined) return refuse('invalid_input')

  const admin = await requireAdmin()
  if ('refusal' in admin) return admin.refusal

  const result = await admin.ledger.bulkIssue(invoiceIds, dueDate)
  revalidateInvoicing()
  return toActionResult(result)
}

export async function voidInvoice(_previous: unknown, formData: FormData): Promise<InvoiceActionResult> {
  const invoiceId = id(formData, 'invoice_id')
  if (!invoiceId) return refuse('invalid_input')

  const admin = await requireAdmin()
  if ('refusal' in admin) return admin.refusal

  const result = await admin.ledger.voidInvoice(invoiceId)
  revalidateInvoicing(invoiceId)
  return toActionResult(result)
}

export async function recordPayment(_previous: unknown, formData: FormData): Promise<InvoiceActionResult> {
  const invoiceId = id(formData, 'invoice_id')
  const input = payment(formData)
  if (!invoiceId || !input) return refuse('invalid_input')

  const admin = await requireAdmin()
  if ('refusal' in admin) return admin.refusal

  const result = await admin.ledger.recordPayment(invoiceId, input)
  revalidateInvoicing(invoiceId)
  return toActionResult(result)
}

export async function updatePayment(_previous: unknown, formData: FormData): Promise<InvoiceActionResult> {
  const invoiceId = id(formData, 'invoice_id')
  const input = payment(formData)
  if (!invoiceId || !input) return refuse('invalid_input')

  const admin = await requireAdmin()
  if ('refusal' in admin) return admin.refusal

  const result = await admin.ledger.updatePayment(invoiceId, input)
  revalidateInvoicing(invoiceId)
  return toActionResult(result)
}

export async function undoPayment(_previous: unknown, formData: FormData): Promise<InvoiceActionResult> {
  const invoiceId = id(formData, 'invoice_id')
  if (!invoiceId) return refuse('invalid_input')

  const admin = await requireAdmin()
  if ('refusal' in admin) return admin.refusal

  const result = await admin.ledger.undoPayment(invoiceId)
  revalidateInvoicing(invoiceId)
  return toActionResult(result)
}

export async function archiveInvoice(_previous: unknown, formData: FormData): Promise<InvoiceActionResult> {
  const invoiceId = id(formData, 'invoice_id')
  if (!invoiceId) return refuse('invalid_input')

  const admin = await requireAdmin()
  if ('refusal' in admin) return admin.refusal

  const result = await admin.ledger.archive(invoiceId)
  revalidateInvoicing(invoiceId)
  return toActionResult(result)
}

export async function unarchiveInvoice(_previous: unknown, formData: FormData): Promise<InvoiceActionResult> {
  const invoiceId = id(formData, 'invoice_id')
  if (!invoiceId) return refuse('invalid_input')

  const admin = await requireAdmin()
  if ('refusal' in admin) return admin.refusal

  const result = await admin.ledger.unarchive(invoiceId)
  revalidateInvoicing(invoiceId)
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
