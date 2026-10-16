import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, TriangleAlert } from 'lucide-react'
import type { PostgrestError } from '@supabase/supabase-js'

import { AppointmentFormLoadError } from '@/components/admin/appointment-form-load-error'
import { AppointmentForm, type InvoiceClaim } from '@/components/admin/appointment-form'
import { AppointmentScheduleContext } from '@/components/admin/new-appointment-schedule-context'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { OUTLINE_PRESS_CLASS_NAME } from '@/components/admin/detail-page/press'
import { Button } from '@/components/ui/button'
import PageHeader from '@/components/ui/page-header'
import {
  APPOINTMENT_PRICE_COLUMNS,
  priceAppointments,
  type DisplayPrice,
  type PriceableAppointment,
  type PricedAppointment,
} from '@/lib/pricing'
import { fetchClientJobRules } from '@/lib/pricing/lookup'
import { formatCents, UNPRICED_LABEL } from '@/lib/pricing/money'
import { createClient } from '@/lib/supabase/server'
import { canEdit, type AppointmentStatus } from '@/lib/appointments/lifecycle'
import type { IntervalUnit } from '@/lib/appointments/recurrence'
import { getClockedMinutes } from '@/lib/clocked-minutes'
import { cn } from '@/lib/utils'

type EditAppointmentPageProps = {
  params: Promise<{ id: string }>
}

type RecurrenceSeriesRow = {
  id: string
  interval_unit: IntervalUnit
  interval_count: number
  start_date: string
  end_date: string | null
  max_occurrences: number | null
}

type LiveClaimRow = {
  invoice: { id: string; invoice_number: string | null; status: 'draft' | 'issued' | 'paid' | 'void' } | null
}

type AppointmentRow = PriceableAppointment & {
  location_id: string | null
  recurrence_series_id: string | null
  notes: string
  status: AppointmentStatus
  manually_completed: boolean
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
    { data: liveClaim, error: liveClaimError },
    { data: crewClockRows, error: crewClocksError },
  ] = await Promise.all([
    supabase
      .from('appointments')
      .select(
        `
          ${APPOINTMENT_PRICE_COLUMNS},
          location_id, recurrence_series_id, notes, status, manually_completed, is_archived,
          appointment_employees(employee_id)
        `
      )
      .eq('id', id)
      // An archived assignment is a removed Cleaner, so the form must not pre-select her.
      .not('appointment_employees.is_archived', 'is', true)
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
    // The appointment's Live claim, if any: a released or Cancelled line claims nothing.
    supabase
      .from('invoice_appointments')
      .select('invoice:invoices ( id, invoice_number, status )')
      .eq('appointment_id', id)
      .eq('is_archived', false)
      .is('cancelled_at', null)
      .maybeSingle(),
    // The crew field warns about removing clocked time and about an automatic Manual completion.
    supabase
      .from('appointment_employees')
      .select('employee_id, clocked_in_at, clocked_out_at')
      .eq('appointment_id', id)
      .not('is_archived', 'is', true),
  ])

  if (appointmentError || !appointment || appointment.is_archived) {
    notFound()
  }

  const typedAppointment = appointment as unknown as AppointmentRow
  let recurrenceSeries: RecurrenceSeriesRow | null = null
  let recurrenceSeriesError: PostgrestError | null = null

  if (typedAppointment.recurrence_series_id) {
    const { data, error } = await supabase
      .from('recurrence_series')
      .select('id, interval_unit, interval_count, start_date, end_date, max_occurrences')
      .eq('id', typedAppointment.recurrence_series_id)
      .neq('is_archived', true)
      .maybeSingle()

    recurrenceSeries = data as RecurrenceSeriesRow | null
    recurrenceSeriesError = error
  }

  // A failed claim read blocks the form: it must never show without knowing whether it's invoiced.
  const loadError = clientsError ?? jobsError ?? employeesError ?? liveClaimError ?? recurrenceSeriesError
  const invoiceClaim = toInvoiceClaim(liveClaim as LiveClaimRow | null)

  const jobRows = jobs ?? []

  let price: PricedAppointment | null = null
  let priceErrorMessage: string | null = null

  try {
    price = (await priceAppointments(supabase, [typedAppointment])).get(typedAppointment.id) ?? null
  } catch (thrown) {
    console.error('Error pricing appointment:', typedAppointment.id, thrown)
    priceErrorMessage = thrown instanceof Error ? thrown.message : 'The appointment price could not be loaded.'
  }

  // The form must never show without the clocks its crew warnings are built from.
  const loadErrorMessage =
    loadError?.message ?? (crewClocksError ? CREW_CLOCKS_ERROR_MESSAGE : null) ?? priceErrorMessage

  // Every client × Job pair the form offers (plus the saved client, which may be inactive now), so the
  // calculated total is exact for any pick. A failed read throws to error.tsx: falling back to Job
  // rates would show a wrong number.
  const formClientIds = Array.from(new Set([typedAppointment.client_id, ...(clients ?? []).map((client) => client.id)]))
  const clientJobRules = loadErrorMessage
    ? {}
    : Object.fromEntries(
        await fetchClientJobRules(
          supabase,
          formClientIds.flatMap((clientId) => jobRows.map((job) => ({ clientId, jobId: job.id })))
        )
      )

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
    manually_completed: typedAppointment.manually_completed,
    crewClocks: (crewClockRows ?? []).map((row) => ({
      employeeId: row.employee_id,
      closedMinutes:
        row.clocked_in_at && row.clocked_out_at ? getClockedMinutes(row.clocked_in_at, row.clocked_out_at) : 0,
      hasClockIn: row.clocked_in_at !== null,
    })),
    assignedEmployeeIds: (typedAppointment.appointment_employees ?? []).map((row) => row.employee_id),
  }
  const [scheduledYearValue, scheduledMonthValue] = typedAppointment.scheduled_date.split('-', 3)
  const scheduledMonth = Number(scheduledMonthValue)
  const scheduledYear = Number(scheduledYearValue)

  return (
    <div className="mx-auto max-w-7xl space-y-6 lg:space-y-8">
      <div className="space-y-3">
        <Button
          variant="ghost"
          className={cn(OUTLINE_PRESS_CLASS_NAME, '-ml-3')}
          nativeButton={false}
          render={<Link href={`/solutions/appointments/${id}`} />}
        >
          <ArrowLeft aria-hidden="true" />
          Appointment
        </Button>
        <div className="space-y-1">
          <PageHeader title="Edit appointment" description="Update schedule details and team assignments." />
          {price ? (
            <p className="text-sm text-muted-foreground">
              Current price:{' '}
              <span className="font-semibold tabular-nums text-foreground">{formatDisplayPrice(price.display)}</span>
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)] lg:items-start">
        <AppointmentScheduleContext
          key={id}
          initialMonth={scheduledMonth}
          initialYear={scheduledYear}
          currentAppointmentId={id}
          showNewAppointmentLink
        />

        {loadErrorMessage ? (
          <AppointmentFormLoadError title="Couldn't load this appointment" description={loadErrorMessage} />
        ) : !canEdit(typedAppointment.status) ? (
          <Alert role="status" className={WARNING_ALERT_CLASSES}>
            <TriangleAlert aria-hidden="true" />
            <AlertDescription className="text-status-warning-foreground">
              This appointment cannot be edited because it has been cancelled. Restore it to make changes.
            </AlertDescription>
          </Alert>
        ) : (
          // Keyed on the status so a clock-driven change remounts the form with the fresh expected_status.
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
            jobs={jobRows}
            clientJobRules={clientJobRules}
            employees={employees ?? []}
            appointment={appointmentFormAppointment}
            recurrenceSeries={recurrenceSeries ?? null}
            invoiceClaim={invoiceClaim}
          />
        )}
      </div>
    </div>
  )
}

const CREW_CLOCKS_ERROR_MESSAGE = "Couldn't load this appointment's clocks. Try again."

const WARNING_ALERT_CLASSES = 'border-status-warning-border bg-status-warning text-status-warning-foreground'

// Only an issued or paid invoice froze a price the edit won't reach; a draft line follows the edit.
function toInvoiceClaim(row: LiveClaimRow | null): InvoiceClaim | null {
  const invoice = row?.invoice ?? null
  if (!invoice || invoice.invoice_number === null) return null
  if (invoice.status !== 'issued' && invoice.status !== 'paid') return null

  return { id: invoice.id, number: invoice.invoice_number, status: invoice.status }
}

function formatDisplayPrice(display: DisplayPrice) {
  return display.source === 'unpriced' ? UNPRICED_LABEL : formatCents(display.amount_cents)
}
