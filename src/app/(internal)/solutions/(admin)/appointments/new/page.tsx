import { ArrowLeft } from 'lucide-react'

import { AppointmentsReturnLink } from '@/components/admin/appointments-return-link'
import { AppointmentFormLoadError } from '@/components/admin/appointment-form-load-error'
import { AppointmentForm } from '@/components/admin/appointment-form'
import { AppointmentScheduleContext } from '@/components/admin/new-appointment-schedule-context'
import { OUTLINE_PRESS_CLASS_NAME } from '@/components/admin/detail-page/press'
import { Button } from '@/components/ui/button'
import PageHeader from '@/components/ui/page-header'
import { isCalendarDate } from '@/lib/dates/calendar'
import { fetchClientJobRules } from '@/lib/pricing/lookup'
import { toBusinessWallClock } from '@/lib/schedule'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

type NewAppointmentPageProps = {
  searchParams: Promise<{ date?: string | string[]; month?: string | string[]; year?: string | string[] }>
}

function normalizeParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function isDateValue(value: string | undefined): value is string {
  return value !== undefined && isCalendarDate(value)
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

export default async function NewAppointmentPage({ searchParams }: NewAppointmentPageProps) {
  const params = await searchParams
  const defaultDate = normalizeParam(params.date)
  const fallbackDate = isDateValue(defaultDate) ? new Date(`${defaultDate}T00:00:00`) : toBusinessWallClock(new Date())
  const selectedMonth = parseMonth(normalizeParam(params.month), fallbackDate.getMonth() + 1)
  const selectedYear = parseYear(normalizeParam(params.year), fallbackDate.getFullYear())

  const supabase = await createClient()

  const [{ data: clients, error: clientsError }, { data: jobs, error: jobsError }, { data: employees, error: employeesError }] =
    await Promise.all([
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
        .eq('is_active', true)
        .eq('is_archived', false)
        .order('full_name', { ascending: true }),
    ])

  const loadError = clientsError ?? jobsError ?? employeesError

  // Every client × Job pair the form offers, so the calculated total is exact for any pick. A failed
  // read throws to error.tsx: falling back to Job rates would show a wrong number.
  const clientJobRules = loadError
    ? {}
    : Object.fromEntries(
        await fetchClientJobRules(
          supabase,
          (clients ?? []).flatMap((client) => (jobs ?? []).map((job) => ({ clientId: client.id, jobId: job.id })))
        )
      )

  return (
    <div className="mx-auto max-w-7xl space-y-6 lg:space-y-8">
      <div className="space-y-3">
        <Button
          variant="ghost"
          className={cn(OUTLINE_PRESS_CLASS_NAME, '-ml-3')}
          nativeButton={false}
          render={<AppointmentsReturnLink />}
        >
          <ArrowLeft aria-hidden="true" />
          Appointments
        </Button>
        <PageHeader title="New appointment" description="Create a one-time or recurring appointment." />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)] lg:items-stretch">
        <AppointmentScheduleContext initialMonth={selectedMonth} initialYear={selectedYear} />

        <div>
          {loadError ? (
            <AppointmentFormLoadError title="Couldn't load the appointment form" description={loadError.message} />
          ) : (
            <AppointmentForm
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
              jobs={jobs ?? []}
              // Loaded here, not in the browser: client_job_pricing is admin-only and RLS would return
              // an empty set silently (REQ-008).
              clientJobRules={clientJobRules}
              employees={employees ?? []}
              defaultDate={isDateValue(defaultDate) ? defaultDate : undefined}
            />
          )}
        </div>
      </div>
    </div>
  )
}
