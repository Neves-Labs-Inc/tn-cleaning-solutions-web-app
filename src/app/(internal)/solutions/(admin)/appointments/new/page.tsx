import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { AppointmentForm } from '@/components/admin/appointment-form'
import { AppointmentScheduleContext } from '@/components/admin/new-appointment-schedule-context'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import PageHeader from '@/components/ui/page-header'
import { toBusinessWallClock } from '@/lib/schedule'
import { createClient } from '@/lib/supabase/server'

type NewAppointmentPageProps = {
  searchParams: Promise<{ date?: string | string[]; month?: string | string[]; year?: string | string[] }>
}

function normalizeParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function isDateValue(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))
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

  return (
    <div className="mx-auto max-w-7xl space-y-6 lg:space-y-8">
      <div className="space-y-3">
        <Button
          variant="ghost"
          className="-ml-3 transition-[background-color,transform,box-shadow] duration-fast active:scale-[0.98] active:bg-muted"
          nativeButton={false}
          render={<Link href="/solutions/appointments" />}
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
            <Alert variant="destructive">
              <AlertDescription>{loadError.message}</AlertDescription>
            </Alert>
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
              // The client is picked in the browser, so no client rule can be resolved at render
              // time. A browser-side lookup is impossible by design: client_job_pricing is
              // admin-only and RLS would return an empty set silently (REQ-008).
              jobs={(jobs ?? []).map((job) => ({
                id: job.id,
                name: job.name,
                hourly_rate_cents: job.hourly_rate_cents,
                client_rate_cents: null,
              }))}
              employees={employees ?? []}
              defaultDate={isDateValue(defaultDate) ? defaultDate : undefined}
            />
          )}
        </div>
      </div>
    </div>
  )
}
