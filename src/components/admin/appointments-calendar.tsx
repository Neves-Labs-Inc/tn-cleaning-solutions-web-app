'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { addMonths, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek } from 'date-fns'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import type { AppointmentSummary } from '@/components/admin/appointments-types'
import { Button } from '@/components/ui/button'
import { getBusinessDate } from '@/lib/schedule'
import { cn } from '@/lib/utils'

type AppointmentsCalendarProps = {
  appointments: AppointmentSummary[]
  month: number
  year: number
}

const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function statusChipClasses(status: AppointmentSummary['status']) {
  if (status === 'in_progress') {
    return 'border border-emerald-200 bg-emerald-50 text-emerald-700'
  }

  if (status === 'completed') {
    return 'border border-neutral-200 bg-neutral-100 text-neutral-700'
  }

  if (status === 'cancelled') {
    return 'border border-red-200 bg-red-50 text-red-600 line-through'
  }

  return 'border border-blue-200 bg-blue-50 text-blue-700'
}

function toDateString(date: Date) {
  return format(date, 'yyyy-MM-dd')
}

export function AppointmentsCalendar({ appointments, month, year }: AppointmentsCalendarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const monthDate = new Date(year, month - 1, 1)
  const monthLabel = format(monthDate, 'MMMM yyyy')
  const todayKey = getBusinessDate(new Date())

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(monthDate), { weekStartsOn: 0 })
    const end = endOfWeek(endOfMonth(monthDate), { weekStartsOn: 0 })

    const allDays: Date[] = []
    const current = new Date(start)
    while (current <= end) {
      allDays.push(new Date(current))
      current.setDate(current.getDate() + 1)
    }

    return allDays
  }, [monthDate])

  const appointmentsByDay = useMemo(() => {
    const grouped = new Map<string, AppointmentSummary[]>()

    for (const appointment of appointments) {
      const dateKey = appointment.scheduled_date
      const existing = grouped.get(dateKey) ?? []
      existing.push(appointment)
      grouped.set(dateKey, existing)
    }

    return grouped
  }, [appointments])

  const navigateMonth = (offset: number) => {
    const target = addMonths(monthDate, offset)
    const params = new URLSearchParams(searchParams.toString())
    params.set('month', String(target.getMonth() + 1))
    params.set('year', String(target.getFullYear()))
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <section className="space-y-4 rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm shadow-emerald-950/5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-full"
            onClick={() => navigateMonth(-1)}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            Prev
          </Button>
          <h2 className="min-w-44 text-center text-lg font-semibold text-neutral-900">{monthLabel}</h2>
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-full"
            onClick={() => navigateMonth(1)}
          >
            Next
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>

        <Link href="/solutions/appointments/new">
          <Button className="h-9 rounded-full bg-emerald-600 px-4 text-sm text-white hover:bg-emerald-700">
            <Plus className="size-4" aria-hidden="true" />
            New Appointment
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {dayHeaders.map((day) => (
          <div
            key={day}
            className="rounded-xl border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-neutral-600"
          >
            {day}
          </div>
        ))}

        {days.map((day) => {
          const dayKey = toDateString(day)
          const dayAppointments = appointmentsByDay.get(dayKey) ?? []
          const inCurrentMonth = isSameMonth(day, monthDate)
          const isToday = dayKey === todayKey

          return (
            <div
              key={dayKey}
              className={cn(
                'min-h-36 rounded-xl border p-2 transition-colors',
                inCurrentMonth
                  ? 'border-neutral-200 bg-white hover:bg-emerald-50/30'
                  : 'border-neutral-100 bg-neutral-50/60 text-neutral-400',
                isToday && 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-white'
              )}
            >
              <Link
                href={`/solutions/appointments/new?date=${dayKey}`}
                className={cn(
                  'mb-2 inline-flex size-7 items-center justify-center rounded-full text-xs font-semibold',
                  inCurrentMonth ? 'text-neutral-900 hover:bg-emerald-100' : 'text-neutral-400'
                )}
              >
                {format(day, 'd')}
              </Link>

              <div className="space-y-1.5">
                {dayAppointments.map((appointment) => (
                  <Link
                    key={appointment.id}
                    href={`/solutions/appointments/${appointment.id}`}
                    className={cn(
                      'block rounded-lg px-2 py-1.5 text-[11px] leading-tight font-medium transition-colors hover:brightness-95',
                      statusChipClasses(appointment.status)
                    )}
                    title={`${appointment.scheduled_start_time.slice(0, 5)} ${appointment.job.name} • ${appointment.client.name}`}
                  >
                    <p className="truncate">
                      {appointment.scheduled_start_time.slice(0, 5)} {appointment.job.name}
                    </p>
                    <p className="truncate text-[10px] opacity-90">{appointment.client.name}</p>
                  </Link>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
