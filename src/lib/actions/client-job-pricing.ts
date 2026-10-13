'use server'

import { revalidatePath } from 'next/cache'

import { getRateEditRefusal, type RateTarget } from '@/lib/clients/rate-client-guard'
import { type ClientJobPricingFieldErrors, parseNewRateForm, parseRateChangeForm } from '@/lib/clients/rate-form'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createSupabaseClient } from '@/lib/supabase/server'

const SAVE_RATE_ERROR = "Couldn't save the rate. Try again."

export type ClientJobPricingActionResult =
  | { success: true; data: { id: string } }
  | { success: false; error: string; fieldErrors?: ClientJobPricingFieldErrors }

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

  const parsed = parseNewRateForm(formData)
  if (!parsed.success) {
    return parsed
  }

  const clientCheck = await checkRateClient({ clientId })
  if (clientCheck.error !== null) {
    return { success: false, error: clientCheck.error }
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
      return toWriteFailure('create', clientId, error.message)
    }

    pricingId = data.id
  } catch (error) {
    console.error('Rate create failed', clientId, error)
    return { success: false, error: SAVE_RATE_ERROR }
  }

  revalidateClientJobPricingPaths(clientId)
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

  const parsed = parseRateChangeForm(formData)
  if (!parsed.success) {
    return parsed
  }

  const clientCheck = await checkRateClient({ pricingId })
  if (clientCheck.error !== null) {
    return { success: false, error: clientCheck.error }
  }

  let clientId = ''

  try {
    const adminClient = createAdminClient()
    const { data, error } = await adminClient
      .from('client_job_pricing')
      // No job_id: an edit never moves a rate to another job.
      .update(parsed.data)
      .eq('id', pricingId)
      .eq('is_archived', false)
      .select('id, client_id')
      .maybeSingle()

    if (error) {
      return toWriteFailure('update', pricingId, error.message)
    }

    if (!data) {
      return { success: false, error: 'Pricing rule not found.' }
    }

    clientId = data.client_id
  } catch (error) {
    console.error('Rate update failed', pricingId, error)
    return { success: false, error: SAVE_RATE_ERROR }
  }

  revalidateClientJobPricingPaths(clientId)
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

// Refuses writes to an archived client's rates; the UI hides the controls, this backs it up.
async function checkRateClient(target: RateTarget): Promise<{ error: string | null }> {
  const error = await getRateEditRefusal(createAdminClient(), target)
  if (error !== null) {
    console.warn('client-job-pricing: write refused', target, error)
  }
  return { error }
}

async function requireAdminRole(): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createSupabaseClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) {
    console.error('Admin check failed', error)
    return { success: false, error: 'Not authenticated' }
  }

  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  if (user.app_metadata?.role !== 'admin') {
    return { success: false, error: 'Unauthorized' }
  }

  return { success: true }
}

function toWriteFailure(
  operation: 'create' | 'update',
  id: string,
  message: string
): ClientJobPricingActionResult {
  if (isUniqueConstraintError(message)) {
    return {
      success: false,
      error: 'Please correct the highlighted fields.',
      fieldErrors: { effective_from: 'A rate for this job already starts on that date.' },
    }
  }

  console.error(`Rate ${operation} failed`, id, message)
  return { success: false, error: SAVE_RATE_ERROR }
}

function toArchiveFailure(
  pricingId: string,
  message: string,
  isArchived: boolean
): ClientJobPricingActionResult {
  let error: string

  if (!isArchived && isUniqueConstraintError(message)) {
    error = 'An active rate for this job already starts on that date. Archive or edit that rate first.'
  } else {
    console.error(`Rate ${isArchived ? 'archive' : 'restore'} failed`, pricingId, message)
    error = isArchived
      ? "Couldn't archive the rate. Try again."
      : "Couldn't restore the rate. Try again."
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

  const clientCheck = await checkRateClient({ pricingId })
  if (clientCheck.error !== null) {
    return { success: false, error: clientCheck.error }
  }

  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('client_job_pricing')
    .update({ is_archived: isArchived })
    .eq('id', pricingId)
    .select('id, client_id')
    .maybeSingle()

  if (error) {
    return toArchiveFailure(pricingId, error.message, isArchived)
  }

  if (!data) {
    return { success: false, error: 'Pricing rule not found.' }
  }

  revalidateClientJobPricingPaths(data.client_id)

  return { success: true, data: { id: pricingId } }
}
