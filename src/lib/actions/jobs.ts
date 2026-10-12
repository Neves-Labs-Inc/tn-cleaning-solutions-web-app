'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { AMOUNT_TOO_LARGE_MESSAGE, parseDollarsToCents } from '@/lib/pricing/money'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

type JobFieldErrors = {
  name?: string
  hourly_rate_cents?: string
  estimated_duration_minutes?: string
}

export type JobActionResult =
  | { success: true; data?: { id: string } }
  | { success: false; error: string; fieldErrors?: JobFieldErrors }

type ParsedJobInput = {
  name: string
  description: string | null
  hourly_rate_cents: number
  estimated_duration_minutes: number | null
}

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

function parseJobFormData(formData: FormData):
  | { success: true; data: ParsedJobInput }
  | { success: false; error: string; fieldErrors: JobFieldErrors } {
  const name = String(formData.get('name') ?? '').trim()
  const descriptionRaw = String(formData.get('description') ?? '').trim()
  const hourlyRateRaw = String(formData.get('hourly_rate_cents') ?? '')
  const durationRaw = String(formData.get('estimated_duration_minutes') ?? '').trim()

  const fieldErrors: JobFieldErrors = {}

  if (!name) {
    fieldErrors.name = 'Name is required.'
  }

  const hourlyRate = parseDollarsToCents(hourlyRateRaw)
  if ('error' in hourlyRate) {
    fieldErrors.hourly_rate_cents =
      hourlyRate.error === 'too_large' ? AMOUNT_TOO_LARGE_MESSAGE : 'Enter a valid hourly rate in dollars.'
  }

  let estimatedDurationMinutes: number | null = null
  if (durationRaw) {
    const parsedDuration = Number(durationRaw)
    if (
      Number.isNaN(parsedDuration) ||
      !Number.isFinite(parsedDuration) ||
      parsedDuration <= 0 ||
      !Number.isInteger(parsedDuration)
    ) {
      fieldErrors.estimated_duration_minutes =
        'Duration must be a whole number of minutes greater than zero.'
    } else {
      estimatedDurationMinutes = parsedDuration
    }
  }

  if ('error' in hourlyRate || Object.keys(fieldErrors).length > 0) {
    return {
      success: false,
      error: 'Please correct the highlighted fields.',
      fieldErrors,
    }
  }

  return {
    success: true,
    data: {
      name,
      description: descriptionRaw || null,
      hourly_rate_cents: hourlyRate.cents,
      estimated_duration_minutes: estimatedDurationMinutes,
    },
  }
}

export async function createJob(formData: FormData): Promise<JobActionResult>
export async function createJob(
  _prevState: JobActionResult,
  formData: FormData
): Promise<JobActionResult>
export async function createJob(
  firstArg: FormData | JobActionResult,
  secondArg?: FormData
): Promise<JobActionResult> {
  const formData = firstArg instanceof FormData ? firstArg : secondArg

  if (!formData) {
    return { success: false, error: 'Invalid form submission.' }
  }

  const authResult = await requireAdminRole()
  if (!authResult.success) {
    return { success: false, error: authResult.error }
  }

  const parsed = parseJobFormData(formData)
  if (!parsed.success) {
    return parsed
  }

  let createdId = ''

  try {
    const adminClient = createAdminClient()
    const { data, error } = await adminClient
      .from('jobs')
      .insert(parsed.data)
      .select('id')
      .single()

    if (error) {
      return { success: false, error: error.message }
    }

    createdId = data.id
  } catch {
    return { success: false, error: 'Failed to create job.' }
  }

  revalidatePath('/solutions/jobs')
  redirect('/solutions/jobs')

  return { success: true, data: createdId ? { id: createdId } : undefined }
}

export async function updateJob(id: string, formData: FormData): Promise<JobActionResult>
export async function updateJob(
  id: string,
  _prevState: JobActionResult,
  formData: FormData
): Promise<JobActionResult>
export async function updateJob(
  id: string,
  secondArg: FormData | JobActionResult,
  thirdArg?: FormData
): Promise<JobActionResult> {
  const formData = secondArg instanceof FormData ? secondArg : thirdArg

  if (!id) {
    return { success: false, error: 'Job id is required.' }
  }

  if (!formData) {
    return { success: false, error: 'Invalid form submission.' }
  }

  const authResult = await requireAdminRole()
  if (!authResult.success) {
    return { success: false, error: authResult.error }
  }

  const parsed = parseJobFormData(formData)
  if (!parsed.success) {
    return parsed
  }

  try {
    const adminClient = createAdminClient()
    const { data, error } = await adminClient
      .from('jobs')
      .update(parsed.data)
      .eq('id', id)
      .eq('is_archived', false)
      .select('id')
      .maybeSingle()

    if (error) {
      return { success: false, error: error.message }
    }

    if (!data) {
      return { success: false, error: 'Job not found.' }
    }
  } catch {
    return { success: false, error: 'Failed to update job.' }
  }

  revalidatePath('/solutions/jobs')
  redirect('/solutions/jobs')

  return { success: true, data: { id } }
}

export async function archiveJob(id: string): Promise<JobActionResult> {
  if (!id) {
    return { success: false, error: 'Job id is required.' }
  }

  return setJobsArchived([id], true)
}

export async function restoreJob(id: string): Promise<JobActionResult> {
  if (!id) {
    return { success: false, error: 'Job id is required.' }
  }

  return setJobsArchived([id], false)
}

export async function archiveJobs(ids: string[]): Promise<JobActionResult> {
  if (ids.length === 0) {
    return { success: false, error: 'Select at least one job to archive.' }
  }

  return setJobsArchived(ids, true)
}

export async function restoreJobs(ids: string[]): Promise<JobActionResult> {
  if (ids.length === 0) {
    return { success: false, error: 'Select at least one job to restore.' }
  }

  return setJobsArchived(ids, false)
}

async function setJobsArchived(ids: string[], isArchived: boolean): Promise<JobActionResult> {
  const authResult = await requireAdminRole()
  if (!authResult.success) {
    return { success: false, error: authResult.error }
  }

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('jobs')
    .update({ is_archived: isArchived })
    .in('id', ids)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/solutions/jobs')
  return { success: true }
}