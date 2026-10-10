'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { endOfMonth, format, startOfMonth } from 'date-fns'

import { createClient } from '@/lib/supabase/browser'
import type { AppointmentStatus } from '@/lib/appointments/lifecycle'

type ContextAppointmentRow = {
  id: string
  scheduled_date: string
  scheduled_start_time: string
  scheduled_end_time: string
  status: AppointmentStatus
  clients: { id: string; name: string } | null
  jobs: { id: string; name: string } | null
  client_locations: { label: string | null; address: string | null } | null
  appointment_employees:
    | Array<{
        id: string
        employee_id: string
        employees: { full_name: string } | null
      }>
    | null
}

type ContextAppointmentQueryRow = Omit<ContextAppointmentRow, 'clients' | 'jobs' | 'client_locations'> & {
  clients: Array<{ id: string; name: string }> | { id: string; name: string } | null
  jobs: Array<{ id: string; name: string }> | { id: string; name: string } | null
  client_locations: Array<{ label: string | null; address: string | null }> | { label: string | null; address: string | null } | null
  appointment_employees:
    | Array<{
        id: string
        employee_id: string
        employees: Array<{ full_name: string }> | { full_name: string } | null
      }>
    | null
}

type AppointmentScheduleContextProps = {
  initialMonth: number
  initialYear: number
  currentAppointmentId?: string
  showNewAppointmentLink?: boolean
}

function statusClasses(status: ContextAppointmentRow['status']) {
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

function pickSingle<T>(value: T[] | T | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value
}

export function AppointmentScheduleContext({
  initialMonth,
  initialYear,
  currentAppointmentId,
  showNewAppointmentLink,
}: AppointmentScheduleContextProps) {
  const [selectedMonth, setSelectedMonth] = useState(initialMonth)
  const [selectedYear, setSelectedYear] = useState(initialYear)
  const [appointments, setAppointments] = useState<ContextAppointmentRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const contextDate = useMemo(() => new Date(selectedYear, selectedMonth - 1, 1), [selectedMonth, selectedYear])
  const contextMonthLabel = useMemo(() => format(contextDate, 'MMMM yyyy'), [contextDate])

  useEffect(() => {
    let isActive = true

    async function fetchAppointments() {
      setIsLoading(true)
      setLoadError(null)

      const supabase = createClient()
      const firstDayOfMonth = format(startOfMonth(contextDate), 'yyyy-MM-dd')
      const lastDayOfMonth = format(endOfMonth(contextDate), 'yyyy-MM-dd')

      const { data, error } = await supabase
        .from('appointments')
        .select(
          `
            id, scheduled_date, scheduled_start_time, scheduled_end_time, status,
            clients!inner ( id, name ),
            jobs!inner ( id, name ),
            client_locations ( label, address ),
            appointment_employees ( id, employee_id, employees!inner ( full_name ) )
          `
        )
        .eq('is_archived', false)
        // A crew-removed Cleaner's archived assignment is history, not crew; NULL counts as live.
        .not('appointment_employees.is_archived', 'is', true)
        .gte('scheduled_date', firstDayOfMonth)
        .lte('scheduled_date', lastDayOfMonth)
        .order('scheduled_date', { ascending: true })
        .order('scheduled_start_time', { ascending: true })

      if (!isActive) {
        return
      }

      if (error) {
        setLoadError(error.message)
      } else {
        const rows = (data as unknown as ContextAppointmentQueryRow[] | null) ?? []
        const normalizedRows: ContextAppointmentRow[] = rows.map((row) => ({
          ...row,
          clients: pickSingle(row.clients),
          jobs: pickSingle(row.jobs),
          client_locations: pickSingle(row.client_locations),
          appointment_employees: (row.appointment_employees ?? []).map((assignment) => ({
            ...assignment,
            employees: pickSingle(assignment.employees),
          })),
        }))

        setAppointments(normalizedRows)
      }

      setIsLoading(false)
    }

    void fetchAppointments()

    return () => {
      isActive = false
    }
  }, [contextDate])

  const updateMonth = (monthValue: number) => {
    if (Number.isInteger(monthValue) && monthValue >= 1 && monthValue <= 12) {
      setSelectedMonth(monthValue)
    }
  }

  const updateYear = (yearValue: number) => {
    if (Number.isInteger(yearValue) && yearValue >= 2000 && yearValue <= 2100) {
      setSelectedYear(yearValue)
    }
  }


  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm shadow-emerald-950/5">
      <div className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-neutral-900">Schedule Context</h2>
          <p className="text-xs text-neutral-500">Showing appointments for {contextMonthLabel}</p>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">

            <select
              name="month"
              value={String(selectedMonth)}
              onChange={(event) => updateMonth(Number(event.target.value))}
              className="h-8 rounded-md border border-neutral-200 bg-white px-2 text-xs text-neutral-700"
            >
              {Array.from({ length: 12 }, (_, index) => {
                const monthValue = index + 1

                return (
                  <option key={monthValue} value={monthValue}>
                    {format(new Date(2024, index, 1), 'MMM')}
                  </option>
                )
              })}
            </select>

            <select
              name="year"
              value={String(selectedYear)}
              onChange={(event) => updateYear(Number(event.target.value))}
              className="h-8 rounded-md border border-neutral-200 bg-white px-2 text-xs text-neutral-700"
            >
              {Array.from({ length: 101 }, (_, index) => {
                const yearValue = 2000 + index

                return (
                  <option key={yearValue} value={yearValue}>
                    {yearValue}
                  </option>
                )
              })}
            </select>

            {showNewAppointmentLink ? (
              <Link
                href="/solutions/appointments/new"
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                New Appointment
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      {loadError ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          Could not load schedule context. {loadError}
        </div>
      ) : null}

      {appointments.length > 0 ? (
        <div className="mt-3 flex flex-col gap-3 lg:max-h-[calc(100vh-16rem)] lg:overflow-y-auto lg:pr-1">
          {appointments.map((appointment) => {
            const locationLabel = appointment.client_locations?.label?.trim()
            const locationAddress = appointment.client_locations?.address?.trim()
            const locationText =
              locationLabel || locationAddress ? [locationLabel, locationAddress].filter(Boolean).join(' - ') : null
            const scheduledDateLabel = format(new Date(`${appointment.scheduled_date}T00:00:00`), 'EEE, MMM d')

            const isCurrentAppointment = currentAppointmentId === appointment.id

            return (
              <Link className="block" href={`/solutions/appointments/${appointment.id}/edit`} key={appointment.id}>
                <article
                  className={`cursor-pointer rounded-xl border px-3 py-2.5 text-xs transition-colors hover:border-emerald-300 hover:bg-emerald-50/30 ${
                    isCurrentAppointment ? 'border-emerald-400 bg-emerald-50' : 'border-neutral-200 bg-white'
                  }`}
                >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 text-neutral-700">
                    <p className="font-medium text-neutral-900">
                      {scheduledDateLabel} · {appointment.scheduled_start_time.slice(0, 5)} -{' '}
                      {appointment.scheduled_end_time.slice(0, 5)}
                    </p>
                    <p>
                      {appointment.clients?.name ?? 'Unknown client'} · {appointment.jobs?.name ?? 'Unknown job'}
                    </p>
                    {locationText ? <p className="text-neutral-500">{locationText}</p> : null}
                    <p className="text-neutral-600">
                      Assigned:{' '}
                      {(appointment.appointment_employees ?? []).length > 0
                        ? (appointment.appointment_employees ?? [])
                            .map((assignment) => assignment.employees?.full_name ?? 'Unknown employee')
                            .join(', ')
                        : 'Unassigned'}
                    </p>
                  </div>

                  <span
                    className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${statusClasses(
                      appointment.status
                    )}`}
                  >
                    {appointment.status.replace('_', ' ')}
                  </span>
                </div>
                </article>
              </Link>
            )
          })}
        </div>
      ) : isLoading ? (
        <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-4 text-xs text-neutral-600">
          Loading appointments for this month...
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-emerald-200 bg-emerald-50/40 px-3 py-4 text-xs text-neutral-600">
          No appointments scheduled for this month.
        </div>
      )}
    </section>
  )
}