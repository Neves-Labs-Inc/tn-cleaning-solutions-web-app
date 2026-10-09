import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { InvoiceForm, type AppointmentOption } from '@/components/admin/invoice-form'
import {
  APPOINTMENT_PRICE_COLUMNS,
  priceAppointments,
  type LivePrice,
  type PriceableAppointment,
  type PricedAppointment,
} from '@/lib/pricing'
import { createClient } from '@/lib/supabase/server'

type NewInvoicePageProps = {
  searchParams: Promise<{ client_id?: string | string[] }>
}

type AppointmentRow = PriceableAppointment & {
  jobs: { name: string } | null
  client_locations: { label: string; address: string } | null
  clients: { id: string; name: string } | null
}

function normalizeParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

type LinePrice = Pick<
  AppointmentOption,
  'resolved_amount_cents' | 'resolved_rate_cents' | 'resolved_minutes' | 'resolved_headcount'
>

function livePriceOption(live: LivePrice): LinePrice {
  return live.source === 'unpriced'
    ? { resolved_amount_cents: null, resolved_rate_cents: null, resolved_minutes: null, resolved_headcount: 1 }
    : {
        resolved_amount_cents: live.amount_cents,
        resolved_rate_cents: live.rate_cents,
        resolved_minutes: live.minutes,
        resolved_headcount: live.headcount,
      }
}

function toAppointmentOption(row: AppointmentRow, price: LinePrice): AppointmentOption {
  return {
    id: row.id,
    client_id: row.client_id,
    client_name: row.clients?.name ?? 'Unknown client',
    scheduled_date: row.scheduled_date,
    scheduled_start_time: row.scheduled_start_time,
    job_name: row.jobs?.name ?? 'Unknown job',
    ...price,
    price_override_cents: row.price_override_cents,
    location_label: row.client_locations?.label ?? null,
    location_address: row.client_locations?.address ?? null,
  }
}

export default async function NewInvoicePage({ searchParams }: NewInvoicePageProps) {
  const params = await searchParams
  const selectedClientId = normalizeParam(params.client_id)
  const supabase = await createClient()

  const [
    { data: clients, error: clientsError },
    { data: linkedRows, error: linkedError },
    { data: appointmentRows, error: appointmentsError },
  ] = await Promise.all([
    supabase
      .from('clients')
      .select('id, name')
      .eq('is_active', true)
      .eq('is_archived', false)
      .order('name', { ascending: true }),
    // A released row (a line on a voided invoice) and a Cancelled line are records only and no longer claim
    // their appointment.
    supabase.from('invoice_appointments').select('appointment_id').eq('is_archived', false).is('cancelled_at', null),
    supabase
      .from('appointments')
      .select(
        `
          ${APPOINTMENT_PRICE_COLUMNS},
          jobs ( name ),
          client_locations ( label, address ),
          clients!inner ( id, name )
        `
      )
      .eq('is_archived', false)
      .order('scheduled_date', { ascending: false }),
  ])

  let loadErrorMessage = (clientsError ?? linkedError ?? appointmentsError)?.message ?? null

  const alreadyInvoiced = new Set((linkedRows ?? []).map((row) => row.appointment_id))
  const candidateRows = ((appointmentRows ?? []) as unknown as AppointmentRow[]).filter(
    (row) => !alreadyInvoiced.has(row.id)
  )

  let pricesById = new Map<string, PricedAppointment>()
  if (!loadErrorMessage) {
    try {
      pricesById = await priceAppointments(supabase, candidateRows)
    } catch (thrown) {
      console.error('Error pricing appointments:', thrown)
      loadErrorMessage = 'Failed to load appointment prices.'
    }
  }

  const availableAppointments = candidateRows.map((row) =>
    toAppointmentOption(row, livePriceOption(pricesById.get(row.id)?.live ?? { source: 'unpriced' }))
  )

  const orderedClients = [...(clients ?? [])]
  if (selectedClientId) {
    orderedClients.sort((a, b) => {
      if (a.id === selectedClientId) {
        return -1
      }
      if (b.id === selectedClientId) {
        return 1
      }
      return a.name.localeCompare(b.name)
    })
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm shadow-emerald-950/5">
        <div className="space-y-3">
          <Link
            href="/solutions/invoices"
            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back to Invoices
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-neutral-950">Create Invoice</h1>
            <p className="mt-2 text-sm text-neutral-600">Select completed appointments and build a draft invoice.</p>
          </div>
        </div>
      </section>

      {loadErrorMessage ? (
        <section className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadErrorMessage}
        </section>
      ) : (
        <InvoiceForm
          clients={orderedClients.map((client) => ({ id: client.id, name: client.name }))}
          availableAppointments={availableAppointments}
        />
      )}
    </div>
  )
}
