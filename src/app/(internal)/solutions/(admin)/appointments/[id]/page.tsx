import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { ArrowLeft } from 'lucide-react'
import { notFound } from 'next/navigation'

import { AdminClockOverride } from '@/components/admin/admin-clock-override'
import AppointmentLifecycleActions, { CompletedByAdminHint } from '@/components/admin/appointment-lifecycle-actions'
import StatusBadge, { appointmentStatusBadge } from '@/components/ui/status-badge'
import type { AppointmentStatus } from '@/lib/appointments/lifecycle'
import {
  APPOINTMENT_PRICE_COLUMNS,
  priceAppointments,
  type DisplayPrice,
  type PriceableAppointment,
} from '@/lib/pricing'
import { formatCents, formatRate, UNPRICED_LABEL } from '@/lib/pricing/money'
import { formatBusinessDateTime } from '@/lib/schedule'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

type AppointmentDetailPageProps = {
  params: Promise<{ id: string }>
}

type AppointmentDetailRow = PriceableAppointment & {
  status: AppointmentStatus
  manually_completed: boolean
  notes: string
  is_archived: boolean
  clients: {
    id: string
    name: string
    phone: string | null
    email: string | null
  } | null
  jobs: {
    id: string
    name: string
    estimated_duration_minutes: number | null
    description: string | null
  } | null
  client_locations: {
    id: string
    label: string
    address: string
  } | null
  recurrence_series: {
    id: string
    frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly'
    start_date: string
    end_date: string | null
    max_occurrences: number | null
    is_active: boolean
  } | null
  appointment_employees:
    | Array<{
        id: string
        clocked_in_at: string | null
        clocked_out_at: string | null
        admin_notes: string
        employees: {
          id: string
          full_name: string
          phone: string | null
        } | null
      }>
    | null
}

type PriceView = {
  amount: string
  breakdown: string | null
  label: string
  isUnavailable: boolean
}

function employeeClockStatus(assignment: {
  clocked_in_at: string | null
  clocked_out_at: string | null
}) {
  if (!assignment.clocked_in_at) {
    return 'Not started'
  }

  if (!assignment.clocked_out_at) {
    return 'In progress'
  }

  return 'Completed'
}

export default async function AppointmentDetailPage({ params }: AppointmentDetailPageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('appointments')
    .select(
      `
        ${APPOINTMENT_PRICE_COLUMNS},
        status, manually_completed, notes, is_archived,
        clients!inner ( id, name, phone, email ),
        jobs!inner ( id, name, estimated_duration_minutes, description ),
        client_locations ( id, label, address ),
        recurrence_series ( id, frequency, start_date, end_date, max_occurrences, is_active ),
        appointment_employees (
          id, clocked_in_at, clocked_out_at, admin_notes,
          employees!inner ( id, full_name, phone )
        )
      `
    )
    .eq('id', id)
    // A crew-removed Cleaner's archived assignment is history, not crew; NULL counts as live.
    .not('appointment_employees.is_archived', 'is', true)
    .maybeSingle()

  const appointment = data as AppointmentDetailRow | null

  if (error || !appointment || appointment.is_archived) {
    notFound()
  }

  const priceView = await loadPriceView(supabase, appointment)

  const statusBadge = appointmentStatusBadge(appointment.status)

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm shadow-emerald-950/5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
            <Link
              href="/solutions/appointments"
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              Back to Appointments
            </Link>

            <div>
              <h1 className="text-3xl font-bold tracking-tight text-neutral-950">{appointment.jobs?.name ?? 'Appointment'}</h1>
              <p className="mt-2 text-sm text-neutral-600">
                {format(parseISO(appointment.scheduled_date), 'EEEE, MMMM d, yyyy')} •{' '}
                {appointment.scheduled_start_time.slice(0, 5)} - {appointment.scheduled_end_time.slice(0, 5)}
              </p>
            </div>

            <StatusBadge tone={statusBadge.tone}>{statusBadge.label}</StatusBadge>

            <CompletedByAdminHint status={appointment.status} manuallyCompleted={appointment.manually_completed} />
          </div>

          <AppointmentLifecycleActions
            appointmentId={appointment.id}
            status={appointment.status}
            manuallyCompleted={appointment.manually_completed}
            editHref={`/solutions/appointments/${appointment.id}/edit`}
          />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <article className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm shadow-emerald-950/5">
            <h2 className="text-lg font-semibold text-neutral-950">Details</h2>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Client</p>
                <p className="mt-1 text-sm font-medium text-neutral-900">{appointment.clients?.name ?? 'Unknown client'}</p>
                <p className="text-sm text-neutral-600">{appointment.clients?.phone ?? 'No phone on file'}</p>
                <p className="text-sm text-neutral-600">{appointment.clients?.email ?? 'No email on file'}</p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Location</p>
                <p className="mt-1 text-sm text-neutral-700">{appointment.client_locations?.label ?? 'No location selected'}</p>
                <p className="text-sm text-neutral-600">{appointment.client_locations?.address ?? 'N/A'}</p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Price</p>
                <p
                  className={cn(
                    'mt-1 text-sm font-semibold',
                    priceView.isUnavailable ? 'text-red-700' : 'text-neutral-900'
                  )}
                >
                  {priceView.amount}
                </p>
                {priceView.breakdown ? (
                  <p className="text-sm text-neutral-600">{priceView.breakdown}</p>
                ) : null}
                <p className={cn('text-xs', priceView.isUnavailable ? 'text-red-700' : 'text-neutral-500')}>
                  {priceView.label}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Estimated Duration</p>
                <p className="mt-1 text-sm text-neutral-700">
                  {appointment.jobs?.estimated_duration_minutes
                    ? `${appointment.jobs.estimated_duration_minutes} minutes`
                    : 'Not set'}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Job Description</p>
              <p className="text-sm leading-6 text-neutral-700">
                {appointment.jobs?.description?.trim() || 'No job description provided.'}
              </p>
            </div>

            <div className="mt-4 space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Notes</p>
              <p className="text-sm leading-6 text-neutral-700">{appointment.notes?.trim() || 'No notes added.'}</p>
            </div>
          </article>

          <article className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm shadow-emerald-950/5">
            <h2 className="text-lg font-semibold text-neutral-950">Team & Clock</h2>

            {(appointment.appointment_employees ?? []).length > 0 ? (
              <div className="mt-4 space-y-3">
                {(appointment.appointment_employees ?? []).map((assignment) => (
                  <div
                    key={assignment.id}
                    className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-neutral-900">
                          {assignment.employees?.full_name ?? 'Unknown employee'}
                        </p>
                        <p className="text-xs text-neutral-500">{assignment.employees?.phone ?? 'No phone on file'}</p>
                      </div>
                      <span className="rounded-full border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-neutral-700">
                        {employeeClockStatus(assignment)}
                      </span>
                    </div>

                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <p className="text-xs text-neutral-600">
                        Clock in:{' '}
                        <span className="font-medium text-neutral-800">
                          {assignment.clocked_in_at
                            ? formatBusinessDateTime(new Date(assignment.clocked_in_at))
                            : 'Not set'}
                        </span>
                      </p>
                      <p className="text-xs text-neutral-600">
                        Clock out:{' '}
                        <span className="font-medium text-neutral-800">
                          {assignment.clocked_out_at
                            ? formatBusinessDateTime(new Date(assignment.clocked_out_at))
                            : 'Not set'}
                        </span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-emerald-200 bg-emerald-50/40 px-4 py-6 text-sm text-neutral-600">
                No employees assigned yet.
              </div>
            )}

            <div className="mt-5 border-t border-neutral-100 pt-5">
              <h3 className="text-sm font-semibold text-neutral-900">Admin Clock Overrides</h3>
              <p className="mt-1 text-xs text-neutral-500">
                Update clock-in/out timestamps and internal admin notes per employee.
              </p>
              <div className="mt-3">
                <AdminClockOverride
                  appointmentEmployees={(appointment.appointment_employees ?? []).map((assignment) => ({
                    id: assignment.id,
                    employee_id: assignment.employees?.id ?? '',
                    full_name: assignment.employees?.full_name ?? 'Unknown employee',
                    phone: assignment.employees?.phone ?? null,
                    clocked_in_at: assignment.clocked_in_at,
                    clocked_out_at: assignment.clocked_out_at,
                    admin_notes: assignment.admin_notes,
                  }))}
                />
              </div>
            </div>
          </article>
        </div>

        <div className="space-y-4">
          {appointment.recurrence_series ? (
            <article className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm shadow-emerald-950/5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">Recurrence</h2>
              <p className="mt-2 text-sm text-neutral-900">
                {appointment.recurrence_series.frequency.charAt(0).toUpperCase()}
                {appointment.recurrence_series.frequency.slice(1)} schedule
              </p>
              <p className="mt-1 text-xs text-neutral-600">
                Starts {format(parseISO(appointment.recurrence_series.start_date), 'MMM d, yyyy')}
              </p>
              <p className="mt-1 text-xs text-neutral-600">
                {appointment.recurrence_series.end_date
                  ? `Ends ${format(parseISO(appointment.recurrence_series.end_date), 'MMM d, yyyy')}`
                  : 'No fixed end date'}
              </p>
              <p className="mt-1 text-xs text-neutral-600">
                {appointment.recurrence_series.max_occurrences
                  ? `Max ${appointment.recurrence_series.max_occurrences} occurrences`
                  : 'Open occurrence count'}
              </p>
              <span
                className={`mt-3 inline-flex rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                  appointment.recurrence_series.is_active
                    ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border border-neutral-200 bg-neutral-100 text-neutral-600'
                }`}
              >
                {appointment.recurrence_series.is_active ? 'Series Active' : 'Series Inactive'}
              </span>
            </article>
          ) : null}
        </div>
      </section>
    </div>
  )
}

async function loadPriceView(
  supabase: Awaited<ReturnType<typeof createClient>>,
  appointment: AppointmentDetailRow
): Promise<PriceView> {
  let view: PriceView

  try {
    const priced = await priceAppointments(supabase, [appointment])
    view = toPriceView(priced.get(appointment.id)?.display ?? { source: 'unpriced' })
  } catch (thrown) {
    console.error('Error pricing appointment:', appointment.id, thrown)
    view = {
      amount: 'Unavailable',
      breakdown: null,
      label: 'This appointment’s price could not be loaded, so no price is shown.',
      isUnavailable: true,
    }
  }

  return view
}

function toPriceView(display: DisplayPrice): PriceView {
  let view: PriceView

  if (display.source === 'unpriced') {
    view = {
      amount: UNPRICED_LABEL,
      breakdown: null,
      label: 'Unpriced: this appointment has no Job, so no price can be worked out.',
      isUnavailable: true,
    }
  } else if (display.source === 'billed') {
    view = { amount: formatCents(display.amount_cents), breakdown: null, label: 'Invoiced', isUnavailable: false }
  } else {
    view = {
      amount: formatCents(display.amount_cents),
      breakdown: rateBreakdown(display.rate_cents, display.minutes, display.headcount),
      label: priceSourceLabel(display.source),
      isUnavailable: false,
    }
  }

  return view
}

function rateBreakdown(rateCents: number | null, totalMinutes: number | null, headcount: number) {
  let breakdown: string | null = null

  if (rateCents !== null && totalMinutes !== null) {
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    const crew = headcount > 1 ? ` × ${headcount} cleaners` : ''
    breakdown = `${formatRate(rateCents)} × ${hours}h ${minutes}m${crew}`
  }

  return breakdown
}

function priceSourceLabel(source: 'appointment_override' | 'client_job_pricing' | 'job') {
  let label: string

  if (source === 'appointment_override') {
    label = 'Manual override'
  } else if (source === 'client_job_pricing') {
    label = 'Client rate'
  } else {
    label = 'Standard rate'
  }

  return label
}
