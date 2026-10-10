'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import {
  canCancel,
  canMarkComplete,
  canRestore,
  canUndoComplete,
  type AppointmentStatus,
} from '@/lib/appointments/lifecycle'
import { parseDollarsToCents } from '@/lib/pricing/money'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { TablesInsert } from '@/types/database'

type AppointmentFieldErrors = {
  client_id?: string
  job_id?: string
  location_id?: string
  scheduled_date?: string
  scheduled_start_time?: string
  scheduled_end_time?: string
  price_override?: string
  recurrence_frequency?: string
  recurrence_end_date?: string
  recurrence_max_occurrences?: string
}

export type AppointmentActionResult =
  | { success: true; data?: { id?: string; ids?: string[] } }
  | { success: false; error: string; fieldErrors?: AppointmentFieldErrors }

type RecurrenceFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly'

type ParsedCreateAppointmentInput = {
  client_id: string
  job_id: string
  location_id: string | null
  scheduled_date: string
  scheduled_start_time: string
  scheduled_end_time: string
  price_override_cents: number | null
  notes: string
  employee_ids: string[]
  is_recurring: boolean
  recurrence_frequency: RecurrenceFrequency | null
  recurrence_end_date: string | null
  recurrence_max_occurrences: number | null
}

type ParsedUpdateAppointmentInput = {
  job_id: string
  location_id: string | null
  scheduled_date: string
  scheduled_start_time: string
  scheduled_end_time: string
  price_override_cents: number | null
  notes: string
  employee_ids: string[]
}

type ParsedUpdateRecurrenceInput = {
  edit_scope: 'occurrence' | 'series' | 'future'
  recurrence_series_id: string | null
  recurrence_frequency: RecurrenceFrequency | null
  recurrence_end_date: string | null
  recurrence_max_occurrences: number | null
}

function isValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function isValidTime(value: string) {
  return /^\d{2}:\d{2}$/.test(value)
}

function compareTimes(start: string, end: string) {
  const [startHour, startMinute] = start.split(':').map(Number)
  const [endHour, endMinute] = end.split(':').map(Number)
  return endHour * 60 + endMinute - (startHour * 60 + startMinute)
}

function parsePositiveInt(raw: string): number | null | 'invalid' {
  if (!raw) {
    return null
  }

  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 'invalid'
  }

  return parsed
}

function uniqueIds(values: FormDataEntryValue[]) {
  return Array.from(new Set(values.map((value) => String(value)).filter(Boolean)))
}

function formatDate(date: Date) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDate(dateString: string) {
  const [year, month, day] = dateString.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function addDays(date: Date, amount: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + amount)
  return next
}

function addMonths(date: Date, amount: number) {
  const day = date.getUTCDate()
  const base = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
  base.setUTCMonth(base.getUTCMonth() + amount)

  const endOfTargetMonth = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate()
  base.setUTCDate(Math.min(day, endOfTargetMonth))
  return base
}

function generateRecurrenceDates(
  startDate: string,
  frequency: RecurrenceFrequency,
  endDate: string | null,
  maxOccurrences: number | null
): string[] {
  const start = parseDate(startDate)
  const effectiveLimit = Math.min(maxOccurrences ?? (endDate ? 365 : 26), 365)
  const dates: string[] = []

  let current = start
  while (dates.length < effectiveLimit) {
    const currentString = formatDate(current)
    if (endDate && currentString > endDate) {
      break
    }

    dates.push(currentString)

    if (frequency === 'daily') {
      current = addDays(current, 1)
    } else if (frequency === 'weekly') {
      current = addDays(current, 7)
    } else if (frequency === 'biweekly') {
      current = addDays(current, 14)
    } else {
      current = addMonths(current, 1)
    }
  }

  return dates
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

function parseCreateAppointmentFormData(formData: FormData):
  | { success: true; data: ParsedCreateAppointmentInput }
  | { success: false; error: string; fieldErrors: AppointmentFieldErrors } {
  const clientId = String(formData.get('client_id') ?? '').trim()
  const jobId = String(formData.get('job_id') ?? '').trim()
  const locationId = String(formData.get('location_id') ?? '').trim()
  const scheduledDate = String(formData.get('scheduled_date') ?? '').trim()
  const scheduledStartTime = String(formData.get('scheduled_start_time') ?? '').trim()
  const scheduledEndTime = String(formData.get('scheduled_end_time') ?? '').trim()
  const priceOverride = String(formData.get('price_override') ?? '').trim()
  const notes = String(formData.get('notes') ?? '').trim()
  const employeeIds = uniqueIds(formData.getAll('employee_ids'))

  const isRecurring = formData.get('is_recurring') === 'on'
  const recurrenceFrequencyRaw = String(formData.get('recurrence_frequency') ?? '').trim()
  const recurrenceEndDateRaw = String(formData.get('recurrence_end_date') ?? '').trim()
  const recurrenceMaxOccurrencesRaw = String(formData.get('recurrence_max_occurrences') ?? '').trim()

  const fieldErrors: AppointmentFieldErrors = {}

  if (!clientId) {
    fieldErrors.client_id = 'Client is required.'
  }

  if (!jobId) {
    fieldErrors.job_id = 'Job is required.'
  }

  if (!scheduledDate || !isValidDate(scheduledDate)) {
    fieldErrors.scheduled_date = 'Enter a valid date.'
  }

  if (!scheduledStartTime || !isValidTime(scheduledStartTime)) {
    fieldErrors.scheduled_start_time = 'Enter a valid start time.'
  }

  if (!scheduledEndTime || !isValidTime(scheduledEndTime)) {
    fieldErrors.scheduled_end_time = 'Enter a valid end time.'
  }

  if (
    scheduledStartTime &&
    scheduledEndTime &&
    isValidTime(scheduledStartTime) &&
    isValidTime(scheduledEndTime) &&
    compareTimes(scheduledStartTime, scheduledEndTime) <= 0
  ) {
    fieldErrors.scheduled_end_time = 'End time must be after start time.'
  }

  const priceOverrideCents = priceOverride ? parseDollarsToCents(priceOverride) : null
  if (priceOverride && priceOverrideCents === null) {
    fieldErrors.price_override = 'Enter a valid dollar amount.'
  }

  let recurrenceFrequency: RecurrenceFrequency | null = null
  if (isRecurring) {
    if (
      recurrenceFrequencyRaw !== 'daily' &&
      recurrenceFrequencyRaw !== 'weekly' &&
      recurrenceFrequencyRaw !== 'biweekly' &&
      recurrenceFrequencyRaw !== 'monthly'
    ) {
      fieldErrors.recurrence_frequency = 'Select a recurrence frequency.'
    } else {
      recurrenceFrequency = recurrenceFrequencyRaw
    }
  }

  if (isRecurring && recurrenceEndDateRaw && !isValidDate(recurrenceEndDateRaw)) {
    fieldErrors.recurrence_end_date = 'Enter a valid end date.'
  }

  const parsedMaxOccurrences = parsePositiveInt(recurrenceMaxOccurrencesRaw)
  if (isRecurring && parsedMaxOccurrences === 'invalid') {
    fieldErrors.recurrence_max_occurrences = 'Max occurrences must be a whole number greater than zero.'
  }

  const recurrenceMaxOccurrences =
    parsedMaxOccurrences === 'invalid' ? null : parsedMaxOccurrences

  if (
    isRecurring &&
    recurrenceEndDateRaw &&
    isValidDate(recurrenceEndDateRaw) &&
    scheduledDate &&
    isValidDate(scheduledDate) &&
    recurrenceEndDateRaw < scheduledDate
  ) {
    fieldErrors.recurrence_end_date = 'End date must be on or after the appointment date.'
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
      client_id: clientId,
      job_id: jobId,
      location_id: locationId || null,
      scheduled_date: scheduledDate,
      scheduled_start_time: scheduledStartTime,
      scheduled_end_time: scheduledEndTime,
      price_override_cents: priceOverrideCents,
      notes,
      employee_ids: employeeIds,
      is_recurring: isRecurring,
      recurrence_frequency: recurrenceFrequency,
      recurrence_end_date: recurrenceEndDateRaw || null,
      recurrence_max_occurrences: recurrenceMaxOccurrences,
    },
  }
}

function parseUpdateAppointmentFormData(formData: FormData):
  | { success: true; data: ParsedUpdateAppointmentInput }
  | { success: false; error: string; fieldErrors: AppointmentFieldErrors } {
  const jobId = String(formData.get('job_id') ?? '').trim()
  const locationId = String(formData.get('location_id') ?? '').trim()
  const scheduledDate = String(formData.get('scheduled_date') ?? '').trim()
  const scheduledStartTime = String(formData.get('scheduled_start_time') ?? '').trim()
  const scheduledEndTime = String(formData.get('scheduled_end_time') ?? '').trim()
  const priceOverride = String(formData.get('price_override') ?? '').trim()
  const notes = String(formData.get('notes') ?? '').trim()
  const employeeIds = uniqueIds(formData.getAll('employee_ids'))

  const fieldErrors: AppointmentFieldErrors = {}

  if (!jobId) {
    fieldErrors.job_id = 'Job is required.'
  }

  if (!scheduledDate || !isValidDate(scheduledDate)) {
    fieldErrors.scheduled_date = 'Enter a valid date.'
  }

  if (!scheduledStartTime || !isValidTime(scheduledStartTime)) {
    fieldErrors.scheduled_start_time = 'Enter a valid start time.'
  }

  if (!scheduledEndTime || !isValidTime(scheduledEndTime)) {
    fieldErrors.scheduled_end_time = 'Enter a valid end time.'
  }

  if (
    scheduledStartTime &&
    scheduledEndTime &&
    isValidTime(scheduledStartTime) &&
    isValidTime(scheduledEndTime) &&
    compareTimes(scheduledStartTime, scheduledEndTime) <= 0
  ) {
    fieldErrors.scheduled_end_time = 'End time must be after start time.'
  }

  const priceOverrideCents = priceOverride ? parseDollarsToCents(priceOverride) : null
  if (priceOverride && priceOverrideCents === null) {
    fieldErrors.price_override = 'Enter a valid dollar amount.'
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
      job_id: jobId,
      location_id: locationId || null,
      scheduled_date: scheduledDate,
      scheduled_start_time: scheduledStartTime,
      scheduled_end_time: scheduledEndTime,
      price_override_cents: priceOverrideCents,
      notes,
      employee_ids: employeeIds,
    },
  }
}

function parseUpdateRecurrenceFormData(formData: FormData):
  | { success: true; data: ParsedUpdateRecurrenceInput }
  | { success: false; error: string; fieldErrors: AppointmentFieldErrors } {
  const editScopeRaw = String(formData.get('edit_scope') ?? '').trim()
  const recurrenceSeriesId = String(formData.get('recurrence_series_id') ?? '').trim()
  const recurrenceFrequencyRaw = String(formData.get('recurrence_frequency') ?? '').trim()
  const recurrenceEndDateRaw = String(formData.get('recurrence_end_date') ?? '').trim()
  const recurrenceMaxOccurrencesRaw = String(formData.get('recurrence_max_occurrences') ?? '').trim()

  const fieldErrors: AppointmentFieldErrors = {}

  const editScope: ParsedUpdateRecurrenceInput['edit_scope'] =
    editScopeRaw === 'series' || editScopeRaw === 'future' || editScopeRaw === 'occurrence'
      ? editScopeRaw
      : 'occurrence'

  let recurrenceFrequency: RecurrenceFrequency | null = null
  if (recurrenceFrequencyRaw) {
    if (
      recurrenceFrequencyRaw !== 'daily' &&
      recurrenceFrequencyRaw !== 'weekly' &&
      recurrenceFrequencyRaw !== 'biweekly' &&
      recurrenceFrequencyRaw !== 'monthly'
    ) {
      fieldErrors.recurrence_frequency = 'Select a valid recurrence frequency.'
    } else {
      recurrenceFrequency = recurrenceFrequencyRaw
    }
  }

  if (recurrenceEndDateRaw && !isValidDate(recurrenceEndDateRaw)) {
    fieldErrors.recurrence_end_date = 'Enter a valid end date.'
  }

  const parsedMaxOccurrences = parsePositiveInt(recurrenceMaxOccurrencesRaw)
  if (recurrenceMaxOccurrencesRaw && parsedMaxOccurrences === 'invalid') {
    fieldErrors.recurrence_max_occurrences =
      'Max occurrences must be a whole number greater than zero.'
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
      edit_scope: editScope,
      recurrence_series_id: recurrenceSeriesId || null,
      recurrence_frequency: recurrenceFrequency,
      recurrence_end_date: recurrenceEndDateRaw || null,
      recurrence_max_occurrences: parsedMaxOccurrences === 'invalid' ? null : parsedMaxOccurrences,
    },
  }
}

export async function createAppointment(formData: FormData): Promise<AppointmentActionResult>
export async function createAppointment(
  _prevState: AppointmentActionResult,
  formData: FormData
): Promise<AppointmentActionResult>
export async function createAppointment(
  firstArg: FormData | AppointmentActionResult,
  secondArg?: FormData
): Promise<AppointmentActionResult> {
  const formData = firstArg instanceof FormData ? firstArg : secondArg

  if (!formData) {
    return { success: false, error: 'Invalid form submission.' }
  }

  const authResult = await requireAdminRole()
  if (!authResult.success) {
    return { success: false, error: authResult.error }
  }

  const parsed = parseCreateAppointmentFormData(formData)
  if (!parsed.success) {
    return parsed
  }

  let createdAppointmentIds: string[] = []

  try {
    const adminClient = createAdminClient()

    if (parsed.data.is_recurring && parsed.data.recurrence_frequency) {
      const recurrenceInsert: TablesInsert<'recurrence_series'> = {
        client_id: parsed.data.client_id,
        job_id: parsed.data.job_id,
        location_id: parsed.data.location_id,
        frequency: parsed.data.recurrence_frequency,
        start_date: parsed.data.scheduled_date,
        end_date: parsed.data.recurrence_end_date,
        max_occurrences: parsed.data.recurrence_max_occurrences,
        is_active: true,
      }

      const { data: recurrenceSeries, error: recurrenceError } = await adminClient
        .from('recurrence_series')
        .insert(recurrenceInsert)
        .select('id')
        .single()

      if (recurrenceError) {
        return { success: false, error: recurrenceError.message }
      }

      const recurrenceDates = generateRecurrenceDates(
        parsed.data.scheduled_date,
        parsed.data.recurrence_frequency,
        parsed.data.recurrence_end_date,
        parsed.data.recurrence_max_occurrences
      )

      if (recurrenceDates.length === 0) {
        return { success: false, error: 'No recurrence dates were generated.' }
      }

      const appointmentInserts: TablesInsert<'appointments'>[] = recurrenceDates.map((scheduledDate) => ({
        client_id: parsed.data.client_id,
        job_id: parsed.data.job_id,
        recurrence_series_id: recurrenceSeries.id,
        location_id: parsed.data.location_id,
        scheduled_date: scheduledDate,
        scheduled_start_time: parsed.data.scheduled_start_time,
        scheduled_end_time: parsed.data.scheduled_end_time,
        price_override_cents: parsed.data.price_override_cents,
        notes: parsed.data.notes,
        status: 'scheduled',
      }))

      const { data: appointments, error: appointmentsError } = await adminClient
        .from('appointments')
        .insert(appointmentInserts)
        .select('id')

      if (appointmentsError) {
        return { success: false, error: appointmentsError.message }
      }

      createdAppointmentIds = (appointments ?? []).map((row) => row.id)
    } else {
      const singleInsert: TablesInsert<'appointments'> = {
        client_id: parsed.data.client_id,
        job_id: parsed.data.job_id,
        recurrence_series_id: null,
        location_id: parsed.data.location_id,
        scheduled_date: parsed.data.scheduled_date,
        scheduled_start_time: parsed.data.scheduled_start_time,
        scheduled_end_time: parsed.data.scheduled_end_time,
        price_override_cents: parsed.data.price_override_cents,
        notes: parsed.data.notes,
        status: 'scheduled',
      }

      const { data: appointment, error: appointmentError } = await adminClient
        .from('appointments')
        .insert(singleInsert)
        .select('id')
        .single()

      if (appointmentError) {
        return { success: false, error: appointmentError.message }
      }

      createdAppointmentIds = [appointment.id]
    }

    if (parsed.data.employee_ids.length > 0 && createdAppointmentIds.length > 0) {
      const assignmentInserts: TablesInsert<'appointment_employees'>[] = []

      for (const appointmentId of createdAppointmentIds) {
        for (const employeeId of parsed.data.employee_ids) {
          assignmentInserts.push({
            appointment_id: appointmentId,
            employee_id: employeeId,
            admin_notes: '',
          })
        }
      }

      const { error: assignmentError } = await adminClient
        .from('appointment_employees')
        .insert(assignmentInserts)

      if (assignmentError) {
        return { success: false, error: assignmentError.message }
      }
    }
  } catch {
    return { success: false, error: 'Failed to create appointment.' }
  }

  revalidatePath('/solutions/appointments')
  redirect('/solutions/appointments')

  return {
    success: true,
    data: {
      ids: createdAppointmentIds,
      id: createdAppointmentIds[0],
    },
  }
}

export async function updateAppointment(id: string, formData: FormData): Promise<AppointmentActionResult>
export async function updateAppointment(
  id: string,
  _prevState: AppointmentActionResult,
  formData: FormData
): Promise<AppointmentActionResult>
export async function updateAppointment(
  id: string,
  secondArg: FormData | AppointmentActionResult,
  thirdArg?: FormData
): Promise<AppointmentActionResult> {
  const formData = secondArg instanceof FormData ? secondArg : thirdArg

  if (!id) {
    return { success: false, error: 'Appointment id is required.' }
  }

  if (!formData) {
    return { success: false, error: 'Invalid form submission.' }
  }

  const authResult = await requireAdminRole()
  if (!authResult.success) {
    return { success: false, error: authResult.error }
  }

  const parsed = parseUpdateAppointmentFormData(formData)
  if (!parsed.success) {
    return parsed
  }

  const parsedRecurrence = parseUpdateRecurrenceFormData(formData)
  if (!parsedRecurrence.success) {
    return parsedRecurrence
  }

  try {
    const adminClient = createAdminClient()

    const { data: existingAppointment, error: existingAppointmentError } = await adminClient
      .from('appointments')
      .select('id, client_id, recurrence_series_id, status')
      .eq('id', id)
      .eq('is_archived', false)
      .maybeSingle()

    if (existingAppointmentError) {
      return { success: false, error: existingAppointmentError.message }
    }

    if (!existingAppointment) {
      return { success: false, error: 'Appointment not found.' }
    }

    // The status the form displayed, not the one read just now: a Cleaner's clock can move the
    // status while the form is open, and saving the form's stale value would silently undo it.
    const expectedStatus = String(formData.get('expected_status') ?? existingAppointment.status)
    if (expectedStatus !== existingAppointment.status) {
      return {
        success: false,
        error: 'The appointment changed while you were editing it. Refresh and try again.',
      }
    }

    if (existingAppointment.status === 'completed') {
      return {
        success: false,
        error: 'This appointment cannot be edited because it has already been completed.',
      }
    }

    if (existingAppointment.status === 'cancelled') {
      return {
        success: false,
        error: 'This appointment cannot be edited because it has been cancelled. Restore it first.',
      }
    }

    if (parsedRecurrence.data.edit_scope === 'series' || parsedRecurrence.data.edit_scope === 'future') {
      if (!parsedRecurrence.data.recurrence_series_id) {
        return { success: false, error: 'Recurrence series is required for this edit scope.' }
      }

      if (!parsedRecurrence.data.recurrence_frequency) {
        return {
          success: false,
          error: 'Please correct the highlighted fields.',
          fieldErrors: {
            recurrence_frequency: 'Select a recurrence frequency.',
          },
        }
      }

      const recurrenceSeriesId = parsedRecurrence.data.recurrence_series_id

      if (!existingAppointment.recurrence_series_id || existingAppointment.recurrence_series_id !== recurrenceSeriesId) {
        return { success: false, error: 'Recurrence series not found.' }
      }

      const { data: recurrenceSeries, error: recurrenceSeriesError } = await adminClient
        .from('recurrence_series')
        .select('id')
        .eq('id', recurrenceSeriesId)
        .eq('is_archived', false)
        .maybeSingle()

      if (recurrenceSeriesError) {
        return { success: false, error: recurrenceSeriesError.message }
      }

      if (!recurrenceSeries) {
        return { success: false, error: 'Recurrence series not found.' }
      }
    }

    if (parsedRecurrence.data.edit_scope === 'series') {
      const recurrenceSeriesId = parsedRecurrence.data.recurrence_series_id
      if (!recurrenceSeriesId) {
        return { success: false, error: 'Recurrence series is required for this edit scope.' }
      }

      const { error: recurrenceUpdateError } = await adminClient
        .from('recurrence_series')
        .update({
          frequency: parsedRecurrence.data.recurrence_frequency,
          end_date: parsedRecurrence.data.recurrence_end_date,
          max_occurrences: parsedRecurrence.data.recurrence_max_occurrences,
        })
        .eq('id', recurrenceSeriesId)
        .eq('is_archived', false)

      if (recurrenceUpdateError) {
        return { success: false, error: recurrenceUpdateError.message }
      }
    } else {
      const { data: appointment, error: appointmentError } = await adminClient
        .from('appointments')
        .update({
          job_id: parsed.data.job_id,
          location_id: parsed.data.location_id,
          scheduled_date: parsed.data.scheduled_date,
          scheduled_start_time: parsed.data.scheduled_start_time,
          scheduled_end_time: parsed.data.scheduled_end_time,
          price_override_cents: parsed.data.price_override_cents,
          notes: parsed.data.notes,
        })
        .eq('id', id)
        .eq('is_archived', false)
        .eq('status', expectedStatus)
        .select(
          'id, client_id, job_id, recurrence_series_id, location_id, scheduled_date, scheduled_start_time, scheduled_end_time, price_override_cents, notes'
        )
        .maybeSingle()

      if (appointmentError) {
        return { success: false, error: appointmentError.message }
      }

      if (!appointment) {
        const { data: latestAppointment, error: latestAppointmentError } = await adminClient
          .from('appointments')
          .select('id')
          .eq('id', id)
          .eq('is_archived', false)
          .maybeSingle()

        if (latestAppointmentError) {
          return { success: false, error: latestAppointmentError.message }
        }

        if (!latestAppointment) {
          return { success: false, error: 'Appointment not found.' }
        }

        return {
          success: false,
          error: 'The appointment changed while you were editing it. Refresh and try again.',
        }
      }

      // An assignment row whose employee survives the edit is never rewritten: clocked_in_at,
      // clocked_out_at, admin_notes and the row id that updateClockTime and employee_clock address
      // all live on it, and the delete-and-reinsert this replaced destroyed them on every edit.
      const { data: existingAssignments, error: existingAssignmentsError } = await adminClient
        .from('appointment_employees')
        .select('id, employee_id')
        .eq('appointment_id', id)

      if (existingAssignmentsError) {
        return { success: false, error: existingAssignmentsError.message }
      }

      const assignmentRows = existingAssignments ?? []
      const submittedEmployeeIds = new Set(parsed.data.employee_ids)
      const assignedEmployeeIds = new Set(assignmentRows.map((row) => row.employee_id))

      const staleAssignmentIds = assignmentRows
        .filter((row) => !submittedEmployeeIds.has(row.employee_id))
        .map((row) => row.id)
      const newEmployeeIds = parsed.data.employee_ids.filter(
        (employeeId) => !assignedEmployeeIds.has(employeeId)
      )

      if (staleAssignmentIds.length > 0) {
        const { error: deleteAssignmentsError } = await adminClient
          .from('appointment_employees')
          .delete()
          .in('id', staleAssignmentIds)

        if (deleteAssignmentsError) {
          return { success: false, error: deleteAssignmentsError.message }
        }
      }

      if (newEmployeeIds.length > 0) {
        const assignmentInserts: TablesInsert<'appointment_employees'>[] = newEmployeeIds.map(
          (employeeId) => ({
            appointment_id: id,
            employee_id: employeeId,
            admin_notes: '',
          })
        )

        const { error: assignmentInsertError } = await adminClient
          .from('appointment_employees')
          .insert(assignmentInserts)

        if (assignmentInsertError) {
          return { success: false, error: assignmentInsertError.message }
        }
      }

      if (parsedRecurrence.data.edit_scope === 'future') {
        const recurrenceSeriesId = parsedRecurrence.data.recurrence_series_id
        if (!recurrenceSeriesId) {
          return { success: false, error: 'Recurrence series is required for this edit scope.' }
        }

        const { error: recurrenceUpdateError } = await adminClient
          .from('recurrence_series')
          .update({
            frequency: parsedRecurrence.data.recurrence_frequency,
            end_date: parsedRecurrence.data.recurrence_end_date,
            max_occurrences: parsedRecurrence.data.recurrence_max_occurrences,
          })
          .eq('id', recurrenceSeriesId)
          .eq('is_archived', false)

        if (recurrenceUpdateError) {
          return { success: false, error: recurrenceUpdateError.message }
        }

        const { data: preservedAppointments, error: preservedAppointmentsError } = await adminClient
          .from('appointments')
          .select('scheduled_date')
          .eq('recurrence_series_id', recurrenceSeriesId)
          .gt('scheduled_date', appointment.scheduled_date)
          .in('status', ['completed', 'cancelled'])
          .eq('is_archived', false)

        if (preservedAppointmentsError) {
          return { success: false, error: preservedAppointmentsError.message }
        }

        const preservedDates = new Set((preservedAppointments ?? []).map((row) => row.scheduled_date))

        const { data: futurePendingAppointments, error: futurePendingAppointmentsError } = await adminClient
          .from('appointments')
          .select('id')
          .eq('recurrence_series_id', recurrenceSeriesId)
          .gt('scheduled_date', appointment.scheduled_date)
          .eq('status', 'scheduled')
          .eq('is_archived', false)

        if (futurePendingAppointmentsError) {
          return { success: false, error: futurePendingAppointmentsError.message }
        }

        const futurePendingAppointmentIds = (futurePendingAppointments ?? []).map((row) => row.id)

        const nextDate = formatDate(addDays(parseDate(appointment.scheduled_date), 1))
        const recurrenceDates = generateRecurrenceDates(
          nextDate,
          parsedRecurrence.data.recurrence_frequency as RecurrenceFrequency,
          parsedRecurrence.data.recurrence_end_date,
          parsedRecurrence.data.recurrence_max_occurrences
        ).filter((scheduledDate) => !preservedDates.has(scheduledDate))

        if (recurrenceDates.length > 0) {
          const appointmentInserts: TablesInsert<'appointments'>[] = recurrenceDates.map((scheduledDate) => ({
            client_id: appointment.client_id,
            job_id: appointment.job_id,
            recurrence_series_id: appointment.recurrence_series_id,
            location_id: appointment.location_id,
            scheduled_date: scheduledDate,
            scheduled_start_time: appointment.scheduled_start_time,
            scheduled_end_time: appointment.scheduled_end_time,
            // REQ-014 / DET-2: a regenerated occurrence never inherits the source occurrence's
            // manual override, and has never been invoiced, so billed_price_cents stays unset.
            price_override_cents: null,
            notes: appointment.notes,
            status: 'scheduled',
          }))

          const { data: regeneratedAppointments, error: regeneratedAppointmentsError } = await adminClient
            .from('appointments')
            .insert(appointmentInserts)
            .select('id')

          if (regeneratedAppointmentsError) {
            return { success: false, error: regeneratedAppointmentsError.message }
          }

          const regeneratedAppointmentIds = (regeneratedAppointments ?? []).map((row) => row.id)

          if (parsed.data.employee_ids.length > 0 && regeneratedAppointmentIds.length > 0) {
            const regeneratedAssignmentInserts: TablesInsert<'appointment_employees'>[] = []

            for (const appointmentId of regeneratedAppointmentIds) {
              for (const employeeId of parsed.data.employee_ids) {
                regeneratedAssignmentInserts.push({
                  appointment_id: appointmentId,
                  employee_id: employeeId,
                  admin_notes: '',
                })
              }
            }

            const { error: regeneratedAssignmentsError } = await adminClient
              .from('appointment_employees')
              .insert(regeneratedAssignmentInserts)

            if (regeneratedAssignmentsError) {
              return { success: false, error: regeneratedAssignmentsError.message }
            }
          }
        }

        if (futurePendingAppointmentIds.length > 0) {
          const { error: deleteFuturePendingError } = await adminClient
            .from('appointments')
            .delete()
            .in('id', futurePendingAppointmentIds)

          if (deleteFuturePendingError) {
            return { success: false, error: deleteFuturePendingError.message }
          }
        }
      }
    }
  } catch {
    return { success: false, error: 'Failed to update appointment.' }
  }

  revalidatePath('/solutions/appointments')
  revalidatePath(`/solutions/appointments/${id}`)
  redirect(`/solutions/appointments/${id}`)

  return { success: true, data: { id } }
}

type LifecycleLoadResult =
  | { success: true; appointment: { id: string; status: AppointmentStatus; manually_completed: boolean } }
  | { success: false; error: string }

// Admin check plus the row read every lifecycle action starts from.
async function loadAppointmentForLifecycle(id: string): Promise<LifecycleLoadResult> {
  if (!id) {
    return { success: false, error: 'Appointment id is required.' }
  }

  const authResult = await requireAdminRole()
  if (!authResult.success) {
    return { success: false, error: authResult.error }
  }

  const { data, error } = await createAdminClient()
    .from('appointments')
    .select('id, status, manually_completed')
    .eq('id', id)
    .eq('is_archived', false)
    .maybeSingle()

  if (error) {
    return { success: false, error: error.message }
  }

  if (!data) {
    return { success: false, error: 'Appointment not found.' }
  }

  return { success: true, appointment: data }
}

function revalidateAppointment(id: string) {
  revalidatePath('/solutions/appointments')
  revalidatePath(`/solutions/appointments/${id}`)
}

export async function cancelAppointment(id: string): Promise<AppointmentActionResult> {
  const loaded = await loadAppointmentForLifecycle(id)
  if (!loaded.success) return loaded

  if (!canCancel(loaded.appointment.status)) {
    return { success: false, error: 'This appointment is already cancelled.' }
  }

  // The database error is returned verbatim: a paid-invoice trigger refuses with a message the admin must read.
  const { data, error } = await createAdminClient()
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('is_archived', false)
    .eq('status', loaded.appointment.status)
    .select('id')
    .maybeSingle()

  if (error) {
    return { success: false, error: error.message }
  }

  if (!data) {
    return {
      success: false,
      error: 'The appointment changed while you were cancelling it. Refresh and try again.',
    }
  }

  revalidateAppointment(id)

  return { success: true, data: { id } }
}

export async function restoreAppointment(id: string): Promise<AppointmentActionResult> {
  const loaded = await loadAppointmentForLifecycle(id)
  if (!loaded.success) return loaded

  if (!canRestore(loaded.appointment.status)) {
    return { success: false, error: 'This appointment is not cancelled.' }
  }

  // Any non-cancelled status will do: the appointments trigger replaces it with the derived one.
  const { data, error } = await createAdminClient()
    .from('appointments')
    .update({ status: 'scheduled' })
    .eq('id', id)
    .eq('is_archived', false)
    .eq('status', 'cancelled')
    .select('id')
    .maybeSingle()

  if (error) {
    return { success: false, error: error.message }
  }

  if (!data) {
    return {
      success: false,
      error: 'The appointment changed while you were restoring it. Refresh and try again.',
    }
  }

  revalidateAppointment(id)

  return { success: true, data: { id } }
}

async function setManuallyCompleted(id: string, manuallyCompleted: boolean): Promise<AppointmentActionResult> {
  const loaded = await loadAppointmentForLifecycle(id)
  if (!loaded.success) return loaded

  const { appointment } = loaded
  if (appointment.status === 'cancelled') {
    return { success: false, error: 'This appointment is cancelled. Restore it first.' }
  }

  if (manuallyCompleted && !canMarkComplete(appointment)) {
    return { success: false, error: 'This appointment is already marked complete.' }
  }

  if (!manuallyCompleted && !canUndoComplete(appointment)) {
    return { success: false, error: 'This appointment is not marked complete.' }
  }

  // The flag change makes the trigger re-derive the status from the flag and the clocks.
  const { data, error } = await createAdminClient()
    .from('appointments')
    .update({ manually_completed: manuallyCompleted })
    .eq('id', id)
    .eq('is_archived', false)
    .eq('manually_completed', !manuallyCompleted)
    .neq('status', 'cancelled')
    .select('id')
    .maybeSingle()

  if (error) {
    return { success: false, error: error.message }
  }

  if (!data) {
    return { success: false, error: 'The appointment changed in the meantime. Refresh and try again.' }
  }

  revalidateAppointment(id)

  return { success: true, data: { id } }
}

export async function markAppointmentComplete(id: string): Promise<AppointmentActionResult> {
  return setManuallyCompleted(id, true)
}

export async function undoAppointmentComplete(id: string): Promise<AppointmentActionResult> {
  return setManuallyCompleted(id, false)
}

export async function updateClockTime(
  appointmentEmployeeId: string,
  field: 'clocked_in_at' | 'clocked_out_at',
  value: string | null
): Promise<{ success: boolean; error?: string }> {
  if (!appointmentEmployeeId) {
    return { success: false, error: 'Appointment employee id is required.' }
  }

  const authResult = await requireAdminRole()
  if (!authResult.success) {
    return { success: false, error: authResult.error }
  }

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('appointment_employees')
    .update({ [field]: value || null })
    .eq('id', appointmentEmployeeId)
    .eq('is_archived', false)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/solutions/appointments')
  return { success: true }
}

export async function updateAppointmentEmployeeAdminNotes(
  appointmentEmployeeId: string,
  value: string
): Promise<{ success: boolean; error?: string }> {
  if (!appointmentEmployeeId) {
    return { success: false, error: 'Appointment employee id is required.' }
  }

  const authResult = await requireAdminRole()
  if (!authResult.success) {
    return { success: false, error: authResult.error }
  }

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('appointment_employees')
    .update({ admin_notes: value })
    .eq('id', appointmentEmployeeId)
    .eq('is_archived', false)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/solutions/appointments')
  return { success: true }
}
