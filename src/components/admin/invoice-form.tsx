'use client'

import Link from 'next/link'
import { useActionState, useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { createInvoice, type InvoiceActionResult, updateInvoice } from '@/lib/actions/invoices'
import { formatCents, formatRate, UNPRICED_LABEL } from '@/lib/pricing/money'

export type AppointmentOption = {
  id: string
  client_id: string
  client_name: string
  scheduled_date: string
  scheduled_start_time: string
  job_name: string
  // null when the visit is Unpriced.
  resolved_amount_cents: number | null
  resolved_rate_cents: number | null
  resolved_minutes: number | null
  resolved_headcount: number
  price_override_cents: number | null
  location_label: string | null
  location_address: string | null
}

type InvoiceFormProps = {
  clients: Array<{ id: string; name: string }>
  availableAppointments: AppointmentOption[]
  preselectedAppointments?: AppointmentOption[]
  invoice?: {
    id: string
    client_id: string
    due_date: string | null
    notes: string | null
    status: string
  }
}

const initialState: InvoiceActionResult = {
  success: false,
  error: '',
}

function SubmitButton({ isEditMode }: { isEditMode: boolean }) {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      disabled={pending}
      className="h-10 rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
    >
      {pending ? 'Saving...' : isEditMode ? 'Save Draft' : 'Create Invoice'}
    </Button>
  )
}

// An Unpriced visit starts blank so it is never billed as $0 by default.
function initialPriceForAppointment(appointment: AppointmentOption) {
  return appointment.resolved_amount_cents === null ? '' : (appointment.resolved_amount_cents / 100).toFixed(2)
}

function priceHint({
  resolved_amount_cents,
  resolved_rate_cents,
  resolved_minutes,
  resolved_headcount,
}: AppointmentOption) {
  let hint: string

  if (resolved_amount_cents === null) {
    hint = UNPRICED_LABEL
  } else if (resolved_rate_cents === null || resolved_minutes === null) {
    hint = formatCents(resolved_amount_cents)
  } else {
    const hours = Math.floor(resolved_minutes / 60)
    const crew = resolved_headcount > 1 ? ` × ${resolved_headcount} cleaners` : ''
    hint = `${formatRate(resolved_rate_cents)} × ${hours}h ${resolved_minutes % 60}m${crew} = ${formatCents(resolved_amount_cents)}`
  }

  return hint
}

function dateLabel(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number)
  const localDate = new Date(year, month - 1, day)
  return localDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function appointmentLabel(appointment: AppointmentOption) {
  const date = dateLabel(appointment.scheduled_date)
  const time = appointment.scheduled_start_time.slice(0, 5)
  const location = appointment.location_label || appointment.location_address || 'No location'
  return `${date} • ${time} - ${location} (${appointment.job_name})`
}

export function InvoiceForm({
  clients,
  availableAppointments,
  preselectedAppointments = [],
  invoice,
}: InvoiceFormProps) {
  const isEditMode = Boolean(invoice)
  const serverAction = invoice ? updateInvoice.bind(null, invoice.id) : createInvoice
  const [state, formAction] = useActionState(serverAction, initialState)

  const allAppointments = useMemo(() => {
    const map = new Map<string, AppointmentOption>()
    for (const appointment of availableAppointments) {
      map.set(appointment.id, appointment)
    }
    for (const appointment of preselectedAppointments) {
      map.set(appointment.id, appointment)
    }
    return Array.from(map.values())
  }, [availableAppointments, preselectedAppointments])

  // Only the user's pick is state; the default is derived so it needs no effect.
  const [chosenClientId, setChosenClientId] = useState('')
  const selectedClientId =
    invoice?.client_id || chosenClientId || clients[0]?.id || ''

  const clientOptions = useMemo(() => {
    return clients.map((client) => ({ value: client.id, label: client.name }))
  }, [clients])

  const [selectedIds, setSelectedIds] = useState<string[]>(
    () => preselectedAppointments.map((appointment) => appointment.id)
  )

  // Only user edits are state; defaults are derived so new appointments get one.
  const [priceEdits, setPriceEdits] = useState<Record<string, string>>({})

  const priceValues = useMemo(() => {
    const values: Record<string, string> = {}
    for (const appointment of allAppointments) {
      values[appointment.id] = initialPriceForAppointment(appointment)
    }
    return { ...values, ...priceEdits }
  }, [allAppointments, priceEdits])

  const appointmentsForClient = useMemo(
    () => allAppointments.filter((appointment) => appointment.client_id === selectedClientId),
    [allAppointments, selectedClientId]
  )

  const appointmentOptions = useMemo(
    () =>
      appointmentsForClient.map((appointment) => ({
        value: appointment.id,
        label: appointmentLabel(appointment),
      })),
    [appointmentsForClient]
  )

  const runningTotalCents = useMemo(() => {
    let total = 0

    for (const appointmentId of selectedIds) {
      const raw = priceValues[appointmentId] ?? ''
      const parsed = Number(raw)
      if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed < 0) {
        continue
      }

      total += Math.round(parsed * 100)
    }

    return total
  }, [priceValues, selectedIds])

  const selectedAppointments = useMemo(
    () => appointmentsForClient.filter((appointment) => selectedIds.includes(appointment.id)),
    [appointmentsForClient, selectedIds]
  )

  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm shadow-emerald-950/5">
      <form action={formAction} className="space-y-6">
        {'error' in state && state.error ? (
          <div
            className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
            role="alert"
            aria-live="polite"
          >
            {state.error}
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="client_id" className="text-sm font-medium text-neutral-700">
            Client
          </Label>
          <input type="hidden" name="client_id" value={selectedClientId} />
          <SearchableSelect
            options={clientOptions}
            value={selectedClientId}
            onValueChange={(nextClientId) => {
              setChosenClientId(nextClientId)
              setSelectedIds([])
            }}
            placeholder="Select client..."
            searchPlaceholder="Search clients..."
            emptyMessage="No clients found."
            className={isEditMode ? 'pointer-events-none opacity-60' : ''}
          />
          {'fieldErrors' in state && state.fieldErrors?.client_id ? (
            <p className="text-xs text-red-600">{state.fieldErrors.client_id}</p>
          ) : null}
          {isEditMode ? (
            <p className="text-xs text-neutral-500">Client cannot be changed after draft creation.</p>
          ) : null}
        </div>

        <div className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50/50 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-neutral-900">Appointments</h2>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
              {selectedIds.length} selected
            </span>
          </div>

          {appointmentsForClient.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-6 text-sm text-neutral-600">
              No uninvoiced appointments available for this client.
            </div>
          ) : (
            <div className="space-y-3">
              <SearchableMultiSelect
                options={appointmentOptions}
                value={selectedIds}
                onValueChange={setSelectedIds}
                placeholder="Select appointments..."
                searchPlaceholder="Search by date, location, or job..."
                emptyMessage="No appointments found."
              />

              {selectedAppointments.length > 0 && (
                <div className="space-y-3 rounded-xl border border-emerald-100 bg-emerald-50/30 p-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                    Price Override
                  </h3>
                  {selectedAppointments.map((appointment) => (
                    <div
                      key={appointment.id}
                      className="grid gap-3 rounded-xl border border-neutral-200 bg-white p-3 sm:grid-cols-[1fr,140px]"
                    >
                      <div className="space-y-1.5">
                        <p className="text-sm font-semibold text-neutral-900">{appointment.job_name}</p>
                        <p className="text-xs text-neutral-600">
                          {dateLabel(appointment.scheduled_date)} • {appointment.scheduled_start_time.slice(0, 5)}
                        </p>
                        {appointment.location_label || appointment.location_address ? (
                          <p className="text-xs text-neutral-500">
                            {[appointment.location_label, appointment.location_address]
                              .filter(Boolean)
                              .join(' - ')}
                          </p>
                        ) : null}
                      </div>

                      <div className="space-y-1">
                        <Label
                          htmlFor={`price_override_${appointment.id}`}
                          className="text-xs font-medium text-neutral-600"
                        >
                          Price ($)
                        </Label>
                        <Input
                          id={`price_override_${appointment.id}`}
                          name={`price_override_${appointment.id}`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={priceValues[appointment.id] ?? ''}
                          onChange={(event) =>
                            setPriceEdits((previous) => ({
                              ...previous,
                              [appointment.id]: event.target.value,
                            }))
                          }
                          className="h-10 rounded-xl border-neutral-200 bg-white px-3 text-sm text-neutral-900 shadow-sm"
                        />
                        <p className="text-[11px] text-neutral-500">{priceHint(appointment)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {'fieldErrors' in state && state.fieldErrors?.appointment_ids ? (
            <p className="text-xs text-red-600">{state.fieldErrors.appointment_ids}</p>
          ) : null}
          {'fieldErrors' in state && state.fieldErrors?.prices ? (
            <p className="text-xs text-red-600">{state.fieldErrors.prices}</p>
          ) : null}

          {selectedIds.map((appointmentId) => (
            <input key={appointmentId} type="hidden" name="appointment_ids" value={appointmentId} />
          ))}
        </div>

        <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Running Total</p>
          <p className="mt-1 text-2xl font-bold text-neutral-950">{formatCents(runningTotalCents)}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="due_date" className="text-sm font-medium text-neutral-700">
              Due Date
            </Label>
            <Input
              id="due_date"
              name="due_date"
              type="date"
              defaultValue={invoice?.due_date ?? ''}
              className="h-11 rounded-xl border-neutral-200 bg-white px-3.5 text-sm text-neutral-950 shadow-sm"
            />
            {'fieldErrors' in state && state.fieldErrors?.due_date ? (
              <p className="text-xs text-red-600">{state.fieldErrors.due_date}</p>
            ) : null}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes" className="text-sm font-medium text-neutral-700">
            Notes
          </Label>
          <Textarea
            id="notes"
            name="notes"
            defaultValue={invoice?.notes ?? ''}
            className="min-h-24 rounded-xl border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-950 shadow-sm"
            placeholder="Optional payment terms or private billing notes"
          />
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-neutral-100 pt-4">
          <Link
            href={invoice ? `/solutions/invoices/${invoice.id}` : '/solutions/invoices'}
            className="inline-flex h-10 items-center rounded-full border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            Cancel
          </Link>
          <SubmitButton isEditMode={isEditMode} />
        </div>
      </form>
    </section>
  )
}
