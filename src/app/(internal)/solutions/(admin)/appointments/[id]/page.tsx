import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { ArrowLeft, Pencil } from 'lucide-react'
import { notFound } from 'next/navigation'

import { AdminClockOverride } from '@/components/admin/admin-clock-override'
import { Button } from '@/components/ui/button'
import { cancelAppointment, uncancelAppointment } from '@/lib/actions/appointments'
import { fetchClientJobRules } from '@/lib/pricing/lookup'
import { durationMinutes, formatCents, formatRate } from '@/lib/pricing/money'
import {
  pickEffectiveRule,
  resolveAppointmentPrice,
  type PriceSource,
  type ResolvedPrice,
} from '@/lib/pricing/resolve'
import { formatBusinessDateTime } from '@/lib/schedule'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

type AppointmentDetailPageProps = {
  params: Promise<{ id: string }>
}

type AppointmentDetailRow = {
  id: string
  client_id: string
  job_id: string
  scheduled_date: string
  scheduled_start_time: string
  scheduled_end_time: string
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
  notes: string
  price_override_cents: number | null
  billed_price_cents: number | null
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
    hourly_rate_cents: number
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

function statusBadgeClasses(status: AppointmentDetailRow['status']) {
  if (status === 'in_progress') {
    return 'border border-emerald-200 bg-emerald-50 text-emerald-700'
  }

  if (status === 'completed') {
    return 'border border-neutral-200 bg-neutral-100 text-neutral-700'
  }

  if (status === 'cancelled') {
    return 'border border-red-200 bg-red-50 text-red-600'
  }

  return 'border border-blue-200 bg-blue-50 text-blue-700'
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
        id, client_id, job_id, scheduled_date, scheduled_start_time, scheduled_end_time,
        status, notes, price_override_cents, billed_price_cents, is_archived,
        clients!inner ( id, name, phone, email ),
        jobs!inner ( id, name, hourly_rate_cents, estimated_duration_minutes, description ),
        client_locations ( id, label, address ),
        recurrence_series ( id, frequency, start_date, end_date, max_occurrences, is_active ),
        appointment_employees (
          id, clocked_in_at, clocked_out_at, admin_notes,
          employees!inner ( id, full_name, phone )
        )
      `
    )
    .eq('id', id)
    .maybeSingle()

  const appointment = data as AppointmentDetailRow | null

  if (error || !appointment || appointment.is_archived) {
    notFound()
  }

  let priceView: PriceView

  if (appointment.billed_price_cents === null) {
    priceView = await resolvedPriceView(supabase, appointment)
  } else {
    priceView = {
      amount: formatCents(appointment.billed_price_cents),
      breakdown: null,
      label: 'Invoiced',
      isUnavailable: false,
    }
  }

  async function handleCancelAppointment() {
    'use server'

    await cancelAppointment(id)
  }

  async function handleUncancelAppointment() {
    'use server'

    await uncancelAppointment(id)
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm shadow-emerald-950/5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
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

            <span
              className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${statusBadgeClasses(
                appointment.status
              )}`}
            >
              {appointment.status.replace('_', ' ')}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/solutions/appointments/${appointment.id}/edit`}>
              <Button className="h-10 rounded-full bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700">
                <Pencil className="size-4" aria-hidden="true" />
                Edit
              </Button>
            </Link>

            {appointment.status === 'cancelled' ? (
              <form action={handleUncancelAppointment}>
                <Button
                  type="submit"
                  variant="outline"
                  className="h-10 rounded-full border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                >
                  Reopen
                </Button>
              </form>
            ) : appointment.status === 'completed' ? null : (
              <form action={handleCancelAppointment}>
                <Button
                  type="submit"
                  variant="outline"
                  className="h-10 rounded-full border-red-200 text-red-600 hover:bg-red-50"
                >
                  Cancel
                </Button>
              </form>
            )}
          </div>
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

async function resolvedPriceView(
  supabase: Awaited<ReturnType<typeof createClient>>,
  appointment: AppointmentDetailRow
): Promise<PriceView> {
  let view: PriceView

  try {
    const rulesByPair = await fetchClientJobRules(supabase, [
      { clientId: appointment.client_id, jobId: appointment.job_id },
    ])
    const resolved = resolveAppointmentPrice({
      job: { hourly_rate_cents: appointment.jobs?.hourly_rate_cents ?? 0 },
      rule: pickEffectiveRule(
        rulesByPair.get(`${appointment.client_id}:${appointment.job_id}`) ?? [],
        appointment.scheduled_date
      ),
      minutes: durationMinutes(appointment.scheduled_start_time, appointment.scheduled_end_time),
      appointmentOverrideCents: appointment.price_override_cents,
    })

    view = {
      amount: formatCents(resolved.amount_cents),
      breakdown: rateBreakdown(resolved),
      label: priceSourceLabel(resolved.source),
      isUnavailable: false,
    }
  } catch (thrown) {
    console.error('Error fetching client job pricing:', thrown)
    view = {
      amount: 'Unavailable',
      breakdown: null,
      label: 'This client’s negotiated rates could not be loaded, so no price is shown.',
      isUnavailable: true,
    }
  }

  return view
}

function rateBreakdown(resolved: ResolvedPrice) {
  let breakdown: string | null = null

  if (resolved.rate_cents !== null && resolved.minutes !== null) {
    const hours = Math.floor(resolved.minutes / 60)
    const minutes = resolved.minutes % 60
    breakdown = `${formatRate(resolved.rate_cents)} × ${hours}h ${minutes}m`
  }

  return breakdown
}

function priceSourceLabel(source: PriceSource) {
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
