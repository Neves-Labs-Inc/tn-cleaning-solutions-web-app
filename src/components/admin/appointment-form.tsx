'use client'

import Link from 'next/link'
import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, TriangleAlert } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select'
import {
  createAppointment,
  type AppointmentActionResult,
  updateAppointment,
} from '@/lib/actions/appointments'
import { formatRate } from '@/lib/pricing/money'
import type { AppointmentStatus } from '@/lib/appointments/lifecycle'

// A Live claim on an issued or paid invoice: its price is frozen, so the form warns the edit won't reach it.
export type InvoiceClaim = { id: string; number: string; status: 'issued' | 'paid' }

type AppointmentFormProps = {
  clients: Array<{
    id: string
    name: string
    client_locations: Array<{ id: string; label: string; address: string }>
  }>
  jobs: Array<{
    id: string
    name: string
    hourly_rate_cents: number
    client_rate_cents: number | null
  }>
  employees: Array<{ id: string; full_name: string }>
  defaultDate?: string
  appointment?: {
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
    status: AppointmentStatus
    assignedEmployeeIds: string[]
  }
  recurrenceSeries?: {
    id: string
    frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly'
    start_date: string
    end_date: string | null
    max_occurrences: number | null
  } | null
  invoiceClaim?: InvoiceClaim | null
}

const initialState: AppointmentActionResult = {
  success: false,
  error: '',
}

const SCHEDULED_DATE_ERROR_ID = 'scheduled_date-error'

function SubmitButton({ isEditMode, pending }: { isEditMode: boolean; pending: boolean }) {
  return (
    <Button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      className="h-10 rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
    >
      {pending ? 'Saving...' : isEditMode ? 'Save Changes' : 'Create Appointment'}
    </Button>
  )
}

type FieldErrorProps = { id?: string; message: string | undefined }

function FieldError({ id, message }: FieldErrorProps) {
  if (!message) return null

  return (
    <p
      id={id}
      className="text-sm text-destructive animate-in fade-in-0 slide-in-from-bottom-1 duration-base ease-out-quart"
    >
      {message}
    </p>
  )
}

function InvoiceClaimBanner({ claim }: { claim: InvoiceClaim }) {
  return (
    <Alert role="status" className="border-status-warning-border bg-status-warning text-status-warning-foreground">
      <TriangleAlert aria-hidden="true" />
      <AlertDescription className="break-words text-status-warning-foreground">
        On invoice{' '}
        <Link
          href={`/solutions/invoices/${claim.id}`}
          className="cursor-pointer rounded-sm font-medium whitespace-nowrap underline underline-offset-4 outline-none transition-[color,opacity] duration-fast focus-visible:ring-2 focus-visible:ring-ring/50 active:opacity-70 md:hover:text-foreground"
        >
          {claim.number}
        </Link>{' '}
        ({claim.status}). Changes won&apos;t update it.
      </AlertDescription>
    </Alert>
  )
}

export function AppointmentForm({
  clients,
  jobs,
  employees,
  defaultDate,
  appointment,
  recurrenceSeries,
  invoiceClaim = null,
}: AppointmentFormProps) {
  const serverAction = appointment ? updateAppointment.bind(null, appointment.id) : createAppointment
  const [state, formAction, isPending] = useActionState(serverAction, initialState)
  const scheduledDateRef = useRef<HTMLInputElement>(null)
  const fieldErrors = 'fieldErrors' in state ? state.fieldErrors : undefined
  const scheduledDateError = fieldErrors?.scheduled_date
  const formError = 'error' in state ? state.error : ''
  const formErrorRef = useRef<HTMLDivElement>(null)

  // A refused date is fixed in place, so focus lands on it when the action returns.
  useEffect(() => {
    if (scheduledDateError) {
      scheduledDateRef.current?.focus()
    }
  }, [state, scheduledDateError])

  // A refusal renders at the top of a long form, out of view after a mobile save: bring it to the admin.
  useEffect(() => {
    if (formError && !scheduledDateError) {
      const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      formErrorRef.current?.focus({ preventScroll: true })
      formErrorRef.current?.scrollIntoView({ block: 'center', behavior: isReducedMotion ? 'auto' : 'smooth' })
    }
  }, [state, formError, scheduledDateError])

  // Dispatched by hand rather than through <form action>: React resets an action form's fields after
  // every submit, and a refused save must keep what the admin typed.
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    startTransition(() => formAction(formData))
  }

  const [selectedClientId, setSelectedClientId] = useState(appointment?.client_id ?? clients[0]?.id ?? '')
  const [selectedLocationId, setSelectedLocationId] = useState(appointment?.location_id ?? '')
  const [selectedJobId, setSelectedJobId] = useState(appointment?.job_id ?? jobs[0]?.id ?? '')
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>(appointment?.assignedEmployeeIds ?? [])
  const [isRecurring, setIsRecurring] = useState(false)
  const [editScope, setEditScope] = useState<'occurrence' | 'future'>('occurrence')

  const isEditingRecurringAppointment = Boolean(appointment?.recurrence_series_id && recurrenceSeries)
  const showRecurringEditFields = editScope === 'future'

  const clientOptions = useMemo(
    () => clients.map((client) => ({ value: client.id, label: client.name })),
    [clients]
  )

  const employeeOptions = useMemo(
    () => employees.map((employee) => ({ value: employee.id, label: employee.full_name })),
    [employees]
  )

  const visibleLocations = useMemo(() => {
    const selectedClient = clients.find((client) => client.id === selectedClientId)
    return selectedClient?.client_locations ?? []
  }, [clients, selectedClientId])

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId),
    [jobs, selectedJobId]
  )

  // The client rate was resolved for the saved client and Job only; any other pick resolves on save.
  const clientRateIsStale =
    appointment !== undefined && (selectedClientId !== appointment.client_id || selectedJobId !== appointment.job_id)

  const rateHint = useMemo(() => {
    let hint: string | null = null

    if (selectedJob) {
      const clientRate = selectedJob.client_rate_cents
      const standard = `Rate: ${formatRate(selectedJob.hourly_rate_cents)}`

      if (clientRateIsStale) {
        hint = `${standard} · this client's negotiated rate, if any, applies on save`
      } else if (clientRate !== null && clientRate !== selectedJob.hourly_rate_cents) {
        hint = `${standard} · this client: ${formatRate(clientRate)}`
      } else {
        hint = standard
      }
    }

    return hint
  }, [selectedJob, clientRateIsStale])

  const handleClientChange = (nextClientId: string) => {
    setSelectedClientId(nextClientId)

    const nextClient = clients.find((client) => client.id === nextClientId)
    const stillExists = nextClient?.client_locations.some((location) => location.id === selectedLocationId)

    if (!stillExists) {
      setSelectedLocationId('')
    }
  }

  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm shadow-emerald-950/5">
      <form onSubmit={handleSubmit} className="space-y-5">
        {invoiceClaim ? <InvoiceClaimBanner claim={invoiceClaim} /> : null}

        {formError ? (
          <Alert
            ref={formErrorRef}
            tabIndex={-1}
            variant="destructive"
            className="scroll-mt-24 outline-none animate-in fade-in-0 slide-in-from-bottom-1 duration-base ease-out-quart"
          >
            <AlertCircle aria-hidden="true" />
            <AlertDescription className="break-words">{formError}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="client_id" className="text-sm font-medium text-neutral-700">
              Client
            </Label>
            <input type="hidden" name="client_id" value={selectedClientId} />
            <SearchableSelect
              id="client_id"
              options={clientOptions}
              value={selectedClientId}
              onValueChange={handleClientChange}
              placeholder="Select client..."
              searchPlaceholder="Search client..."
              emptyMessage="No client found."
            />
            <FieldError message={fieldErrors?.client_id} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="location_id" className="text-sm font-medium text-neutral-700">
              Location
            </Label>
            <NativeSelect
              id="location_id"
              name="location_id"
              value={selectedLocationId}
              onChange={(event) => setSelectedLocationId(event.target.value)}
              className="w-full"
            >
              <NativeSelectOption value="">No location</NativeSelectOption>
              {visibleLocations.map((location) => (
                <NativeSelectOption key={location.id} value={location.id}>
                  {location.label} - {location.address}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="job_id" className="text-sm font-medium text-neutral-700">
            Job
          </Label>
          <NativeSelect
            id="job_id"
            name="job_id"
            required
            value={selectedJobId}
            onChange={(event) => setSelectedJobId(event.target.value)}
              className="w-full"
          >
            <NativeSelectOption value="" disabled>
              Select job
            </NativeSelectOption>
            {jobs.map((job) => (
              <NativeSelectOption key={job.id} value={job.id}>
                {job.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {rateHint ? <p className="text-xs text-neutral-500">{rateHint}</p> : null}
          <FieldError message={fieldErrors?.job_id} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="scheduled_date" className="text-sm font-medium text-neutral-700">
              Date
            </Label>
            <Input
              ref={scheduledDateRef}
              id="scheduled_date"
              name="scheduled_date"
              type="date"
              required
              defaultValue={appointment?.scheduled_date ?? defaultDate ?? ''}
              aria-invalid={scheduledDateError ? true : undefined}
              aria-describedby={scheduledDateError ? SCHEDULED_DATE_ERROR_ID : undefined}
            />
            <FieldError id={SCHEDULED_DATE_ERROR_ID} message={scheduledDateError} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="scheduled_start_time" className="text-sm font-medium text-neutral-700">
              Start Time
            </Label>
            <Input
              id="scheduled_start_time"
              name="scheduled_start_time"
              type="time"
              required
              defaultValue={appointment?.scheduled_start_time?.slice(0, 5) ?? ''}
            />
            <FieldError message={fieldErrors?.scheduled_start_time} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="scheduled_end_time" className="text-sm font-medium text-neutral-700">
              End Time
            </Label>
            <Input
              id="scheduled_end_time"
              name="scheduled_end_time"
              type="time"
              required
              defaultValue={appointment?.scheduled_end_time?.slice(0, 5) ?? ''}
            />
            <FieldError message={fieldErrors?.scheduled_end_time} />
          </div>
        </div>

        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="price_override" className="text-sm font-medium text-neutral-700">
              Manual price override ($)
            </Label>
            <Input
              id="price_override"
              name="price_override"
              type="number"
              min="0"
              step="0.01"
              defaultValue={
                appointment?.price_override_cents != null
                  ? (appointment.price_override_cents / 100).toFixed(2)
                  : ''
              }
              placeholder="Leave blank to bill this client's hourly rate for the scheduled time"
            />
            <FieldError message={fieldErrors?.price_override} />
          </div>

          {/* The status this form rendered with; the action refuses to save over a status that moved since. */}
          {appointment ? <input type="hidden" name="expected_status" value={appointment.status} /> : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="employee_ids" className="text-sm font-medium text-neutral-700">
            Assigned Employees
          </Label>
          {selectedEmployeeIds.map((id) => (
            <input key={id} type="hidden" name="employee_ids" value={id} />
          ))}
          <SearchableMultiSelect
            id="employee_ids"
            options={employeeOptions}
            value={selectedEmployeeIds}
            onValueChange={setSelectedEmployeeIds}
            placeholder="Select employees..."
            searchPlaceholder="Search employees..."
            emptyMessage="No employee found."
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes" className="text-sm font-medium text-neutral-700">
            Notes
          </Label>
          <Textarea
            id="notes"
            name="notes"
            defaultValue={appointment?.notes ?? ''}
            className="min-h-28"
          />
        </div>

        {!appointment ? (
          <div className="space-y-3 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
            <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-neutral-700">
              <input
                type="checkbox"
                name="is_recurring"
                checked={isRecurring}
                onChange={(event) => setIsRecurring(event.target.checked)}
                className="size-4 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500"
              />
              Make this a recurring appointment
            </label>

            {isRecurring ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="recurrence_frequency" className="text-sm font-medium text-neutral-700">
                    Frequency
                  </Label>
                  <NativeSelect
                    id="recurrence_frequency"
                    name="recurrence_frequency"
                    defaultValue="weekly"
                    className="w-full"
                  >
                    <NativeSelectOption value="daily">Daily</NativeSelectOption>
                    <NativeSelectOption value="weekly">Weekly</NativeSelectOption>
                    <NativeSelectOption value="biweekly">Biweekly</NativeSelectOption>
                    <NativeSelectOption value="monthly">Monthly</NativeSelectOption>
                  </NativeSelect>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="recurrence_end_date" className="text-sm font-medium text-neutral-700">
                    End Date
                  </Label>
                  <Input
                    id="recurrence_end_date"
                    name="recurrence_end_date"
                    type="date"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="recurrence_max_occurrences" className="text-sm font-medium text-neutral-700">
                    Max Occurrences
                  </Label>
                  <Input
                    id="recurrence_max_occurrences"
                    name="recurrence_max_occurrences"
                    type="number"
                    min="1"
                    step="1"
                    placeholder="Optional"
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : isEditingRecurringAppointment && recurrenceSeries ? (
          <div className="space-y-4 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
            <input type="hidden" name="recurrence_series_id" value={recurrenceSeries.id} />

            <div className="space-y-3">
              <p className="text-sm font-medium text-neutral-700">Recurrence Settings</p>

              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="radio"
                  name="edit_scope"
                  value="occurrence"
                  checked={editScope === 'occurrence'}
                  onChange={(event) => setEditScope(event.target.value as 'occurrence' | 'future')}
                  className="mt-0.5 size-4 border-neutral-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium text-neutral-700">This appointment only</span>
                  <span className="text-xs text-neutral-500 mt-0.5">Update only this appointment&apos;s details</span>
                </span>
              </label>

              {/* <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="radio"
                  name="edit_scope"
                  value="series"
                  checked={editScope === 'series'}
                  onChange={(event) => setEditScope(event.target.value as 'occurrence' | 'series' | 'future')}
                  className="mt-0.5 size-4 border-neutral-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium text-neutral-700">Series settings (frequency & schedule)</span>
                  <span className="text-xs text-neutral-500 mt-0.5">Update the recurrence pattern for the whole series</span>
                </span>
              </label> */}

              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="radio"
                  name="edit_scope"
                  value="future"
                  checked={editScope === 'future'}
                  onChange={(event) => setEditScope(event.target.value as 'occurrence' | 'future')}
                  className="mt-0.5 size-4 border-neutral-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium text-neutral-700">This and all future appointments</span>
                  <span className="text-xs text-neutral-500 mt-0.5">Update this and all upcoming pending appointments</span>
                </span>
              </label>
            </div>

            {/* {editScope === 'series' && recurrenceSeries ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Only the recurrence pattern will be updated. Changes to date, time, and other fields will be
                ignored in this mode.
              </div>
            ) : null} */}

            {showRecurringEditFields ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="recurrence_frequency" className="text-sm font-medium text-neutral-700">
                    Frequency
                  </Label>
                  <NativeSelect
                    id="recurrence_frequency"
                    name="recurrence_frequency"
                    defaultValue={recurrenceSeries.frequency}
                    required={showRecurringEditFields}
                    className="w-full"
                  >
                    <NativeSelectOption value="daily">Daily</NativeSelectOption>
                    <NativeSelectOption value="weekly">Weekly</NativeSelectOption>
                    <NativeSelectOption value="biweekly">Biweekly</NativeSelectOption>
                    <NativeSelectOption value="monthly">Monthly</NativeSelectOption>
                  </NativeSelect>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="recurrence_end_date" className="text-sm font-medium text-neutral-700">
                    End Date
                  </Label>
                  <Input
                    id="recurrence_end_date"
                    name="recurrence_end_date"
                    type="date"
                    defaultValue={recurrenceSeries.end_date ?? ''}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="recurrence_max_occurrences" className="text-sm font-medium text-neutral-700">
                    Max Occurrences
                  </Label>
                  <Input
                    id="recurrence_max_occurrences"
                    name="recurrence_max_occurrences"
                    type="number"
                    min="1"
                    step="1"
                    defaultValue={recurrenceSeries.max_occurrences ?? ''}
                    placeholder="Optional"
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-3 border-t border-neutral-100 pt-4">
          <Link
            href={appointment ? `/solutions/appointments/${appointment.id}` : '/solutions/appointments'}
            className="inline-flex h-10 items-center rounded-full border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            Cancel
          </Link>
          <SubmitButton isEditMode={Boolean(appointment)} pending={isPending} />
        </div>
      </form>
    </section>
  )
}
