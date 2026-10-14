'use server'

import { revalidatePath } from 'next/cache'

import {
  parseCreateAppointmentFormData,
  parseUpdateAppointmentFormData,
  parseUpdateRecurrenceFormData,
  type AppointmentFieldErrors,
} from '@/lib/appointments/appointment-form'
import {
  hasSessionHistory,
  planCrewChange,
  planFutureVisitCleanup,
  preservedSeriesDates,
} from '@/lib/appointments/crew'
import { toAppointmentErrorMessage, type DatabaseLikeError } from '@/lib/appointments/errors'
import {
  canCancel,
  canEdit,
  canMarkComplete,
  canRestore,
  canUndoComplete,
  completedDateError,
  isCompletedByClocks,
  type AppointmentStatus,
} from '@/lib/appointments/lifecycle'
import { completeAppointments } from '@/lib/appointments/needs-completion'
import { followingRecurrenceDates, recurrenceDates } from '@/lib/appointments/recurrence'
import { getBusinessDate } from '@/lib/schedule/business-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { TablesInsert } from '@/types/database'

export type AppointmentActionResult =
  | { success: true; data?: { id?: string; ids?: string[] } }
  | { success: false; error: string; fieldErrors?: AppointmentFieldErrors }

// Reached only if the parser let a recurring scope through without an interval.
const MISSING_INTERVAL_RESULT: AppointmentActionResult = {
  success: false,
  error: 'Please correct the highlighted fields.',
  fieldErrors: { recurrence_interval_unit: 'Select a repeat unit.' },
}

async function requireAdminRole(): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) {
    return { success: false, error: toAppointmentErrorMessage(error, 'requireAdminRole') }
  }

  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  if (user.app_metadata?.role !== 'admin') {
    return { success: false, error: 'Unauthorized' }
  }

  return { success: true }
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
  if (parsed.data.is_recurring && !parsed.data.recurrence_interval) {
    return MISSING_INTERVAL_RESULT
  }

  let createdAppointmentIds: string[] = []

  try {
    const adminClient = createAdminClient()

    const interval = parsed.data.recurrence_interval
    if (parsed.data.is_recurring && interval) {
      const recurrenceInsert: TablesInsert<'recurrence_series'> = {
        client_id: parsed.data.client_id,
        job_id: parsed.data.job_id,
        location_id: parsed.data.location_id,
        interval_unit: interval.unit,
        interval_count: interval.count,
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
        return { success: false, error: toAppointmentErrorMessage(recurrenceError, 'createAppointment') }
      }

      const seriesDates = recurrenceDates({
        anchorDate: parsed.data.scheduled_date,
        interval,
        endDate: parsed.data.recurrence_end_date,
        maxOccurrences: parsed.data.recurrence_max_occurrences,
      })

      if (seriesDates.length === 0) {
        return { success: false, error: 'No recurrence dates were generated.' }
      }

      const appointmentInserts: TablesInsert<'appointments'>[] = seriesDates.map((scheduledDate) => ({
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
        return { success: false, error: toAppointmentErrorMessage(appointmentsError, 'createAppointment') }
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
        return { success: false, error: toAppointmentErrorMessage(appointmentError, 'createAppointment') }
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
        return { success: false, error: toAppointmentErrorMessage(assignmentError, 'createAppointment') }
      }
    }
  } catch {
    return { success: false, error: 'Failed to create appointment.' }
  }

  revalidatePath('/solutions/appointments')
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

  let claimingInvoiceId: string | null = null
  // Every appointment the edit touched, so the client can patch its cached rows.
  const changedIds = [id]

  try {
    const adminClient = createAdminClient()

    const { data: existingAppointment, error: existingAppointmentError } = await adminClient
      .from('appointments')
      .select('id, client_id, recurrence_series_id, status, manually_completed')
      .eq('id', id)
      .eq('is_archived', false)
      .maybeSingle()

    if (existingAppointmentError) {
      return { success: false, error: toAppointmentErrorMessage(existingAppointmentError, 'updateAppointment') }
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

    if (!canEdit(existingAppointment.status)) {
      return {
        success: false,
        error: 'This appointment cannot be edited because it has been cancelled. Restore it first.',
      }
    }

    const scheduledDateError = completedDateError({
      status: existingAppointment.status,
      scheduledDate: parsed.data.scheduled_date,
      businessDate: getBusinessDate(new Date()),
    })
    if (scheduledDateError) {
      return {
        success: false,
        error: 'Please correct the highlighted fields.',
        fieldErrors: { scheduled_date: scheduledDateError },
      }
    }

    // Read before the write: a client change drops a draft line, and that invoice's page must refresh too.
    const { data: liveClaim, error: liveClaimError } = await adminClient
      .from('invoice_appointments')
      .select('invoice_id')
      .eq('appointment_id', id)
      .eq('is_archived', false)
      .is('cancelled_at', null)
      .maybeSingle()

    if (liveClaimError) {
      return { success: false, error: toAppointmentErrorMessage(liveClaimError, 'updateAppointment') }
    }
    claimingInvoiceId = liveClaim?.invoice_id ?? null

    if (parsedRecurrence.data.edit_scope === 'series' || parsedRecurrence.data.edit_scope === 'future') {
      if (!parsedRecurrence.data.recurrence_series_id) {
        return { success: false, error: 'Recurrence series is required for this edit scope.' }
      }

      if (!parsedRecurrence.data.recurrence_interval) {
        return MISSING_INTERVAL_RESULT
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
        return { success: false, error: toAppointmentErrorMessage(recurrenceSeriesError, 'updateAppointment') }
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
      const interval = parsedRecurrence.data.recurrence_interval
      if (!interval) {
        return MISSING_INTERVAL_RESULT
      }

      const { error: recurrenceUpdateError } = await adminClient
        .from('recurrence_series')
        .update({
          interval_unit: interval.unit,
          interval_count: interval.count,
          end_date: parsedRecurrence.data.recurrence_end_date,
          max_occurrences: parsedRecurrence.data.recurrence_max_occurrences,
        })
        .eq('id', recurrenceSeriesId)
        .eq('is_archived', false)

      if (recurrenceUpdateError) {
        return { success: false, error: toAppointmentErrorMessage(recurrenceUpdateError, 'updateAppointment') }
      }
    } else {
      const { data: appointment, error: appointmentError } = await adminClient
        .from('appointments')
        .update({
          // The invoicing trigger drops a draft line on a client change and refuses on an issued or paid one.
          client_id: parsed.data.client_id,
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
        return { success: false, error: toAppointmentErrorMessage(appointmentError, 'updateAppointment') }
      }

      if (!appointment) {
        const { data: latestAppointment, error: latestAppointmentError } = await adminClient
          .from('appointments')
          .select('id')
          .eq('id', id)
          .eq('is_archived', false)
          .maybeSingle()

        if (latestAppointmentError) {
          return { success: false, error: toAppointmentErrorMessage(latestAppointmentError, 'updateAppointment') }
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
      // clocked_out_at, admin_notes and the row id that correct_session_clocks and employee_clock address
      // all live on it, and the delete-and-reinsert this replaced destroyed them on every edit.
      // Archived rows are loaded too so the planner can tell a re-added Cleaner needs a fresh row.
      const { data: existingAssignments, error: existingAssignmentsError } = await adminClient
        .from('appointment_employees')
        .select(
          'id, employee_id, is_archived, clocked_in_at, clocked_out_at, clock_corrections(count), odd_duration_acknowledgements(count)'
        )
        .eq('appointment_id', id)

      if (existingAssignmentsError) {
        return { success: false, error: toAppointmentErrorMessage(existingAssignmentsError, 'updateAppointment') }
      }

      const crewPlan = planCrewChange(
        (existingAssignments ?? []).map((row) => ({
          id: row.id,
          employee_id: row.employee_id,
          is_archived: row.is_archived,
          hasHistory: hasSessionHistory({
            clocked_in_at: row.clocked_in_at,
            clocked_out_at: row.clocked_out_at,
            correctionCount: row.clock_corrections[0]?.count ?? 0,
            acknowledgementCount: row.odd_duration_acknowledgements[0]?.count ?? 0,
          }),
          hasClockIn: row.clocked_in_at !== null,
        })),
        parsed.data.employee_ids,
        existingAppointment
      )
      const newEmployeeIds = crewPlan.insertEmployeeIds

      // Flagged before any row is archived or deleted, so the derived status never leaves completed
      // and neither the invoicing trigger nor the completed_at stamp fires.
      if (crewPlan.shouldTurnOnManualCompletion) {
        const { data: manualCompletion, error: manualCompletionError } = await adminClient
          .from('appointments')
          .update({ manually_completed: true })
          .eq('id', id)
          .eq('is_archived', false)
          .eq('status', 'completed')
          .eq('manually_completed', false)
          .select('id')
          .maybeSingle()

        if (manualCompletionError) {
          return { success: false, error: toAppointmentErrorMessage(manualCompletionError, 'updateAppointment') }
        }

        if (!manualCompletion) {
          return {
            success: false,
            error: 'The appointment changed while you were editing it. Refresh and try again.',
          }
        }
      }

      // Hours records and their corrections must survive 6 years, so a removed Cleaner with any
      // history is archived; the crew trigger re-derives status on archive as it does on delete.
      if (crewPlan.archiveIds.length > 0) {
        const { error: archiveAssignmentsError } = await adminClient
          .from('appointment_employees')
          .update({ is_archived: true })
          .in('id', crewPlan.archiveIds)

        if (archiveAssignmentsError) {
          return { success: false, error: toAppointmentErrorMessage(archiveAssignmentsError, 'updateAppointment') }
        }
      }

      if (crewPlan.deleteIds.length > 0) {
        const { error: deleteAssignmentsError } = await adminClient
          .from('appointment_employees')
          .delete()
          .in('id', crewPlan.deleteIds)
          // A clock-in since the read makes the row history; it is left in place, not deleted.
          .is('clocked_in_at', null)
          .is('clocked_out_at', null)

        if (deleteAssignmentsError) {
          return { success: false, error: toAppointmentErrorMessage(deleteAssignmentsError, 'updateAppointment') }
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
          return { success: false, error: toAppointmentErrorMessage(assignmentInsertError, 'updateAppointment') }
        }
      }

      if (parsedRecurrence.data.edit_scope === 'future') {
        const recurrenceSeriesId = parsedRecurrence.data.recurrence_series_id
        if (!recurrenceSeriesId) {
          return { success: false, error: 'Recurrence series is required for this edit scope.' }
        }
        const interval = parsedRecurrence.data.recurrence_interval
        if (!interval) {
          return MISSING_INTERVAL_RESULT
        }

        const { error: recurrenceUpdateError } = await adminClient
          .from('recurrence_series')
          .update({
            interval_unit: interval.unit,
            interval_count: interval.count,
            end_date: parsedRecurrence.data.recurrence_end_date,
            max_occurrences: parsedRecurrence.data.recurrence_max_occurrences,
          })
          .eq('id', recurrenceSeriesId)
          .eq('is_archived', false)

        if (recurrenceUpdateError) {
          return { success: false, error: toAppointmentErrorMessage(recurrenceUpdateError, 'updateAppointment') }
        }

        // Every later appointment, Protected or not, with every invoice line (released or
        // Cancelled ones too, since deleting the appointment would cascade them off their invoice)
        // and every assignment (archived or not, so a removed Cleaner's hours keep it alive).
        const { data: laterAppointments, error: laterAppointmentsError } = await adminClient
          .from('appointments')
          .select(
            'id, scheduled_date, status, manually_completed, appointment_employees(clocked_in_at, clocked_out_at, clock_corrections(count), odd_duration_acknowledgements(count)), invoice_lines:invoice_appointments(appointment_id)'
          )
          .eq('recurrence_series_id', recurrenceSeriesId)
          .gt('scheduled_date', appointment.scheduled_date)
          .eq('is_archived', false)

        if (laterAppointmentsError) {
          return { success: false, error: toAppointmentErrorMessage(laterAppointmentsError, 'updateAppointment') }
        }

        const cleanupPlan = planFutureVisitCleanup(
          (laterAppointments ?? []).map((row) => ({
            id: row.id,
            scheduled_date: row.scheduled_date,
            status: row.status,
            manually_completed: row.manually_completed,
            hasInvoiceLine: row.invoice_lines.length > 0,
            assignments: row.appointment_employees.map((assignment) => ({
              clocked_in_at: assignment.clocked_in_at,
              clocked_out_at: assignment.clocked_out_at,
              correctionCount: assignment.clock_corrections[0]?.count ?? 0,
              acknowledgementCount: assignment.odd_duration_acknowledgements[0]?.count ?? 0,
            })),
          }))
        )

        // Delete before regenerating: if the delete is refused (a RESTRICT audit FK), nothing has
        // been inserted yet. The function re-checks under lock, so an appointment clocked into or
        // invoiced since the read survives, and its date is kept instead of getting a twin.
        let deletedIds = new Set<string>()
        if (cleanupPlan.deleteIds.length > 0) {
          const { data: deletedRows, error: deleteLaterError } = await adminClient.rpc(
            'delete_unprotected_series_appointments',
            { appointment_ids: cleanupPlan.deleteIds }
          )

          if (deleteLaterError) {
            return { success: false, error: toAppointmentErrorMessage(deleteLaterError, 'updateAppointment') }
          }
          deletedIds = new Set(deletedRows ?? [])
          changedIds.push(...deletedIds)
        }

        const preservedDates = preservedSeriesDates(cleanupPlan, laterAppointments ?? [], deletedIds)

        // The cadence restarts from the edited visit's saved date; that visit itself already exists.
        const regeneratedDates = followingRecurrenceDates({
          anchorDate: appointment.scheduled_date,
          interval,
          endDate: parsedRecurrence.data.recurrence_end_date,
          maxOccurrences: parsedRecurrence.data.recurrence_max_occurrences,
        }).filter((scheduledDate) => !preservedDates.has(scheduledDate))

        if (regeneratedDates.length > 0) {
          const appointmentInserts: TablesInsert<'appointments'>[] = regeneratedDates.map((scheduledDate) => ({
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
            return { success: false, error: toAppointmentErrorMessage(regeneratedAppointmentsError, 'updateAppointment') }
          }

          const regeneratedAppointmentIds = (regeneratedAppointments ?? []).map((row) => row.id)
          changedIds.push(...regeneratedAppointmentIds)

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
              return { success: false, error: toAppointmentErrorMessage(regeneratedAssignmentsError, 'updateAppointment') }
            }
          }
        }

      }
    }
  } catch {
    return { success: false, error: 'Failed to update appointment.' }
  }

  revalidatePath('/solutions/appointments')
  revalidatePath(`/solutions/appointments/${id}`)
  if (claimingInvoiceId) {
    revalidatePath(`/solutions/invoices/${claimingInvoiceId}`)
  }
  return { success: true, data: { id, ids: changedIds } }
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
    return { success: false, error: toAppointmentErrorMessage(error, 'loadAppointmentForLifecycle') }
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

  // A paid-invoice trigger refuses with P0001 and a message the admin must read; it passes through.
  const { data, error } = await createAdminClient()
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('is_archived', false)
    .eq('status', loaded.appointment.status)
    .select('id')
    .maybeSingle()

  if (error) {
    return { success: false, error: toAppointmentErrorMessage(error, 'cancelAppointment') }
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
    return { success: false, error: toAppointmentErrorMessage(error, 'restoreAppointment') }
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

  if (manuallyCompleted && isCompletedByClocks(appointment)) {
    return { success: false, error: 'This appointment is already completed.' }
  }

  if (manuallyCompleted && !canMarkComplete(appointment)) {
    return { success: false, error: 'This appointment is already marked complete.' }
  }

  if (!manuallyCompleted && !canUndoComplete(appointment)) {
    return { success: false, error: 'This appointment is not marked complete.' }
  }

  // The flag change makes the trigger re-derive the status from the flag and the clocks.
  // Marking also refuses a visit that completed by its clocks mid-submit.
  const excludedStatuses = manuallyCompleted ? '(cancelled,completed)' : '(cancelled)'
  const { data, error } = await createAdminClient()
    .from('appointments')
    .update({ manually_completed: manuallyCompleted })
    .eq('id', id)
    .eq('is_archived', false)
    .eq('manually_completed', !manuallyCompleted)
    .not('status', 'in', excludedStatuses)
    .select('id')
    .maybeSingle()

  if (error) {
    return { success: false, error: toAppointmentErrorMessage(error, 'setManuallyCompleted') }
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

export type BulkCompleteResult =
  // failedIds: never reached because a later batch failed; the rest of the call committed.
  | { success: true; completedCount: number; skippedCount: number; failedIds: string[] }
  | { success: false; error: string }

// Needs completion's bulk Mark complete. Visits that changed since the list loaded are skipped,
// not refused, so the rest still complete.
export async function markAppointmentsComplete(ids: string[]): Promise<BulkCompleteResult> {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { success: false, error: 'Pick at least one appointment.' }
  }

  const authResult = await requireAdminRole()
  if (!authResult.success) {
    return { success: false, error: authResult.error }
  }

  let result: BulkCompleteResult
  try {
    const { completed, skipped, failed } = await completeAppointments(createAdminClient(), ids.map(String))
    result = { success: true, completedCount: completed.length, skippedCount: skipped.length, failedIds: failed }
  } catch (thrown) {
    // A PostgREST error or a network Error: both carry the message (and maybe code) it reads.
    result = {
      success: false,
      error: toAppointmentErrorMessage(thrown as DatabaseLikeError, 'markAppointmentsComplete'),
    }
  }

  // Success covers a partial run too. Skipped rows changed elsewhere, so the screen is stale even
  // when none completed.
  if (result.success) {
    revalidatePath('/solutions/appointments')
    revalidatePath('/solutions/appointments/[id]', 'page')
  }

  return result
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
    return { success: false, error: toAppointmentErrorMessage(error, 'updateAppointmentEmployeeAdminNotes') }
  }

  revalidatePath('/solutions/appointments')
  return { success: true }
}
