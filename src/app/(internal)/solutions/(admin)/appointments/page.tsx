import { endOfMonth, format, startOfMonth } from 'date-fns'

import { AppointmentsViewToggle } from '@/components/admin/appointments-view-toggle'
import type { AppointmentSummary } from '@/components/admin/appointments-types'
import { fetchClientJobRules } from '@/lib/pricing/lookup'
import { durationMinutes } from '@/lib/pricing/money'
import { pickEffectiveRule, resolveAppointmentPrice, type ClientJobRule } from '@/lib/pricing/resolve'
import { toBusinessWallClock } from '@/lib/schedule'
import { createClient } from '@/lib/supabase/server'

type AppointmentsPageProps = {
  searchParams: Promise<{ month?: string | string[]; year?: string | string[] }>
}

type RawAppointmentRow = {
  id: string
  client_id: string
  job_id: string
  scheduled_date: string
  scheduled_start_time: string
  scheduled_end_time: string
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
  notes: string | null
  price_override_cents: number | null
  billed_price_cents: number | null
  clients: { id: string; name: string } | null
  jobs: { id: string; name: string; hourly_rate_cents: number } | null
  client_locations: { label: string; address: string } | null
  appointment_employees:
    | Array<{
        id: string
        employee_id: string
        employees: { full_name: string } | null
      }>
    | null
}

function normalizeParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function parseMonth(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 12) {
    return fallback
  }

  return parsed
}

function parseYear(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 2000 || parsed > 2100) {
    return fallback
  }

  return parsed
}

export default async function AppointmentsPage({ searchParams }: AppointmentsPageProps) {
  const now = toBusinessWallClock(new Date())
  const params = await searchParams

  const month = parseMonth(normalizeParam(params.month), now.getMonth() + 1)
  const year = parseYear(normalizeParam(params.year), now.getFullYear())

  const selectedMonthDate = new Date(year, month - 1, 1)
  const firstDayOfMonth = format(startOfMonth(selectedMonthDate), 'yyyy-MM-dd')
  const lastDayOfMonth = format(endOfMonth(selectedMonthDate), 'yyyy-MM-dd')

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('appointments')
    .select(
      `
        id, client_id, job_id, scheduled_date, scheduled_start_time, scheduled_end_time,
        status, notes, price_override_cents, billed_price_cents,
        clients!inner ( id, name ),
        jobs!inner ( id, name, hourly_rate_cents ),
        client_locations ( label, address ),
        appointment_employees ( id, employee_id, employees!inner ( full_name ) )
      `
    )
    .eq('is_archived', false)
    .gte('scheduled_date', firstDayOfMonth)
    .lte('scheduled_date', lastDayOfMonth)
    .order('scheduled_date')
    .order('scheduled_start_time')

  const rows = (data as RawAppointmentRow[] | null) ?? []

  let rulesByPair = new Map<string, ClientJobRule[]>()
  let rulesErrorMessage: string | null = null

  try {
    rulesByPair = await fetchClientJobRules(
      supabase,
      rows.map((row) => ({ clientId: row.client_id, jobId: row.job_id }))
    )
  } catch (thrown) {
    console.error('Error fetching client job pricing:', thrown)
    rulesErrorMessage =
      thrown instanceof Error ? thrown.message : 'Client pricing rules could not be loaded.'
  }

  const loadErrorMessage = error?.message ?? rulesErrorMessage
  const renderableRows = loadErrorMessage ? [] : rows

  const appointments: AppointmentSummary[] = renderableRows.map((row) => {
    const resolved = resolveAppointmentPrice({
      job: { hourly_rate_cents: row.jobs?.hourly_rate_cents ?? 0 },
      rule: pickEffectiveRule(
        rulesByPair.get(`${row.client_id}:${row.job_id}`) ?? [],
        row.scheduled_date
      ),
      minutes: durationMinutes(row.scheduled_start_time, row.scheduled_end_time),
      appointmentOverrideCents: row.price_override_cents,
    })

    return {
      id: row.id,
      scheduled_date: row.scheduled_date,
      scheduled_start_time: row.scheduled_start_time,
      scheduled_end_time: row.scheduled_end_time,
      status: row.status,
      notes: row.notes,
      price_override_cents: row.price_override_cents,
      price_display_cents: row.billed_price_cents ?? resolved.amount_cents,
      price_is_billed: row.billed_price_cents !== null,
      client: {
        id: row.clients?.id ?? '',
        name: row.clients?.name ?? 'Unknown client',
      },
      job: {
        id: row.jobs?.id ?? '',
        name: row.jobs?.name ?? 'Unknown job',
      },
      location: row.client_locations,
      assignedEmployees: (row.appointment_employees ?? []).map((assignment) => ({
        id: assignment.id,
        employee_id: assignment.employee_id,
        full_name: assignment.employees?.full_name ?? 'Unknown employee',
      })),
    }
  })

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm shadow-emerald-950/5">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-950">Appointments</h1>
          <p className="mt-2 text-sm text-neutral-600">Plan, assign, and track appointments across your team.</p>
        </div>
      </section>

      {loadErrorMessage ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadErrorMessage}
        </section>
      ) : null}

      <AppointmentsViewToggle appointments={appointments} month={month} year={year} />
    </div>
  )
}
