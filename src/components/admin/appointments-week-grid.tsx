import { addDays, format, parseISO } from 'date-fns'

import type { ScheduleAppointment } from '@/lib/appointments/overview'

import { CalendarEvent, DAY_HEADERS, DayNumberLink } from './appointments-calendar'

const WEEK_DAYS = 7

type AppointmentsWeekGridProps = {
  // In date and start-time order. Days outside the week are ignored.
  appointments: ScheduleAppointment[]
  // The week's Sunday, yyyy-MM-dd.
  from: string
  businessDate: string
}

// The desktop week: 7 columns, every event of each day. Columns grow, so the page scrolls, not them.
export default function AppointmentsWeekGrid({
  appointments,
  from,
  businessDate,
}: AppointmentsWeekGridProps): React.ReactNode {
  const start = parseISO(from)
  const days = Array.from({ length: WEEK_DAYS }, (_, offset) => addDays(start, offset))
  const byDate = Map.groupBy(appointments, (appointment) => appointment.scheduledDate)

  return (
    <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border">
      {days.map((day, offset) => {
        const dateKey = format(day, 'yyyy-MM-dd')
        // The 1st reads "Nov 1" so a week crossing months is clear.
        const label = format(day, day.getDate() === 1 ? 'MMM d' : 'd')

        return (
          <div key={`head-${dateKey}`} className="flex flex-col items-center gap-0.5 bg-muted px-2 py-1.5">
            <span className="text-xs font-medium text-muted-foreground">{DAY_HEADERS[offset]}</span>
            <DayNumberLink dateKey={dateKey} label={label} isToday={dateKey === businessDate} />
          </div>
        )
      })}
      {days.map((day) => {
        const dateKey = format(day, 'yyyy-MM-dd')

        return (
          <div key={`body-${dateKey}`} className="min-h-48 min-w-0 space-y-1 bg-card p-1.5">
            {(byDate.get(dateKey) ?? []).map((appointment) => (
              <CalendarEvent key={appointment.id} appointment={appointment} />
            ))}
          </div>
        )
      })}
    </div>
  )
}
