'use client'

import Link from 'next/link'
import { eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek } from 'date-fns'

import PaymentStatePill from '@/components/ui/payment-state-pill'
import { appointmentDisplayBadge, NOT_CLOCKED_BADGE } from '@/components/ui/status-badge'
import type { ScheduleAppointment } from '@/lib/appointments/overview'
import { cn } from '@/lib/utils'

import { calendarEventTitle } from './calendar-event-title'

type AppointmentsCalendarProps = {
  appointments: ScheduleAppointment[]
  month: number
  year: number
  businessDate: string
}

// Warning text only for the Not clocked spec; every other status stays muted.
const STATUS_TEXT_CLASSES = {
  warning: 'text-status-warning-foreground',
  default: 'text-muted-foreground',
}

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function CalendarEvent({ appointment }: { appointment: ScheduleAppointment }): React.ReactNode {
  const status = appointmentDisplayBadge(appointment.status, appointment.isNotClocked)
  const statusTextClass = status === NOT_CLOCKED_BADGE ? STATUS_TEXT_CLASSES.warning : STATUS_TEXT_CLASSES.default

  return (
    <Link
      href={`/solutions/appointments/${appointment.id}`}
      title={calendarEventTitle(appointment)}
      className={cn(
        'block cursor-pointer space-y-0.5 rounded-md border bg-background px-1.5 py-1 text-xs leading-tight outline-none transition-colors duration-fast hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:bg-muted',
        appointment.status === 'cancelled' && 'line-through opacity-60'
      )}
    >
      <p className="truncate font-medium">
        <span className="font-mono tabular-nums">{appointment.startTime.slice(0, 5)}</span> {appointment.jobName}
      </p>
      <p className="truncate text-muted-foreground">{appointment.clientName}</p>
      <div className="flex flex-wrap items-center gap-1">
        <span className={cn('text-xs', statusTextClass)}>{status.label}</span>
        <PaymentStatePill state={appointment.paymentState} className="h-5 max-w-full min-w-0 overflow-hidden px-1.5 text-xs [&>svg]:size-3" />
      </div>
    </Link>
  )
}

// The desktop month grid. Day numbers start a new appointment on that date.
export default function AppointmentsCalendar({
  appointments,
  month,
  year,
  businessDate,
}: AppointmentsCalendarProps): React.ReactNode {
  const monthDate = new Date(year, month - 1, 1)
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(monthDate)),
    end: endOfWeek(endOfMonth(monthDate)),
  })
  const byDate = Map.groupBy(appointments, (appointment) => appointment.scheduledDate)

  return (
    <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border">
      {DAY_HEADERS.map((day) => (
        <div key={day} className="bg-muted px-2 py-1.5 text-center text-xs font-medium text-muted-foreground">
          {day}
        </div>
      ))}
      {days.map((day) => {
        const dateKey = format(day, 'yyyy-MM-dd')
        const isInMonth = isSameMonth(day, monthDate)
        const isToday = dateKey === businessDate

        return (
          <div
            key={dateKey}
            className={cn('min-h-32 min-w-0 space-y-1 bg-card p-1.5', !isInMonth && 'bg-muted/40 text-muted-foreground')}
          >
            <Link
              href={`/solutions/appointments/new?date=${dateKey}`}
              aria-label={`New appointment on ${format(day, 'MMMM d, yyyy')}`}
              className={cn(
                'inline-flex size-7 items-center justify-center rounded-full text-xs font-medium outline-none transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-ring',
                isToday ? 'bg-primary text-primary-foreground' : 'hover:bg-muted active:bg-muted'
              )}
            >
              {format(day, 'd')}
            </Link>
            {(byDate.get(dateKey) ?? []).map((appointment) => (
              <CalendarEvent key={appointment.id} appointment={appointment} />
            ))}
          </div>
        )
      })}
    </div>
  )
}
