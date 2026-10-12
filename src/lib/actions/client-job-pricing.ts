'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { AMOUNT_TOO_LARGE_MESSAGE, parseDollarsToCents } from '@/lib/pricing/money'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createSupabaseClient } from '@/lib/supabase/server'

export type ClientJobPricingFieldErrors = {
  job_id?: string
  hourly_rate_cents?: string
  effective_from?: string
}

export type ClientJobPricingActionResult =
  | { success: true; data?: { id: string } }
  | { success: false; error: string; fieldErrors?: ClientJobPricingFieldErrors }

type ParsedClientJobPricingInput = {
  job_id: string
  hourly_rate_cents: number
  effective_from: string
  notes: string | null
}

export async function createClientJobPricing(
  clientId: string,
  formData: FormData
): Promise<ClientJobPricingActionResult>
export async function createClientJobPricing(
  clientId: string,
  _prevState: ClientJobPricingActionResult,
  formData: FormData
): Promise<ClientJobPricingActionResult>
export async function createClientJobPricing(
  clientId: string,
  secondArg: FormData | ClientJobPricingActionResult,
  thirdArg?: FormData
): Promise<ClientJobPricingActionResult> {
  const formData = secondArg instanceof FormData ? secondArg : thirdArg

  if (!clientId) {
    return { success: false, error: 'Client id is required.' }
  }

  if (!formData) {
    return { success: false, error: 'Invalid form submission.' }
  }

  const authResult = await requireAdminRole()
  if (!authResult.success) {
    return { success: false, error: authResult.error }
  }

  const parsed = parseClientJobPricingFormData(formData)
  if (!parsed.success) {
    return parsed
  }

  let pricingId = ''

  try {
    const adminClient = createAdminClient()
    const { data, error } = await adminClient
      .from('client_job_pricing')
      .insert({
        client_id: clientId,
        job_id: parsed.data.job_id,
        hourly_rate_cents: parsed.data.hourly_rate_cents,
        effective_from: parsed.data.effective_from,
        notes: parsed.data.notes,
      })
      .select('id')
      .single()

    if (error) {
      return toWriteFailure(error.message)
    }

    pricingId = data.id
  } catch {
    return { success: false, error: 'Failed to create pricing rule.' }
  }

  revalidateClientJobPricingPaths(clientId)
  redirect(`/solutions/clients/${clientId}/pricing`)

  return { success: true, data: { id: pricingId } }
}

export async function updateClientJobPricing(
  pricingId: string,
  formData: FormData
): Promise<ClientJobPricingActionResult>
export async function updateClientJobPricing(
  pricingId: string,
  _prevState: ClientJobPricingActionResult,
  formData: FormData
): Promise<ClientJobPricingActionResult>
export async function updateClientJobPricing(
  pricingId: string,
  secondArg: FormData | ClientJobPricingActionResult,
  thirdArg?: FormData
): Promise<ClientJobPricingActionResult> {
  const formData = secondArg instanceof FormData ? secondArg : thirdArg

  if (!pricingId) {
    return { success: false, error: 'Pricing rule id is required.' }
  }

  if (!formData) {
    return { success: false, error: 'Invalid form submission.' }
  }

  const authResult = await requireAdminRole()
  if (!authResult.success) {
    return { success: false, error: authResult.error }
  }

  const parsed = parseClientJobPricingFormData(formData)
  if (!parsed.success) {
    return parsed
  }

  let clientId = ''

  try {
    const adminClient = createAdminClient()
    const { data, error } = await adminClient
      .from('client_job_pricing')
      .update({
        job_id: parsed.data.job_id,
        hourly_rate_cents: parsed.data.hourly_rate_cents,
        effective_from: parsed.data.effective_from,
        notes: parsed.data.notes,
      })
      .eq('id', pricingId)
      .eq('is_archived', false)
      .select('id, client_id')
      .maybeSingle()

    if (error) {
      return toWriteFailure(error.message)
    }

    if (!data) {
      return { success: false, error: 'Pricing rule not found.' }
    }

    clientId = data.client_id
  } catch {
    return { success: false, error: 'Failed to update pricing rule.' }
  }

  revalidateClientJobPricingPaths(clientId)
  redirect(`/solutions/clients/${clientId}/pricing`)

  return { success: true, data: { id: pricingId } }
}

export async function archiveClientJobPricing(
  pricingId: string
): Promise<ClientJobPricingActionResult> {
  return setClientJobPricingArchived(pricingId, true)
}

export async function restoreClientJobPricing(
  pricingId: string
): Promise<ClientJobPricingActionResult> {
  return setClientJobPricingArchived(pricingId, false)
}

async function requireAdminRole(): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createSupabaseClient()
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

function parseClientJobPricingFormData(formData: FormData):
  | { success: true; data: ParsedClientJobPricingInput }
  | { success: false; error: string; fieldErrors: ClientJobPricingFieldErrors } {
  const jobId = String(formData.get('job_id') ?? '').trim()
  const rate = parseDollarsToCents(String(formData.get('hourly_rate_cents') ?? ''))
  const effectiveFrom = String(formData.get('effective_from') ?? '').trim()
  const notesRaw = String(formData.get('notes') ?? '').trim()

  const fieldErrors: ClientJobPricingFieldErrors = {}

  if (!jobId) {
    fieldErrors.job_id = 'Job is required.'
  }

  if ('error' in rate) {
    fieldErrors.hourly_rate_cents =
      rate.error === 'too_large' ? AMOUNT_TOO_LARGE_MESSAGE : 'Enter a valid hourly rate in dollars.'
  }

  if (!isValidDate(effectiveFrom)) {
    fieldErrors.effective_from = 'Enter a valid date.'
  }

  let result:
    | { success: true; data: ParsedClientJobPricingInput }
    | { success: false; error: string; fieldErrors: ClientJobPricingFieldErrors }

  if ('error' in rate || Object.keys(fieldErrors).length > 0) {
    result = {
      success: false,
      error: 'Please correct the highlighted fields.',
      fieldErrors,
    }
  } else {
    result = {
      success: true,
      data: {
        job_id: jobId,
        hourly_rate_cents: rate.cents,
        effective_from: effectiveFrom,
        notes: notesRaw || null,
      },
    }
  }

  return result
}

function isValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function toWriteFailure(message: string): ClientJobPricingActionResult {
  if (isUniqueConstraintError(message)) {
    return {
      success: false,
      error: 'Please correct the highlighted fields.',
      fieldErrors: { effective_from: 'A rate for this job already starts on that date.' },
    }
  }

  return { success: false, error: message }
}

function toArchiveFailure(message: string, isArchived: boolean): ClientJobPricingActionResult {
  let error: string

  if (!isArchived && isUniqueConstraintError(message)) {
    error = 'An active rate for this job already starts on that date. Archive or edit that rate first.'
  } else {
    error = message
  }

  return { success: false, error }
}

function isUniqueConstraintError(error: string) {
  const lower = error.toLowerCase()
  return lower.includes('duplicate key') || lower.includes('unique')
}

function revalidateClientJobPricingPaths(clientId: string) {
  revalidatePath('/solutions/clients')
  revalidatePath(`/solutions/clients/${clientId}`)
  revalidatePath(`/solutions/clients/${clientId}/pricing`)
  revalidatePath('/solutions/appointments')
}

async function setClientJobPricingArchived(
  pricingId: string,
  isArchived: boolean
): Promise<ClientJobPricingActionResult> {
  if (!pricingId) {
    return { success: false, error: 'Pricing rule id is required.' }
  }

  const authResult = await requireAdminRole()
  if (!authResult.success) {
    return { success: false, error: authResult.error }
  }

  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('client_job_pricing')
    .update({ is_archived: isArchived })
    .eq('id', pricingId)
    .select('id, client_id')
    .maybeSingle()

  if (error) {
    return toArchiveFailure(error.message, isArchived)
  }

  if (!data) {
    return { success: false, error: 'Pricing rule not found.' }
  }

  revalidateClientJobPricingPaths(data.client_id)

  return { success: true, data: { id: pricingId } }
}
