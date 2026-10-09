'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import {
  APPOINTMENT_PRICE_COLUMNS,
  priceAppointments,
  type PriceableAppointment,
  type PricedAppointment,
} from '@/lib/pricing'
import { parseDollarsToCents } from '@/lib/pricing/money'
import { getBusinessDate } from '@/lib/schedule'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

type InvoiceFieldErrors = {
  client_id?: string
  due_date?: string
  appointment_ids?: string
  prices?: string
}

export type InvoiceActionResult =
  | { success: true; data?: { id: string } }
  | { success: false; error: string; fieldErrors?: InvoiceFieldErrors }

type ParsedInvoiceInput = {
  clientId: string
  dueDate: string | null
  notes: string
  selections: Array<{ appointmentId: string; priceCents: number }>
}

type AppointmentPriceRow = PriceableAppointment & {
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
  is_archived: boolean
}

type InvoiceLine = {
  appointment_id: string
  billed_amount_cents: number
  billed_rate_cents: number | null
  billed_minutes: number | null
}

const duplicateAppointmentError =
  'One or more selected appointments are already attached to another invoice.'

const linesNotRestoredError =
  "The invoice's previous appointments could not be restored, so it currently has no lines."

const invoiceChangedError =
  'The invoice changed while this action was in progress. Reload it and try again.'

async function requireAdminRole(): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) {
    return { success: false, error: error.message }
  }

  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  if (user.app_metadata?.role !== 'admin') {
    return { success: false, error: 'Unauthorized' }
  }

  return { success: true }
}

function isValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function uniqueIds(values: FormDataEntryValue[]) {
  return Array.from(new Set(values.map((value) => String(value)).filter(Boolean)))
}

function parseInvoiceFormData(formData: FormData):
  | { success: true; data: ParsedInvoiceInput }
  | { success: false; error: string; fieldErrors: InvoiceFieldErrors } {
  const clientId = String(formData.get('client_id') ?? '').trim()
  const dueDateRaw = String(formData.get('due_date') ?? '').trim()
  const notes = String(formData.get('notes') ?? '').trim()
  const appointmentIds = uniqueIds(formData.getAll('appointment_ids'))

  const fieldErrors: InvoiceFieldErrors = {}

  if (!clientId) {
    fieldErrors.client_id = 'Client is required.'
  }

  if (dueDateRaw && !isValidDate(dueDateRaw)) {
    fieldErrors.due_date = 'Enter a valid due date.'
  }

  if (appointmentIds.length === 0) {
    fieldErrors.appointment_ids = 'Select at least one appointment.'
  }

  const selections: Array<{ appointmentId: string; priceCents: number }> = []
  for (const appointmentId of appointmentIds) {
    const rawPrice = String(formData.get(`price_override_${appointmentId}`) ?? '').trim()
    const priceCents = parseDollarsToCents(rawPrice)

    if (priceCents == null) {
      fieldErrors.prices = 'Each selected appointment must have a valid non-negative price.'
      break
    }

    selections.push({ appointmentId, priceCents })
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      success: false,
      error: 'Please correct the highlighted fields.',
      fieldErrors,
    }
  }

  return {
    success: true,
    data: {
      clientId,
      dueDate: dueDateRaw || null,
      notes,
      selections,
    },
  }
}

async function fetchAppointmentsForPricing(appointmentIds: string[]): Promise<
  { success: true; rows: AppointmentPriceRow[] } | { success: false; error: string }
> {
  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('appointments')
    .select(
      `
        ${APPOINTMENT_PRICE_COLUMNS},
        status, is_archived
      `
    )
    .in('id', appointmentIds)

  if (error) {
    return { success: false, error: error.message }
  }

  const rows = (data ?? []) as unknown as AppointmentPriceRow[]
  if (rows.length !== appointmentIds.length) {
    return { success: false, error: 'One or more selected appointments were not found.' }
  }

  return { success: true, rows }
}

async function buildInvoiceLines(
  parsed: ParsedInvoiceInput
): Promise<
  { success: true; lines: InvoiceLine[]; totalCents: number } | { success: false; error: string }
> {
  const pricingResult = await fetchAppointmentsForPricing(parsed.selections.map((item) => item.appointmentId))
  if (!pricingResult.success) {
    return pricingResult
  }

  const byId = new Map(pricingResult.rows.map((row) => [row.id, row]))
  const selected: Array<{ priceCents: number; appointment: AppointmentPriceRow }> = []

  for (const selection of parsed.selections) {
    const appointment = byId.get(selection.appointmentId)

    if (!appointment) {
      return { success: false, error: 'One or more selected appointments were not found.' }
    }

    if (appointment.client_id !== parsed.clientId) {
      return { success: false, error: 'All selected appointments must belong to the selected client.' }
    }

    if (appointment.is_archived) {
      return { success: false, error: 'Archived appointments cannot be invoiced.' }
    }

    selected.push({ priceCents: selection.priceCents, appointment })
  }

  let pricesById: Map<string, PricedAppointment>
  try {
    pricesById = await priceAppointments(
      createAdminClient(),
      selected.map(({ appointment }) => appointment)
    )
  } catch (thrown) {
    console.error('Error pricing invoice appointments:', thrown)
    return { success: false, error: 'Failed to load appointment prices.' }
  }

  const lines: InvoiceLine[] = []
  let totalCents = 0

  for (const { priceCents, appointment } of selected) {
    const live = pricesById.get(appointment.id)?.live
    // An Unpriced visit is never billed, not even at a typed amount, until it has a Job.
    if (!live || live.source === 'unpriced') {
      return { success: false, error: 'One or more selected appointments have no Job, so they cannot be priced.' }
    }

    // No line column holds the crew size, so a multi-Cleaner line freezes no rate or minutes:
    // rate × minutes would not add up to its billed amount.
    const canFreezeBreakdown = priceCents === live.amount_cents && live.headcount === 1

    lines.push({
      appointment_id: appointment.id,
      billed_amount_cents: priceCents,
      billed_rate_cents: canFreezeBreakdown ? live.rate_cents : null,
      billed_minutes: canFreezeBreakdown ? live.minutes : null,
    })

    totalCents += priceCents
  }

  return { success: true, lines, totalCents }
}

function toJunctionRows(invoiceId: string, lines: InvoiceLine[]) {
  return lines.map((line) => ({
    invoice_id: invoiceId,
    appointment_id: line.appointment_id,
    billed_amount_cents: line.billed_amount_cents,
    billed_rate_cents: line.billed_rate_cents,
    billed_minutes: line.billed_minutes,
  }))
}

async function writeBilledPriceCache(lines: InvoiceLine[]): Promise<void> {
  const adminClient = createAdminClient()

  for (const line of lines) {
    const { error } = await adminClient
      .from('appointments')
      .update({ billed_price_cents: line.billed_amount_cents })
      .eq('id', line.appointment_id)

    if (error) {
      console.error('billed_price_cents write failed', line.appointment_id, error.message)
    }
  }
}

async function clearBilledPriceCache(appointmentIds: string[]): Promise<boolean> {
  let cleared = true

  if (appointmentIds.length > 0) {
    const { error } = await createAdminClient()
      .from('appointments')
      .update({ billed_price_cents: null })
      .in('id', appointmentIds)

    if (error) {
      console.error('billed_price_cents clear failed', appointmentIds.join(','), error.message)
      cleared = false
    }
  }

  return cleared
}

async function restoreInvoiceLines(invoiceId: string, lines: InvoiceLine[]) {
  let restored = true

  if (lines.length > 0) {
    const { error } = await createAdminClient()
      .from('invoice_appointments')
      .insert(toJunctionRows(invoiceId, lines))

    restored = !error
  }

  return restored
}

function isUniqueConstraintError(error: string) {
  const lower = error.toLowerCase()
  return lower.includes('duplicate key') || lower.includes('unique')
}

function revalidateInvoicePaths(invoiceId?: string) {
  revalidatePath('/solutions/invoices')
  revalidatePath('/solutions/appointments')
  if (invoiceId) {
    revalidatePath(`/solutions/invoices/${invoiceId}`)
  }
}

export async function createInvoice(formData: FormData): Promise<InvoiceActionResult>
export async function createInvoice(
  _prevState: InvoiceActionResult,
  formData: FormData
): Promise<InvoiceActionResult>
export async function createInvoice(
  firstArg: FormData | InvoiceActionResult,
  secondArg?: FormData
): Promise<InvoiceActionResult> {
  const formData = firstArg instanceof FormData ? firstArg : secondArg

  if (!formData) {
    return { success: false, error: 'Invalid form submission.' }
  }

  const authResult = await requireAdminRole()
  if (!authResult.success) {
    return { success: false, error: authResult.error }
  }

  const parsed = parseInvoiceFormData(formData)
  if (!parsed.success) {
    return parsed
  }

  const linesResult = await buildInvoiceLines(parsed.data)
  if (!linesResult.success) {
    return { success: false, error: linesResult.error }
  }

  let redirectPath = ''

  try {
    const adminClient = createAdminClient()

    const { data: createdInvoice, error: createError } = await adminClient
      .from('invoices')
      .insert({
        client_id: parsed.data.clientId,
        due_date: parsed.data.dueDate,
        notes: parsed.data.notes,
        status: 'draft',
        total_cents: linesResult.totalCents,
      })
      .select('id')
      .single()

    if (createError) {
      return { success: false, error: createError.message }
    }

    const invoiceId = createdInvoice.id

    const { error: linkError } = await adminClient
      .from('invoice_appointments')
      .insert(toJunctionRows(invoiceId, linesResult.lines))

    if (linkError) {
      if (isUniqueConstraintError(linkError.message)) {
        return { success: false, error: duplicateAppointmentError }
      }

      return { success: false, error: linkError.message }
    }

    await writeBilledPriceCache(linesResult.lines)

    redirectPath = `/solutions/invoices/${invoiceId}`
  } catch {
    return { success: false, error: 'Failed to create invoice.' }
  }

  revalidateInvoicePaths()
  redirect(redirectPath)

  return { success: true }
}

export async function updateInvoice(id: string, formData: FormData): Promise<InvoiceActionResult>
export async function updateInvoice(
  id: string,
  _prevState: InvoiceActionResult,
  formData: FormData
): Promise<InvoiceActionResult>
export async function updateInvoice(
  id: string,
  secondArg: FormData | InvoiceActionResult,
  thirdArg?: FormData
): Promise<InvoiceActionResult> {
  const formData = secondArg instanceof FormData ? secondArg : thirdArg

  if (!id) {
    return { success: false, error: 'Invoice id is required.' }
  }

  if (!formData) {
    return { success: false, error: 'Invalid form submission.' }
  }

  const authResult = await requireAdminRole()
  if (!authResult.success) {
    return { success: false, error: authResult.error }
  }

  const parsed = parseInvoiceFormData(formData)
  if (!parsed.success) {
    return parsed
  }

  const adminClient = createAdminClient()

  const { data: currentInvoice, error: invoiceError } = await adminClient
    .from('invoices')
    .select('id, status')
    .eq('id', id)
    .maybeSingle()

  if (invoiceError) {
    return { success: false, error: invoiceError.message }
  }

  if (!currentInvoice) {
    return { success: false, error: 'Invoice not found.' }
  }

  if (currentInvoice.status !== 'draft') {
    return { success: false, error: 'Only draft invoices can be edited.' }
  }

  const { data: linkedRows, error: linkedError } = await adminClient
    .from('invoice_appointments')
    .select('appointment_id, billed_amount_cents, billed_rate_cents, billed_minutes')
    .eq('invoice_id', id)

  if (linkedError) {
    return { success: false, error: linkedError.message }
  }

  const linesResult = await buildInvoiceLines(parsed.data)
  if (!linesResult.success) {
    return { success: false, error: linesResult.error }
  }

  const previousLines = (linkedRows ?? []) as InvoiceLine[]
  const selectedIds = new Set(linesResult.lines.map((line) => line.appointment_id))
  const removedAppointmentIds = previousLines
    .map((line) => line.appointment_id)
    .filter((appointmentId) => !selectedIds.has(appointmentId))

  let redirectPath = ''

  try {
    const { error: deleteLinksError } = await adminClient
      .from('invoice_appointments')
      .delete()
      .eq('invoice_id', id)

    if (deleteLinksError) {
      return { success: false, error: deleteLinksError.message }
    }

    const { error: insertLinksError } = await adminClient
      .from('invoice_appointments')
      .insert(toJunctionRows(id, linesResult.lines))

    if (insertLinksError) {
      const restored = await restoreInvoiceLines(id, previousLines)
      const detail = isUniqueConstraintError(insertLinksError.message)
        ? duplicateAppointmentError
        : insertLinksError.message

      return { success: false, error: restored ? detail : `${detail} ${linesNotRestoredError}` }
    }

    await clearBilledPriceCache(removedAppointmentIds)
    await writeBilledPriceCache(linesResult.lines)

    const { error: updateInvoiceError } = await adminClient
      .from('invoices')
      .update({
        client_id: parsed.data.clientId,
        due_date: parsed.data.dueDate,
        notes: parsed.data.notes,
        total_cents: linesResult.totalCents,
      })
      .eq('id', id)

    if (updateInvoiceError) {
      return { success: false, error: updateInvoiceError.message }
    }

    redirectPath = `/solutions/invoices/${id}`
  } catch {
    return { success: false, error: 'Failed to update invoice.' }
  }

  revalidateInvoicePaths(id)
  redirect(redirectPath)

  return { success: true, data: { id } }
}

function todayDateString() {
  return getBusinessDate(new Date())
}

export async function issueInvoice(id: string): Promise<InvoiceActionResult> {
  if (!id) {
    return { success: false, error: 'Invoice id is required.' }
  }

  const authResult = await requireAdminRole()
  if (!authResult.success) {
    return { success: false, error: authResult.error }
  }

  const adminClient = createAdminClient()

  const { data: currentInvoice, error: loadError } = await adminClient
    .from('invoices')
    .select('id, status, issued_date')
    .eq('id', id)
    .maybeSingle()

  if (loadError) {
    return { success: false, error: loadError.message }
  }

  if (!currentInvoice) {
    return { success: false, error: 'Invoice not found.' }
  }

  if (currentInvoice.status !== 'draft') {
    return { success: false, error: 'Only draft invoices can be issued.' }
  }

  const { data: issuedRows, error } = await adminClient
    .from('invoices')
    .update({
      status: 'issued',
      issued_date: currentInvoice.issued_date ?? todayDateString(),
    })
    .eq('id', id)
    .eq('status', 'draft')
    .select('id')

  if (error) {
    return { success: false, error: error.message }
  }

  if ((issuedRows ?? []).length === 0) {
    return { success: false, error: invoiceChangedError }
  }

  revalidateInvoicePaths(id)
  return { success: true, data: { id } }
}

export async function markInvoicePaid(id: string): Promise<InvoiceActionResult> {
  if (!id) {
    return { success: false, error: 'Invoice id is required.' }
  }

  const authResult = await requireAdminRole()
  if (!authResult.success) {
    return { success: false, error: authResult.error }
  }

  const adminClient = createAdminClient()
  const { data: currentInvoice, error: loadError } = await adminClient
    .from('invoices')
    .select('id, status')
    .eq('id', id)
    .maybeSingle()

  if (loadError) {
    return { success: false, error: loadError.message }
  }

  if (!currentInvoice) {
    return { success: false, error: 'Invoice not found.' }
  }

  if (currentInvoice.status !== 'issued') {
    return { success: false, error: 'Only issued invoices can be marked as paid.' }
  }

  const { data: paidRows, error } = await adminClient
    .from('invoices')
    .update({ status: 'paid' })
    .eq('id', id)
    .eq('status', 'issued')
    .select('id')

  if (error) {
    return { success: false, error: error.message }
  }

  if ((paidRows ?? []).length === 0) {
    return { success: false, error: invoiceChangedError }
  }

  revalidateInvoicePaths(id)
  return { success: true, data: { id } }
}

export async function voidInvoice(id: string): Promise<InvoiceActionResult> {
  if (!id) {
    return { success: false, error: 'Invoice id is required.' }
  }

  const authResult = await requireAdminRole()
  if (!authResult.success) {
    return { success: false, error: authResult.error }
  }

  const adminClient = createAdminClient()
  const { data: currentInvoice, error: loadError } = await adminClient
    .from('invoices')
    .select('id, status')
    .eq('id', id)
    .maybeSingle()

  if (loadError) {
    return { success: false, error: loadError.message }
  }

  if (!currentInvoice) {
    return { success: false, error: 'Invoice not found.' }
  }

  if (currentInvoice.status !== 'draft' && currentInvoice.status !== 'issued') {
    return { success: false, error: 'Only draft or issued invoices can be voided.' }
  }

  const { data: voidedRows, error } = await adminClient
    .from('invoices')
    .update({ status: 'void' })
    .eq('id', id)
    .in('status', ['draft', 'issued'])
    .select('id')

  if (error) {
    return { success: false, error: error.message }
  }

  if ((voidedRows ?? []).length === 0) {
    return { success: false, error: invoiceChangedError }
  }

  // Order is status -> release -> clear, and it must stay that way. A release that fails after the
  // status write leaves the invoice void with its appointments still consumed, which is the
  // behaviour this action has always had. Releasing first would let a failed status write leave a
  // draft or issued invoice still totalling lines whose appointments are billable again — a
  // double-billing window.
  const { data: releasedRows, error: releaseError } = await adminClient
    .from('invoice_appointments')
    .update({ is_archived: true })
    .eq('invoice_id', id)
    .eq('is_archived', false)
    .select('appointment_id')

  if (releaseError) {
    revalidateInvoicePaths(id)
    return {
      success: false,
      error: 'The invoice was voided, but its appointments were not released.',
    }
  }

  const releasedAppointmentIds = ((releasedRows ?? []) as Array<{ appointment_id: string }>).map(
    (row) => row.appointment_id
  )
  const cleared = await clearBilledPriceCache(releasedAppointmentIds)

  revalidateInvoicePaths(id)

  if (!cleared) {
    return {
      success: false,
      error:
        'The invoice was voided and its appointments were released, but their cached invoiced amounts were not cleared.',
    }
  }

  return { success: true, data: { id } }
}

export async function archiveInvoice(id: string): Promise<InvoiceActionResult> {
  if (!id) {
    return { success: false, error: 'Invoice id is required.' }
  }

  const authResult = await requireAdminRole()
  if (!authResult.success) {
    return { success: false, error: authResult.error }
  }

  const adminClient = createAdminClient()
  const { error } = await adminClient.from('invoices').update({ is_archived: true }).eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidateInvoicePaths(id)
  return { success: true, data: { id } }
}

export async function restoreInvoice(id: string): Promise<InvoiceActionResult> {
  if (!id) {
    return { success: false, error: 'Invoice id is required.' }
  }

  const authResult = await requireAdminRole()
  if (!authResult.success) {
    return { success: false, error: authResult.error }
  }

  const adminClient = createAdminClient()
  const { error } = await adminClient.from('invoices').update({ is_archived: false }).eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidateInvoicePaths(id)
  return { success: true, data: { id } }
}
