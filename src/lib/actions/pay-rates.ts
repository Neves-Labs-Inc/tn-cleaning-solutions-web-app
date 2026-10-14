'use server'

import type { PostgrestError } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

import {
  DUPLICATE_RATE_DATE_MESSAGE,
  FIX_FIELDS_MESSAGE,
  parsePayRateForm,
  type PayRateFieldErrors,
} from '@/lib/employees/pay-rate-form'
import { createClient } from '@/lib/supabase/server'

// Writes run as the signed-in admin, so the pay_rates admin RLS policy is the real gate; the role
// check up front only gives a clear refusal.

export type PayRateActionResult =
  | { success: true; data: { id: string } }
  | { success: false; error: string; fieldErrors?: PayRateFieldErrors }

type Supabase = Awaited<ReturnType<typeof createClient>>

type RateKey = { employee_id: string; effective_from: string }

const SAVE_RATE_ERROR = "Couldn't save the rate. Try again."
const ARCHIVE_RATE_ERROR = "Couldn't archive the Pay rate. Try again."
const RESTORE_RATE_ERROR = "Couldn't restore the Pay rate. Try again."
const RATE_NOT_FOUND = 'Pay rate not found.'
const UNIQUE_VIOLATION = '23505'

const DUPLICATE_DATE_FAILURE: PayRateActionResult = {
  success: false,
  error: FIX_FIELDS_MESSAGE,
  fieldErrors: { effective_from: DUPLICATE_RATE_DATE_MESSAGE },
}

export async function createPayRate(
  employeeId: string,
  _prevState: PayRateActionResult,
  formData: FormData
): Promise<PayRateActionResult> {
  const supabase = await createClient()
  const refusal = await getAdminRefusal(supabase)
  if (refusal) return refusal

  const parsed = parsePayRateForm(formData)
  if (!parsed.success) return parsed

  const key = { employee_id: employeeId, effective_from: parsed.data.effective_from }
  if (await hasLiveRateOn(supabase, key, null)) {
    console.warn('pay-rates: add refused, date taken', key)
    return DUPLICATE_DATE_FAILURE
  }

  const { data, error } = await supabase
    .from('pay_rates')
    .insert({ employee_id: employeeId, ...parsed.data })
    .select('id')
    .single()

  let result: PayRateActionResult
  if (error) {
    result = toSaveFailure('add', employeeId, error)
  } else {
    revalidatePayRatePaths(employeeId)
    result = { success: true, data: { id: data.id } }
  }
  return result
}

export async function updatePayRate(
  rateId: string,
  _prevState: PayRateActionResult,
  formData: FormData
): Promise<PayRateActionResult> {
  const supabase = await createClient()
  const refusal = await getAdminRefusal(supabase)
  if (refusal) return refusal

  const parsed = parsePayRateForm(formData)
  if (!parsed.success) return parsed

  const existing = await getRateKey(supabase, rateId)
  if (!existing) {
    console.warn('pay-rates: edit refused, rate not found', rateId)
    return { success: false, error: RATE_NOT_FOUND }
  }

  const key = { employee_id: existing.employee_id, effective_from: parsed.data.effective_from }
  if (await hasLiveRateOn(supabase, key, rateId)) {
    console.warn('pay-rates: edit refused, date taken', rateId, key)
    return DUPLICATE_DATE_FAILURE
  }

  const { data, error } = await supabase
    .from('pay_rates')
    // Never employee_id: an edit doesn't move a rate to another Cleaner.
    .update(parsed.data)
    .eq('id', rateId)
    .select('id')
    .maybeSingle()

  let result: PayRateActionResult
  if (error) {
    result = toSaveFailure('edit', rateId, error)
  } else if (!data) {
    console.warn('pay-rates: edit found no row', rateId)
    result = { success: false, error: RATE_NOT_FOUND }
  } else {
    revalidatePayRatePaths(existing.employee_id)
    result = { success: true, data: { id: rateId } }
  }
  return result
}

export async function archivePayRate(rateId: string): Promise<PayRateActionResult> {
  return setPayRateArchived(rateId, true)
}

export async function restorePayRate(rateId: string): Promise<PayRateActionResult> {
  return setPayRateArchived(rateId, false)
}

async function setPayRateArchived(
  rateId: string,
  isArchived: boolean
): Promise<PayRateActionResult> {
  const supabase = await createClient()
  const refusal = await getAdminRefusal(supabase)
  if (refusal) return refusal

  const existing = await getRateKey(supabase, rateId)
  if (!existing) {
    console.warn('pay-rates: state change refused, rate not found', rateId)
    return { success: false, error: RATE_NOT_FOUND }
  }

  // Only a Restore can collide: archiving frees a date, it never takes one.
  if (!isArchived && (await hasLiveRateOn(supabase, existing, rateId))) {
    console.warn('pay-rates: restore refused, date taken', rateId, existing)
    return { success: false, error: DUPLICATE_RATE_DATE_MESSAGE }
  }

  const { error } = await supabase
    .from('pay_rates')
    .update({ is_archived: isArchived })
    .eq('id', rateId)

  let result: PayRateActionResult
  if (!error) {
    revalidatePayRatePaths(existing.employee_id)
    result = { success: true, data: { id: rateId } }
  } else if (!isArchived && error.code === UNIQUE_VIOLATION) {
    // Another admin added a rate on this date between the check and the write.
    console.warn('pay-rates: restore refused by the unique index', rateId)
    result = { success: false, error: DUPLICATE_RATE_DATE_MESSAGE }
  } else {
    console.error(`pay-rates: ${isArchived ? 'archive' : 'restore'} failed`, rateId, error)
    result = { success: false, error: isArchived ? ARCHIVE_RATE_ERROR : RESTORE_RATE_ERROR }
  }
  return result
}

async function getAdminRefusal(supabase: Supabase): Promise<PayRateActionResult | null> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  let refusal: PayRateActionResult | null = null
  if (error || !user) {
    if (error) console.error('pay-rates: admin check failed', error)
    refusal = { success: false, error: 'Not authenticated' }
  } else if (user.app_metadata?.role !== 'admin') {
    console.warn('pay-rates: write refused, not an admin', user.id)
    refusal = { success: false, error: 'Unauthorized' }
  }
  return refusal
}

async function getRateKey(supabase: Supabase, rateId: string): Promise<RateKey | null> {
  const { data, error } = await supabase
    .from('pay_rates')
    .select('employee_id, effective_from')
    .eq('id', rateId)
    .maybeSingle()

  if (error) throw error
  return data
}

// The app's own check, so the usual clash gets a field error; the partial unique index on live
// rates is the guarantee and is mapped to the same message.
async function hasLiveRateOn(
  supabase: Supabase,
  key: RateKey,
  exceptRateId: string | null
): Promise<boolean> {
  let query = supabase
    .from('pay_rates')
    .select('id')
    .eq('employee_id', key.employee_id)
    .eq('effective_from', key.effective_from)
    .eq('is_archived', false)
  if (exceptRateId) {
    query = query.neq('id', exceptRateId)
  }

  const { data, error } = await query.limit(1)
  if (error) throw error
  return data.length > 0
}

function toSaveFailure(
  operation: 'add' | 'edit',
  id: string,
  error: PostgrestError
): PayRateActionResult {
  let result: PayRateActionResult
  if (error.code === UNIQUE_VIOLATION) {
    console.warn(`pay-rates: ${operation} refused by the unique index`, id)
    result = DUPLICATE_DATE_FAILURE
  } else {
    console.error(`pay-rates: ${operation} failed`, id, error)
    result = { success: false, error: SAVE_RATE_ERROR }
  }
  return result
}

function revalidatePayRatePaths(employeeId: string): void {
  revalidatePath(`/solutions/employees/${employeeId}`)
  // Every Payroll screen prices unpaid shifts from these rates.
  revalidatePath('/solutions/payroll', 'layout')
}
