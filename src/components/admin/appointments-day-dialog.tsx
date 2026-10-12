'use client'

import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import ResponsiveDialog from '@/components/ui/responsive-dialog'
import { appointmentCardTone, CARD_TINT_CLASSES } from '@/components/ui/status-badge'
import type { ScheduleAppointment } from '@/lib/appointments/overview'
import { cn } from '@/lib/utils'

import { AppointmentRowLink } from './appointments-list'

type AppointmentsDayDialogProps = {
  // The day last opened, kept while closing so the exit animation shows its content; null before any open.
  date: string | null
  isOpen: boolean
  // That day's visible rows: the same array the cell was built from.
  appointments: ScheduleAppointment[]
  onOpenChange: (open: boolean) => void
}

const ANIMATED_ROWS = 8
const ROW_STAGGER_MS = 40

function describeCount(count: number): string {
  return `${count} ${count === 1 ? 'appointment' : 'appointments'}`
}

// One day's full appointments, opened from a month cell's "+N more" / "View all".
export default function AppointmentsDayDialog({
  date,
  isOpen,
  appointments,
  onOpenChange,
}: AppointmentsDayDialogProps): React.ReactNode {
  if (date === null) return null

  return (
    <ResponsiveDialog
      open={isOpen}
      onOpenChange={onOpenChange}
      title={format(parseISO(date), 'EEEE, MMMM d, yyyy')}
      description={describeCount(appointments.length)}
    >
      {appointments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No appointments on this day.</p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-lg border">
          {appointments.map((appointment, index) => {
            const tone = appointmentCardTone(appointment)

            return (
              <li
                key={appointment.id}
                className={cn(
                  'flex items-stretch transition-colors duration-base',
                  tone && CARD_TINT_CLASSES[tone],
                  index < ANIMATED_ROWS && 'animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-base'
                )}
                style={index < ANIMATED_ROWS ? { animationDelay: `${index * ROW_STAGGER_MS}ms` } : undefined}
              >
                <AppointmentRowLink appointment={appointment} hasUnpricedTag={false} variant="stacked" />
              </li>
            )
          })}
        </ul>
      )}
      <div className="sticky bottom-0 -mx-4 mt-3 border-t bg-popover px-4 pt-3 pb-1">
        <Button
          className="w-full cursor-pointer transition-[background-color,transform,box-shadow] duration-fast hover:bg-primary/90 active:scale-[0.98]"
          nativeButton={false}
          render={<Link href={`/solutions/appointments/new?date=${date}`} />}
        >
          <Plus aria-hidden="true" />
          New appointment on this day
        </Button>
      </div>
    </ResponsiveDialog>
  )
}
