'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, Info, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { OUTLINE_PRESS_CLASS_NAME, PRESS_CLASS_NAME } from '@/components/admin/detail-page/press'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import SubmitButton from '@/components/ui/submit-button'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select'
import {
  createAppointment,
  type AppointmentActionResult,
  updateAppointment,
} from '@/lib/actions/appointments'
import { useAppointmentsCache } from '@/hooks/use-appointments-cache'
import { formatMinutes } from '@/components/admin/time-sheets/format-minutes'
import CalculatedTotal from '@/components/admin/calculated-total'
import { estimateAppointmentTotal } from '@/lib/pricing/estimate'
import { parseDollarsToCents } from '@/lib/pricing/money'
import type { ClientJobRule } from '@/lib/pricing/resolve'
import { browserListStorage, listReturnHref } from '@/lib/appointments/list-return'
import { planCrewChange } from '@/lib/appointments/crew'
import { cn } from '@/lib/utils'
import type { AppointmentStatus } from '@/lib/appointments/lifecycle'
import type { IntervalUnit } from '@/lib/appointments/recurrence'

// One live assignment's clocks, for the crew field's removal warnings.
export type CrewClock = { employeeId: string; closedMinutes: number; hasClockIn: boolean }

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
  }>
  // Non-archived client_job_pricing rules for every client × Job the form offers, keyed `client_id:job_id`.
  clientJobRules: Record<string, ClientJobRule[]>
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
    manually_completed: boolean
    crewClocks: CrewClock[]
    assignedEmployeeIds: string[]
  }
  recurrenceSeries?: {
    id: string
    interval_unit: IntervalUnit
    interval_count: number
    start_date: string
    end_date: string | null
    max_occurrences: number | null
  } | null
  invoiceClaim?: InvoiceClaim | null
}

const SAVE_FAILED_MESSAGE = "Couldn't save the appointment. Try again."

const initialState: AppointmentActionResult = {
  success: false,
  error: '',
}

const SCHEDULED_DATE_ERROR_ID = 'scheduled_date-error'
const RECURRENCE_END_DATE_ERROR_ID = 'recurrence_end_date-error'
const RECURRENCE_INTERVAL_COUNT_ERROR_ID = 'recurrence_interval_count-error'
const RECURRENCE_INTERVAL_UNIT_ERROR_ID = 'recurrence_interval_unit-error'
// An archived employee drops out of the employee list but can still hold clocked time here.
const REMOVED_EMPLOYEE_NAME = 'A removed employee'
const RECURRENCE_HEADING_ID = 'recurrence-settings-heading'

// Visual 20px (DESIGN §8); the indicator dot is sized up to match.
// RADIO_CLASSES and CHOICE_ROW_CLASSES are kept in sync with appointment-scope-choice.tsx's exports.
const RADIO_CLASSES = 'mt-0.5 size-5 [&_[data-slot=radio-group-indicator]]:size-5'
const LABEL_CLASSES = 'text-sm text-foreground'
const ENTER_CLASSES = 'animate-in fade-in-0 slide-in-from-top-1 duration-base ease-out-quart'
const CHOICE_ROW_CLASSES =
  '-mx-2 flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-2 py-2.5 transition-colors duration-fast active:bg-muted has-[:focus-visible]:bg-muted/50 md:hover:bg-muted/50'

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

type RepeatsEveryFieldsProps = {
  defaultCount: number
  defaultUnit: IntervalUnit
  countError: string | undefined
  unitError: string | undefined
  countRef: React.Ref<HTMLInputElement>
  unitRef: React.Ref<HTMLSelectElement>
}

// Create and "This and all future" edit both render this group, so the two can't drift.
function RepeatsEveryFields({
  defaultCount,
  defaultUnit,
  countError,
  unitError,
  countRef,
  unitRef,
}: RepeatsEveryFieldsProps) {
  return (
    <FieldSet className="min-w-0 gap-2 sm:col-span-2">
      <FieldLegend className="mb-2 text-sm font-medium text-foreground">Repeats every</FieldLegend>
      {/* No max and no required: empty and over-cap reach the server so the cap-specific copy shows. */}
      <div className="flex items-start gap-2 sm:max-w-sm">
        <Input
          ref={countRef}
          id="recurrence_interval_count"
          name="recurrence_interval_count"
          type="number"
          inputMode="numeric"
          min="1"
          step="1"
          enterKeyHint="next"
          aria-label="Number of units"
          defaultValue={defaultCount}
          aria-invalid={countError ? true : undefined}
          aria-describedby={countError ? RECURRENCE_INTERVAL_COUNT_ERROR_ID : undefined}
          className="w-20 shrink-0 tabular-nums"
        />
        <NativeSelect
          ref={unitRef}
          id="recurrence_interval_unit"
          name="recurrence_interval_unit"
          aria-label="Unit"
          defaultValue={defaultUnit}
          aria-invalid={unitError ? true : undefined}
          aria-describedby={unitError ? RECURRENCE_INTERVAL_UNIT_ERROR_ID : undefined}
          className="min-w-0 flex-1"
        >
          <NativeSelectOption value="day">Days</NativeSelectOption>
          <NativeSelectOption value="week">Weeks</NativeSelectOption>
          <NativeSelectOption value="month">Months</NativeSelectOption>
        </NativeSelect>
      </div>
      <FieldError id={RECURRENCE_INTERVAL_UNIT_ERROR_ID} message={unitError} />
      <FieldError id={RECURRENCE_INTERVAL_COUNT_ERROR_ID} message={countError} />
    </FieldSet>
  )
}

const CREW_WARNING_CLASSES =
  'flex items-start gap-1.5 break-words text-sm animate-in fade-in-0 slide-in-from-bottom-1 duration-base ease-out-quart'

function RemovedClockWarning({ name, minutes }: { name: string; minutes: number }) {
  return (
    <p className={`${CREW_WARNING_CLASSES} text-status-warning-foreground`}>
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0">
        {name} has {formatMinutes(minutes)} clocked; removing her takes them off her pay.
      </span>
    </p>
  )
}

function ManualCompletionNote() {
  return (
    <p className={`${CREW_WARNING_CLASSES} text-status-info-foreground`}>
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0">
        No Cleaner with clocks is left. The appointment stays completed as a Manual completion.
      </span>
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
  clientJobRules,
  employees,
  defaultDate,
  appointment,
  recurrenceSeries,
  invoiceClaim = null,
}: AppointmentFormProps) {
  const serverAction = appointment ? updateAppointment.bind(null, appointment.id) : createAppointment
  const router = useRouter()
  const appointmentsCache = useAppointmentsCache()
  const [hasSaved, setHasSaved] = useState(false)
  const [state, formAction, isPending] = useActionState(
    async (previous: AppointmentActionResult, formData: FormData): Promise<AppointmentActionResult> => {
      try {
        const result = await serverAction(previous, formData)
        if (result.success) {
          // Stays locked until the route unmounts, so a second tap can't create a duplicate.
          setHasSaved(true)
          // Patched before pushing so the list shows the change at once; the form stays locked meanwhile.
          await appointmentsCache.applyChanges(result.data?.ids ?? [])
          // Create and edit both return to the list's remembered state.
          const destination = listReturnHref(browserListStorage())
          toast.success(appointment ? 'Appointment saved' : 'Appointment created')
          router.push(destination)
        }
        return result
      } catch (thrown) {
        // A network or server failure: keep what the admin typed.
        console.error('Appointment save failed', thrown)
        return { success: false, error: SAVE_FAILED_MESSAGE }
      }
    },
    initialState
  )
  const isLocked = isPending || hasSaved
  const scheduledDateRef = useRef<HTMLInputElement>(null)
  const fieldErrors = 'fieldErrors' in state ? state.fieldErrors : undefined
  const scheduledDateError = fieldErrors?.scheduled_date
  const recurrenceEndDateError = fieldErrors?.recurrence_end_date
  const intervalCountError = fieldErrors?.recurrence_interval_count
  const intervalUnitError = fieldErrors?.recurrence_interval_unit
  const intervalCountRef = useRef<HTMLInputElement>(null)
  const intervalUnitRef = useRef<HTMLSelectElement>(null)
  const formError = 'error' in state ? state.error : ''
  const formErrorRef = useRef<HTMLDivElement>(null)

  // A refused field is fixed in place, so focus lands on the first one when the action returns.
  useEffect(() => {
    if (scheduledDateError) {
      scheduledDateRef.current?.focus()
    } else if (intervalUnitError) {
      intervalUnitRef.current?.focus()
    } else if (intervalCountError) {
      intervalCountRef.current?.focus()
    }
  }, [state, scheduledDateError, intervalUnitError, intervalCountError])

  // A refusal renders at the top of a long form, out of view after a mobile save: bring it to the admin.
  useEffect(() => {
    if (formError && !scheduledDateError && !intervalUnitError && !intervalCountError) {
      const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      formErrorRef.current?.focus({ preventScroll: true })
      formErrorRef.current?.scrollIntoView({ block: 'center', behavior: isReducedMotion ? 'auto' : 'smooth' })
    }
  }, [state, formError, scheduledDateError, intervalUnitError, intervalCountError])

  // Dispatched by hand rather than through <form action>: React resets an action form's fields after
  // every submit, and a refused save must keep what the admin typed.
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    if (isLocked) return
    startTransition(() => formAction(formData))
  }

  const [selectedClientId, setSelectedClientId] = useState(appointment?.client_id ?? clients[0]?.id ?? '')
  const [selectedLocationId, setSelectedLocationId] = useState(appointment?.location_id ?? '')
  const [selectedJobId, setSelectedJobId] = useState(appointment?.job_id ?? jobs[0]?.id ?? '')
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>(appointment?.assignedEmployeeIds ?? [])
  const [scheduledDate, setScheduledDate] = useState(appointment?.scheduled_date ?? defaultDate ?? '')
  const [startTime, setStartTime] = useState(appointment?.scheduled_start_time?.slice(0, 5) ?? '')
  const [endTime, setEndTime] = useState(appointment?.scheduled_end_time?.slice(0, 5) ?? '')
  const [priceOverride, setPriceOverride] = useState(
    appointment?.price_override_cents != null ? (appointment.price_override_cents / 100).toFixed(2) : ''
  )
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

  // Blank, invalid or over-cap overrides are ignored, so the estimate shows the calculated price.
  const parsedOverride = parseDollarsToCents(priceOverride)
  const estimate = estimateAppointmentTotal({
    jobRateCents: selectedJob?.hourly_rate_cents ?? null,
    clientRules: clientJobRules[`${selectedClientId}:${selectedJobId}`] ?? [],
    date: scheduledDate || null,
    startTime: startTime || null,
    endTime: endTime || null,
    cleaners: selectedEmployeeIds.length,
    overrideCents: 'cents' in parsedOverride ? parsedOverride.cents : null,
  })

  const employeeNames = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee.full_name])),
    [employees]
  )

  // Saved-crew order; a Cleaner added in this edit has no clocks, so she never warns.
  const removedClockWarnings = useMemo(() => {
    if (!appointment) return []

    const closedMinutesByEmployee = new Map(
      appointment.crewClocks.map((clock) => [clock.employeeId, clock.closedMinutes])
    )
    return appointment.assignedEmployeeIds
      .filter((employeeId) => !selectedEmployeeIds.includes(employeeId))
      .map((employeeId) => ({
        employeeId,
        name: employeeNames.get(employeeId) ?? REMOVED_EMPLOYEE_NAME,
        minutes: closedMinutesByEmployee.get(employeeId) ?? 0,
      }))
      .filter((warning) => warning.minutes > 0)
  }, [appointment, selectedEmployeeIds, employeeNames])

  // The planner the save runs, so the note shows exactly when the save turns Manual completion on.
  const isManualCompletionAhead = useMemo(() => {
    if (!appointment) return false

    const crewRows = appointment.crewClocks.map((clock) => ({
      id: clock.employeeId,
      employee_id: clock.employeeId,
      is_archived: false,
      hasHistory: clock.hasClockIn,
      hasClockIn: clock.hasClockIn,
    }))
    return planCrewChange(crewRows, selectedEmployeeIds, appointment).shouldTurnOnManualCompletion
  }, [appointment, selectedEmployeeIds])

  const handleClientChange = (nextClientId: string) => {
    setSelectedClientId(nextClientId)

    const nextClient = clients.find((client) => client.id === nextClientId)
    const stillExists = nextClient?.client_locations.some((location) => location.id === selectedLocationId)

    if (!stillExists) {
      setSelectedLocationId('')
    }
  }

  return (
    <section className="rounded-lg bg-card p-4 text-card-foreground shadow-sm ring-1 ring-foreground/10 sm:p-5">
      <form onSubmit={handleSubmit}>
        <fieldset disabled={isLocked} className="min-w-0 space-y-5">
        {invoiceClaim ? <InvoiceClaimBanner claim={invoiceClaim} /> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field className="min-w-0">
            <FieldLabel htmlFor="client_id" className={LABEL_CLASSES}>
              Client
            </FieldLabel>
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
          </Field>

          <Field className="min-w-0">
            <FieldLabel htmlFor="location_id" className={LABEL_CLASSES}>
              Location
            </FieldLabel>
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
          </Field>
        </div>

        <Field className="min-w-0">
          <FieldLabel htmlFor="job_id" className={LABEL_CLASSES}>
            Job
          </FieldLabel>
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
          <FieldError message={fieldErrors?.job_id} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field className="min-w-0">
            <FieldLabel htmlFor="scheduled_date" className={LABEL_CLASSES}>
              Date
            </FieldLabel>
            <Input
              ref={scheduledDateRef}
              id="scheduled_date"
              name="scheduled_date"
              type="date"
              required
              value={scheduledDate}
              onChange={(event) => setScheduledDate(event.target.value)}
              aria-invalid={scheduledDateError ? true : undefined}
              aria-describedby={scheduledDateError ? SCHEDULED_DATE_ERROR_ID : undefined}
            />
            <FieldError id={SCHEDULED_DATE_ERROR_ID} message={scheduledDateError} />
          </Field>

          <Field className="min-w-0">
            <FieldLabel htmlFor="scheduled_start_time" className={LABEL_CLASSES}>
              Start time
            </FieldLabel>
            <Input
              id="scheduled_start_time"
              name="scheduled_start_time"
              type="time"
              required
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
            />
            <FieldError message={fieldErrors?.scheduled_start_time} />
          </Field>

          <Field className="min-w-0">
            <FieldLabel htmlFor="scheduled_end_time" className={LABEL_CLASSES}>
              End time
            </FieldLabel>
            <Input
              id="scheduled_end_time"
              name="scheduled_end_time"
              type="time"
              required
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
            />
            <FieldError message={fieldErrors?.scheduled_end_time} />
          </Field>
        </div>

        <CalculatedTotal estimate={estimate} />

        <Field className="min-w-0">
          <FieldLabel htmlFor="price_override" className={LABEL_CLASSES}>
            Total amount override ($)
          </FieldLabel>
          <Input
            id="price_override"
            name="price_override"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            enterKeyHint="next"
            value={priceOverride}
            onChange={(event) => setPriceOverride(event.target.value)}
            placeholder="e.g. 120.00"
          />
          <FieldDescription>Leave blank to bill the calculated total.</FieldDescription>
          <FieldError message={fieldErrors?.price_override} />
        </Field>

        {/* The status this form rendered with; the action refuses to save over a status that moved since. */}
        {appointment ? <input type="hidden" name="expected_status" value={appointment.status} /> : null}

        <Field className="min-w-0">
          <FieldLabel htmlFor="employee_ids" className={LABEL_CLASSES}>
            Assigned employees
          </FieldLabel>
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
          {appointment ? (
            // Always mounted so screen readers announce each warning as it appears.
            <div aria-live="polite" className="space-y-1.5 empty:hidden">
              {removedClockWarnings.map((warning) => (
                <RemovedClockWarning key={warning.employeeId} name={warning.name} minutes={warning.minutes} />
              ))}
              {isManualCompletionAhead ? <ManualCompletionNote /> : null}
            </div>
          ) : null}
        </Field>

        <Field className="min-w-0">
          <FieldLabel htmlFor="notes" className={LABEL_CLASSES}>
            Notes
          </FieldLabel>
          <Textarea
            id="notes"
            name="notes"
            enterKeyHint="done"
            defaultValue={appointment?.notes ?? ''}
            className="min-h-28 scroll-mb-40 md:scroll-mb-0"
          />
        </Field>

        {!appointment ? (
          <div className="space-y-3 rounded-lg border bg-muted/50 p-4">
            <label className={CHOICE_ROW_CLASSES}>
              <Checkbox checked={isRecurring} onCheckedChange={setIsRecurring} className="mt-0.5 size-5" />
              <span className="min-w-0 space-y-0.5">
                <span className="block text-sm font-medium text-foreground">Make this a recurring appointment</span>
              </span>
            </label>
            {/* The checkbox has no name: the action reads is_recurring === 'on', so post exactly that. */}
            {isRecurring ? <input type="hidden" name="is_recurring" value="on" /> : null}

            {isRecurring ? (
              <div className={`grid gap-4 sm:grid-cols-2 ${ENTER_CLASSES}`}>
                <RepeatsEveryFields
                  defaultCount={1}
                  defaultUnit="week"
                  countError={intervalCountError}
                  unitError={intervalUnitError}
                  countRef={intervalCountRef}
                  unitRef={intervalUnitRef}
                />

                <Field className="min-w-0">
                <FieldLabel htmlFor="recurrence_end_date" className={LABEL_CLASSES}>
                  End date
                </FieldLabel>
                <Input
                  id="recurrence_end_date"
                  name="recurrence_end_date"
                  type="date"
                  aria-invalid={recurrenceEndDateError ? true : undefined}
                  aria-describedby={recurrenceEndDateError ? RECURRENCE_END_DATE_ERROR_ID : undefined}
                />
                <FieldError id={RECURRENCE_END_DATE_ERROR_ID} message={recurrenceEndDateError} />
              </Field>

              <Field className="min-w-0">
                <FieldLabel htmlFor="recurrence_max_occurrences" className={LABEL_CLASSES}>
                  Max occurrences
                </FieldLabel>
                <Input
                  id="recurrence_max_occurrences"
                  name="recurrence_max_occurrences"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Optional"
                />
              </Field>
              </div>
            ) : null}
          </div>
        ) : isEditingRecurringAppointment && recurrenceSeries ? (
          <div className="space-y-4 rounded-lg border bg-muted/50 p-4">
            <input type="hidden" name="recurrence_series_id" value={recurrenceSeries.id} />
            <input type="hidden" name="edit_scope" value={editScope} />

            <div className="space-y-3">
              <p id={RECURRENCE_HEADING_ID} className="text-sm font-medium text-foreground">
                Recurrence settings
              </p>

              <RadioGroup
                aria-labelledby={RECURRENCE_HEADING_ID}
                value={editScope}
                onValueChange={(value) => setEditScope(value as 'occurrence' | 'future')}
                className="gap-0"
              >
                <label className={CHOICE_ROW_CLASSES}>
                  <RadioGroupItem value="occurrence" className={RADIO_CLASSES} />
                  <span className="min-w-0 space-y-0.5">
                    <span className="block text-sm font-medium text-foreground">This appointment only</span>
                    <span className="block text-sm text-muted-foreground">
                      Update only this appointment&apos;s details
                    </span>
                  </span>
                </label>

                <label className={CHOICE_ROW_CLASSES}>
                  <RadioGroupItem value="future" className={RADIO_CLASSES} />
                  <span className="min-w-0 space-y-0.5">
                    <span className="block text-sm font-medium text-foreground">
                      This and all future appointments
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      Update this and all upcoming pending appointments
                    </span>
                  </span>
                </label>
              </RadioGroup>
            </div>

            {showRecurringEditFields ? (
              <div className={`grid gap-4 sm:grid-cols-2 ${ENTER_CLASSES}`}>
                <RepeatsEveryFields
                  defaultCount={recurrenceSeries.interval_count}
                  defaultUnit={recurrenceSeries.interval_unit}
                  countError={intervalCountError}
                  unitError={intervalUnitError}
                  countRef={intervalCountRef}
                  unitRef={intervalUnitRef}
                />

                <Field className="min-w-0">
                <FieldLabel htmlFor="recurrence_end_date" className={LABEL_CLASSES}>
                  End date
                </FieldLabel>
                <Input
                  id="recurrence_end_date"
                  name="recurrence_end_date"
                  type="date"
                  defaultValue={recurrenceSeries.end_date ?? ''}
                  aria-invalid={recurrenceEndDateError ? true : undefined}
                  aria-describedby={recurrenceEndDateError ? RECURRENCE_END_DATE_ERROR_ID : undefined}
                />
                <FieldError id={RECURRENCE_END_DATE_ERROR_ID} message={recurrenceEndDateError} />
              </Field>

              <Field className="min-w-0">
                <FieldLabel htmlFor="recurrence_max_occurrences" className={LABEL_CLASSES}>
                  Max occurrences
                </FieldLabel>
                <Input
                  id="recurrence_max_occurrences"
                  name="recurrence_max_occurrences"
                  type="number"
                  min="1"
                  step="1"
                  defaultValue={recurrenceSeries.max_occurrences ?? ''}
                  placeholder="Optional"
                />
              </Field>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="sticky bottom-0 z-30 -mx-4 -mb-4 space-y-2 rounded-b-lg border-t bg-background/95 px-4 pt-3 pb-[calc(0.75rem+var(--safe-bottom))] shadow-lg backdrop-blur sm:-mx-5 sm:-mb-5 sm:px-5 md:static md:mx-0 md:mb-0 md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none">
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

          <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 md:flex md:justify-end">
            <Button
              variant="outline"
              size="lg"
              className={cn(OUTLINE_PRESS_CLASS_NAME, 'aria-disabled:pointer-events-none aria-disabled:opacity-50')}
              nativeButton={false}
              aria-disabled={isLocked || undefined}
              tabIndex={isLocked ? -1 : undefined}
              render={<Link href={appointment ? `/solutions/appointments/${appointment.id}` : '/solutions/appointments'} />}
            >
              Cancel
            </Button>
            <SubmitButton
              label={appointment ? 'Save Changes' : 'Create Appointment'}
              pendingLabel="Saving…"
              isPending={isLocked}
              size="lg"
              className={cn(PRESS_CLASS_NAME, 'w-full md:w-auto')}
            />
          </div>
        </div>
        </fieldset>
      </form>
    </section>
  )
}
