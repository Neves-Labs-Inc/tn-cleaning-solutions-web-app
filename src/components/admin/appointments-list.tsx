'use client'

import Link from 'next/link'
import { useId } from 'react'
import { format, parseISO } from 'date-fns'

import { Checkbox } from '@/components/ui/checkbox'
import PaymentStatePill from '@/components/ui/payment-state-pill'
import StatusBadge, { appointmentDisplayBadge, lineStateBadge } from '@/components/ui/status-badge'
import { isLockedRow, type ScheduleAppointment } from '@/lib/appointments/overview'
import { formatCents, UNPRICED_LABEL } from '@/lib/pricing/money'
import { cn } from '@/lib/utils'

// Row selection for Needs billing (rows of one client at a time) and Needs completion (any rows).
export type ListSelection = {
  selectedIds: string[]
  // The client of the checked rows; every other client's row is disabled. null when none is
  // checked, or when any client's rows can be mixed.
  lockedClientId: string | null
  onToggle: (id: string) => void
}

type AppointmentsListProps = {
  // Already in date and start-time order.
  appointments: ScheduleAppointment[]
  businessDate: string
  // The all-months views only: a checkbox per row, the year in every date band and the Unpriced tag.
  selection?: ListSelection
}

const ANIMATED_ROWS = 8
const ROW_STAGGER_MS = 40
const UNPRICED_BADGE = lineStateBadge('unpriced')

function timeRange(appointment: ScheduleAppointment): string {
  return `${appointment.startTime.slice(0, 5)} – ${appointment.endTime.slice(0, 5)}`
}

type DateBandProps = {
  date: string
  isToday: boolean
  hasYear: boolean
}

function AppointmentDateBand({ date, isToday, hasYear }: DateBandProps): React.ReactNode {
  return (
    <h3 className="sticky top-16 z-10 flex items-center justify-between gap-2 border-b-2 border-border bg-muted px-4 py-2 text-sm font-semibold text-foreground lg:top-0">
      <span className="min-w-0 truncate">{format(parseISO(date), hasYear ? 'EEE, MMM d, yyyy' : 'EEEE, MMMM d')}</span>
      {isToday ? <StatusBadge tone="success">Today</StatusBadge> : null}
    </h3>
  )
}

function Price({ cents, className }: { cents: number | null; className?: string }): React.ReactNode {
  return (
    <span className={cn('text-sm font-semibold tabular-nums', className)}>
      {cents === null ? (
        <>
          <span aria-hidden="true">{UNPRICED_LABEL}</span>
          <span className="sr-only">Unpriced</span>
        </>
      ) : (
        formatCents(cents)
      )}
    </span>
  )
}

type RowProps = {
  appointment: ScheduleAppointment
  hasUnpricedTag: boolean
  // 'stacked' keeps the phone layout at every width, for narrow hosts like the day dialog.
  variant?: 'responsive' | 'stacked'
}

export function AppointmentRowLink({ appointment, hasUnpricedTag, variant = 'responsive' }: RowProps): React.ReactNode {
  const isStacked = variant === 'stacked'
  const status = appointmentDisplayBadge(appointment.status, appointment.isNotClocked)
  const isUnpriced = appointment.priceCents === null

  return (
    <Link
      href={`/solutions/appointments/${appointment.id}`}
      className={cn(
        'flex min-h-16 min-w-0 flex-1 flex-col gap-1.5 px-4 py-3 outline-none transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:bg-muted md:hover:bg-muted/60',
        !isStacked && 'md:flex-row md:items-center md:justify-between md:gap-3'
      )}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 text-sm font-medium break-words">
            {appointment.clientName} <span className="font-normal text-muted-foreground">· {appointment.jobName}</span>
          </p>
          <Price cents={appointment.priceCents} className={cn('shrink-0', !isStacked && 'md:hidden')} />
        </div>
        <p className="font-mono text-xs text-muted-foreground tabular-nums">{timeRange(appointment)}</p>
      </div>
      <div className={cn('flex min-w-0 flex-wrap items-center gap-1.5', !isStacked && 'md:shrink-0 md:flex-nowrap')}>
        <StatusBadge tone={status.tone} icon={status.icon}>{status.label}</StatusBadge>
        <PaymentStatePill state={appointment.paymentState} />
        {hasUnpricedTag && isUnpriced && UNPRICED_BADGE ? (
          <StatusBadge tone={UNPRICED_BADGE.tone}>{UNPRICED_BADGE.label}</StatusBadge>
        ) : null}
        {isStacked ? null : <Price cents={appointment.priceCents} className="hidden w-24 text-right md:block" />}
      </div>
    </Link>
  )
}

// The appointments list, grouped into date bands that stick under the top bar.
export default function AppointmentsList({
  appointments,
  businessDate,
  selection,
}: AppointmentsListProps): React.ReactNode {
  const lockedHintId = useId()
  const isSelectable = selection !== undefined
  const businessYear = businessDate.slice(0, 4)
  const byDate = [...Map.groupBy(appointments, (appointment) => appointment.scheduledDate)]
  // Each row's position in the whole list, for the entrance stagger.
  const rowIndex = new Map(appointments.map((appointment, index) => [appointment.id, index]))

  return (
    <div>
      {/* Only while a client is locked, so a view without the lock never announces it. */}
      {isSelectable && selection.lockedClientId !== null ? (
        <span id={lockedHintId} className="sr-only">
          Only one client can be selected at a time.
        </span>
      ) : null}
      {byDate.map(([date, items]) => (
        <section key={date}>
          <AppointmentDateBand
            date={date}
            isToday={date === businessDate}
            // The open-ended list can run past December.
            hasYear={isSelectable || !date.startsWith(businessYear)}
          />
          <ul className="divide-y">
            {items.map((appointment) => {
              const index = rowIndex.get(appointment.id) ?? 0
              const isAnimated = index < ANIMATED_ROWS
              const isLocked = selection !== undefined && isLockedRow(appointment.clientId, selection.lockedClientId)

              return (
                <li
                  key={appointment.id}
                  className={cn(
                    'flex items-stretch',
                    isAnimated && 'animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-base',
                    isLocked && 'opacity-60'
                  )}
                  style={isAnimated ? { animationDelay: `${index * ROW_STAGGER_MS}ms` } : undefined}
                >
                  {selection ? (
                    <label className="flex min-h-11 min-w-11 shrink-0 items-center justify-center pl-2">
                      <Checkbox
                        aria-label={`Select ${appointment.jobName} for ${appointment.clientName} on ${format(parseISO(appointment.scheduledDate), 'MMMM d, yyyy')}`}
                        aria-describedby={isLocked ? lockedHintId : undefined}
                        checked={selection.selectedIds.includes(appointment.id)}
                        disabled={isLocked}
                        onCheckedChange={() => selection.onToggle(appointment.id)}
                      />
                    </label>
                  ) : null}
                  <AppointmentRowLink appointment={appointment} hasUnpricedTag={isSelectable} />
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
