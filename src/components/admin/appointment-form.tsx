'use client'

import Link from 'next/link'
import { useActionState, useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select'
import {
  createAppointment,
  type AppointmentActionResult,
  updateAppointment,
} from '@/lib/actions/appointments'
import { formatRate } from '@/lib/pricing/money'

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
    status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
    assignedEmployeeIds: string[]
  }
  recurrenceSeries?: {
    id: string
    frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly'
    start_date: string
    end_date: string | null
    max_occurrences: number | null
  } | null
}

const initialState: AppointmentActionResult = {
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
      {pending ? 'Saving...' : isEditMode ? 'Save Changes' : 'Create Appointment'}
    </Button>
  )
}

export function AppointmentForm({
  clients,
  jobs,
  employees,
  defaultDate,
  appointment,
  recurrenceSeries,
}: AppointmentFormProps) {
  const serverAction = appointment ? updateAppointment.bind(null, appointment.id) : createAppointment
  const [state, formAction] = useActionState(serverAction, initialState)

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

  const resolvedRateClientId = appointment?.client_id ?? null
  const clientRateIsStale = resolvedRateClientId !== null && selectedClientId !== resolvedRateClientId

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
      <form action={formAction} className="space-y-5">
        {'error' in state && state.error ? (
          <div
            className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
            role="alert"
            aria-live="polite"
          >
            {state.error}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="client_id" className="text-sm font-medium text-neutral-700">
              Client
            </Label>
            <input type="hidden" name="client_id" value={selectedClientId} />
            <SearchableSelect
              options={clientOptions}
              value={selectedClientId}
              onValueChange={handleClientChange}
              placeholder="Select client..."
              searchPlaceholder="Search client..."
              emptyMessage="No client found."
            />
            {'fieldErrors' in state && state.fieldErrors?.client_id ? (
              <p className="text-xs text-red-600">{state.fieldErrors.client_id}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="location_id" className="text-sm font-medium text-neutral-700">
              Location
            </Label>
            <select
              id="location_id"
              name="location_id"
              value={selectedLocationId}
              onChange={(event) => setSelectedLocationId(event.target.value)}
              className="h-11 w-full rounded-xl border border-neutral-200 bg-white px-3.5 text-sm text-neutral-950 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="">No location</option>
              {visibleLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.label} - {location.address}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="job_id" className="text-sm font-medium text-neutral-700">
            Job
          </Label>
          <select
            id="job_id"
            name="job_id"
            required
            value={selectedJobId}
            onChange={(event) => setSelectedJobId(event.target.value)}
            className="h-11 w-full rounded-xl border border-neutral-200 bg-white px-3.5 text-sm text-neutral-950 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="" disabled>
              Select job
            </option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.name}
              </option>
            ))}
          </select>
          {rateHint ? <p className="text-xs text-neutral-500">{rateHint}</p> : null}
          {'fieldErrors' in state && state.fieldErrors?.job_id ? (
            <p className="text-xs text-red-600">{state.fieldErrors.job_id}</p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="scheduled_date" className="text-sm font-medium text-neutral-700">
              Date
            </Label>
            <Input
              id="scheduled_date"
              name="scheduled_date"
              type="date"
              required
              defaultValue={appointment?.scheduled_date ?? defaultDate ?? ''}
              className="h-11 rounded-xl border-neutral-200 bg-white px-3.5 text-sm text-neutral-950 shadow-sm"
            />
            {'fieldErrors' in state && state.fieldErrors?.scheduled_date ? (
              <p className="text-xs text-red-600">{state.fieldErrors.scheduled_date}</p>
            ) : null}
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
              className="h-11 rounded-xl border-neutral-200 bg-white px-3.5 text-sm text-neutral-950 shadow-sm"
            />
            {'fieldErrors' in state && state.fieldErrors?.scheduled_start_time ? (
              <p className="text-xs text-red-600">{state.fieldErrors.scheduled_start_time}</p>
            ) : null}
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
              className="h-11 rounded-xl border-neutral-200 bg-white px-3.5 text-sm text-neutral-950 shadow-sm"
            />
            {'fieldErrors' in state && state.fieldErrors?.scheduled_end_time ? (
              <p className="text-xs text-red-600">{state.fieldErrors.scheduled_end_time}</p>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
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
              className="h-11 rounded-xl border-neutral-200 bg-white px-3.5 text-sm text-neutral-950 shadow-sm"
              placeholder="Leave blank to bill this client's hourly rate for the scheduled time"
            />
            {'fieldErrors' in state && state.fieldErrors?.price_override ? (
              <p className="text-xs text-red-600">{state.fieldErrors.price_override}</p>
            ) : null}
          </div>

          {appointment ? (
            <div className="space-y-1.5">
              {/* The status this form rendered with; the action refuses to save over a status that moved since. */}
              <input type="hidden" name="expected_status" value={appointment.status} />
              <Label htmlFor="status" className="text-sm font-medium text-neutral-700">
                Status
              </Label>
              <select
                id="status"
                name="status"
                defaultValue={appointment.status}
                className="h-11 w-full rounded-xl border border-neutral-200 bg-white px-3.5 text-sm text-neutral-950 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                <option value="scheduled">Scheduled</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm font-medium text-neutral-700">Assigned Employees</Label>
          {selectedEmployeeIds.map((id) => (
            <input key={id} type="hidden" name="employee_ids" value={id} />
          ))}
          <SearchableMultiSelect
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
            className="min-h-28 rounded-xl border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-950 shadow-sm"
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
                  <select
                    id="recurrence_frequency"
                    name="recurrence_frequency"
                    defaultValue="weekly"
                    className="h-11 w-full rounded-xl border border-neutral-200 bg-white px-3.5 text-sm text-neutral-950 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Biweekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="recurrence_end_date" className="text-sm font-medium text-neutral-700">
                    End Date
                  </Label>
                  <Input
                    id="recurrence_end_date"
                    name="recurrence_end_date"
                    type="date"
                    className="h-11 rounded-xl border-neutral-200 bg-white px-3.5 text-sm text-neutral-950 shadow-sm"
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
                    className="h-11 rounded-xl border-neutral-200 bg-white px-3.5 text-sm text-neutral-950 shadow-sm"
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
                  <select
                    id="recurrence_frequency"
                    name="recurrence_frequency"
                    defaultValue={recurrenceSeries.frequency}
                    required={showRecurringEditFields}
                    className="h-11 w-full rounded-xl border border-neutral-200 bg-white px-3.5 text-sm text-neutral-950 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Biweekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
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
                    className="h-11 rounded-xl border-neutral-200 bg-white px-3.5 text-sm text-neutral-950 shadow-sm"
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
                    className="h-11 rounded-xl border-neutral-200 bg-white px-3.5 text-sm text-neutral-950 shadow-sm"
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
          <SubmitButton isEditMode={Boolean(appointment)} />
        </div>
      </form>
    </section>
  )
}
