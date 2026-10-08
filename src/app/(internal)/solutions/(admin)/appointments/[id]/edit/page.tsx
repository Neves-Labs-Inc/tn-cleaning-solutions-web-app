import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import type { PostgrestError } from '@supabase/supabase-js'

import { AppointmentForm } from '@/components/admin/appointment-form'
import { AppointmentScheduleContext } from '@/components/admin/new-appointment-schedule-context'
import { fetchClientJobRules } from '@/lib/pricing/lookup'
import { pickEffectiveRule, type ClientJobRule } from '@/lib/pricing/resolve'
import { createClient } from '@/lib/supabase/server'

type EditAppointmentPageProps = {
  params: Promise<{ id: string }>
}

type RecurrenceSeriesRow = {
  id: string
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly'
  start_date: string
  end_date: string | null
  max_occurrences: number | null
}

type AppointmentRow = {
  id: string
  client_id: string
  job_id: string
  location_id: string | null
  recurrence_series_id: string | null
  scheduled_date: string
  scheduled_start_time: string
  scheduled_end_time: string
  price_override_cents: number | null
  notes: string
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
  is_archived: boolean
  appointment_employees: Array<{ employee_id: string }> | null
}

export default async function EditAppointmentPage({ params }: EditAppointmentPageProps) {
  const { id } = await params
  const supabase = await createClient()

  const [
    { data: appointment, error: appointmentError },
    { data: clients, error: clientsError },
    { data: jobs, error: jobsError },
    { data: employees, error: employeesError },
  ] = await Promise.all([
    supabase
      .from('appointments')
      .select(
        `
          id, client_id, job_id, location_id, recurrence_series_id, scheduled_date, scheduled_start_time,
          scheduled_end_time, price_override_cents, notes, status, is_archived,
          appointment_employees(employee_id)
        `
      )
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('clients')
      .select('id, name, client_locations(id, label, address, is_archived)')
      .eq('is_active', true)
      .eq('is_archived', false)
      .order('name', { ascending: true }),
    supabase
      .from('jobs')
      .select('id, name, hourly_rate_cents')
      .eq('is_archived', false)
      .order('name', { ascending: true }),
    supabase
      .from('employees')
      .select('id, full_name')
      .eq('is_archived', false)
      .order('full_name', { ascending: true }),
  ])

  if (appointmentError || !appointment || appointment.is_archived) {
    notFound()
  }

  const typedAppointment: AppointmentRow = appointment
  let recurrenceSeries: RecurrenceSeriesRow | null = null
  let recurrenceSeriesError: PostgrestError | null = null

  if (typedAppointment.recurrence_series_id) {
    const { data, error } = await supabase
      .from('recurrence_series')
      .select('id, frequency, start_date, end_date, max_occurrences')
      .eq('id', typedAppointment.recurrence_series_id)
      .neq('is_archived', true)
      .maybeSingle()

    recurrenceSeries = data as RecurrenceSeriesRow | null
    recurrenceSeriesError = error
  }

  const loadError = clientsError ?? jobsError ?? employeesError ?? recurrenceSeriesError

  const jobRows = jobs ?? []

  let rulesByPair = new Map<string, ClientJobRule[]>()
  let rulesErrorMessage: string | null = null

  try {
    rulesByPair = await fetchClientJobRules(
      supabase,
      jobRows.map((job) => ({ clientId: typedAppointment.client_id, jobId: job.id }))
    )
  } catch (thrown) {
    console.error('Error fetching client job pricing:', thrown)
    rulesErrorMessage =
      thrown instanceof Error ? thrown.message : 'Client pricing rules could not be loaded.'
  }

  const loadErrorMessage = loadError?.message ?? rulesErrorMessage

  const formJobs = jobRows.map((job) => ({
    id: job.id,
    name: job.name,
    hourly_rate_cents: job.hourly_rate_cents,
    client_rate_cents:
      pickEffectiveRule(
        rulesByPair.get(`${typedAppointment.client_id}:${job.id}`) ?? [],
        typedAppointment.scheduled_date
      )?.hourly_rate_cents ?? null,
  }))

  const appointmentFormAppointment = {
    id: typedAppointment.id,
    client_id: typedAppointment.client_id,
    job_id: typedAppointment.job_id,
    location_id: typedAppointment.location_id,
    recurrence_series_id: recurrenceSeries?.id ?? typedAppointment.recurrence_series_id,
    scheduled_date: typedAppointment.scheduled_date,
    scheduled_start_time: typedAppointment.scheduled_start_time,
    scheduled_end_time: typedAppointment.scheduled_end_time,
    price_override_cents: typedAppointment.price_override_cents,
    notes: typedAppointment.notes,
    status: typedAppointment.status,
    assignedEmployeeIds: (typedAppointment.appointment_employees ?? []).map((row) => row.employee_id),
  }
  const [scheduledYearValue, scheduledMonthValue] = typedAppointment.scheduled_date.split('-', 3)
  const scheduledMonth = Number(scheduledMonthValue)
  const scheduledYear = Number(scheduledYearValue)

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm shadow-emerald-950/5">
        <div className="space-y-3">
          <Link
            href={`/solutions/appointments/${id}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back to Appointment
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-neutral-950">Edit Appointments</h1>
            <p className="mt-2 text-sm text-neutral-600">Update schedule details and team assignments.</p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)] lg:items-start">
        <AppointmentScheduleContext
          initialMonth={scheduledMonth}
          initialYear={scheduledYear}
          currentAppointmentId={id}
          showNewAppointmentLink
        />

        {loadErrorMessage ? (
          <section className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadErrorMessage}
          </section>
        ) : typedAppointment.status === 'completed' ? (
          <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            This appointment cannot be edited because it has already been completed.
          </section>
        ) : typedAppointment.status === 'cancelled' ? (
          <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            This appointment cannot be edited because it has been cancelled. Reopen it to make changes.
          </section>
        ) : (
          // Keyed on the status so a clock-driven change remounts the uncontrolled status select instead of leaving it stale.
          <AppointmentForm
            key={typedAppointment.status}
            clients={(clients ?? []).map((client) => ({
              id: client.id,
              name: client.name,
              client_locations: (client.client_locations ?? [])
                .filter((location) => !location.is_archived)
                .map((location) => ({
                  id: location.id,
                  label: location.label,
                  address: location.address,
                })),
            }))}
            jobs={formJobs}
            employees={employees ?? []}
            appointment={appointmentFormAppointment}
            recurrenceSeries={recurrenceSeries ?? null}
          />
        )}
      </div>
    </div>
  )
}
