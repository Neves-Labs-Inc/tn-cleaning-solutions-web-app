'use client'

import Link from 'next/link'
import { useId, useState } from 'react'
import { format, parseISO } from 'date-fns'

import { Checkbox } from '@/components/ui/checkbox'
import PaymentStatePill from '@/components/ui/payment-state-pill'
import StatusBadge, {
  appointmentCardTone,
  appointmentDisplayBadge,
  CARD_TINT_CLASSES,
  lineStateBadge,
} from '@/components/ui/status-badge'
import { isLockedRow, type ScheduleAppointment } from '@/lib/appointments/overview'
import { getWeekLabel, type DateRange } from '@/lib/appointments/range'
import { groupByWeek, type WeekGroup } from '@/lib/appointments/weeks'
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
  // The schedule's read range (whole Sunday weeks): splits the list into week sections, with sticky week
  // headers and empty weeks below md. The Needs lists leave it out and keep plain date bands.
  range?: DateRange
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
  // Under a week header: an h4 that sticks only from md, so below md the week header alone sticks.
  isInWeek: boolean
}

const DATE_BAND_CLASS = 'flex items-center justify-between gap-2 border-b-2 border-border bg-muted px-4 py-2 text-sm font-semibold text-foreground'

function AppointmentDateBand({ date, isToday, hasYear, isInWeek }: DateBandProps): React.ReactNode {
  const Heading = isInWeek ? 'h4' : 'h3'
  return (
    <Heading
      className={cn(DATE_BAND_CLASS, isInWeek ? 'md:sticky md:top-16 md:z-10 lg:top-0' : 'sticky top-16 z-10 lg:top-0')}
    >
      <span className="min-w-0 truncate">{format(parseISO(date), hasYear ? 'EEE, MMM d, yyyy' : 'EEEE, MMMM d')}</span>
      {isToday ? <StatusBadge tone="success">Today</StatusBadge> : null}
    </Heading>
  )
}

type WeekHeaderProps = {
  id: string
  weekStart: string
  isThisWeek: boolean
  businessDate: string
}

// Sticks under the top bar below md, inside its week's section so the next header pushes it off. From md it's
// sr-only: desktop looks as before and the outline still runs h2 > h3 > h4.
function WeekHeader({ id, weekStart, isThisWeek, businessDate }: WeekHeaderProps): React.ReactNode {
  return (
    <h3
      id={id}
      aria-current={isThisWeek ? 'date' : undefined}
      className="sticky top-16 z-10 flex min-h-11 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b bg-card px-4 py-2 text-base font-semibold text-balance text-card-foreground tabular-nums md:sr-only"
    >
      <span className="min-w-0">{getWeekLabel(weekStart, businessDate)}</span>
      {isThisWeek ? <StatusBadge tone="success">This week</StatusBadge> : null}
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
  className?: string
  // 'stacked' keeps the phone layout at every width, for narrow hosts like the day dialog.
  variant?: 'responsive' | 'stacked'
}

export function AppointmentRowLink({
  appointment,
  hasUnpricedTag,
  className,
  variant = 'responsive',
}: RowProps): React.ReactNode {
  const isStacked = variant === 'stacked'
  const status = appointmentDisplayBadge(appointment)
  const isUnpriced = appointment.priceCents === null
  const isTinted = appointmentCardTone(appointment) !== null
  // On a tint the link is a translucent layer, so hover and press darken the tone instead of replacing it.
  const secondaryTextClass = isTinted ? 'text-foreground/70' : 'text-muted-foreground'

  return (
    <Link
      href={`/solutions/appointments/${appointment.id}`}
      className={cn(
        'flex min-h-16 min-w-0 flex-1 flex-col gap-1.5 px-4 py-3 outline-none transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        isTinted ? 'active:bg-foreground/10 md:hover:bg-foreground/5' : 'active:bg-muted md:hover:bg-muted/60',
        !isStacked && 'md:flex-row md:items-center md:justify-between md:gap-3',
        className
      )}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 text-sm font-medium break-words">
            {appointment.clientName} <span className={cn('font-normal', secondaryTextClass)}>· {appointment.jobName}</span>
          </p>
          <Price cents={appointment.priceCents} className={cn('shrink-0', !isStacked && 'md:hidden')} />
        </div>
        <p className={cn('font-mono text-xs tabular-nums', secondaryTextClass)}>{timeRange(appointment)}</p>
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

// The appointments list, grouped into date bands that stick under the top bar, and with a range into weeks too.
export default function AppointmentsList({
  appointments,
  businessDate,
  selection,
  range,
}: AppointmentsListProps): React.ReactNode {
  const lockedHintId = useId()
  const weekHeadingIdPrefix = useId()
  // Decided once per row on first sight, so rows shifting up after a removal don't replay the entry.
  const [seenEntries, setSeenEntries] = useState(new Map<string, number | null>())
  const isSelectable = selection !== undefined
  const businessYear = businessDate.slice(0, 4)
  // Each row's position in the whole list, for the entrance stagger.
  const rowIndex = new Map(appointments.map((appointment, index) => [appointment.id, index]))

  const entryIndexes = new Map(seenEntries)
  for (const [id, index] of rowIndex) {
    if (!entryIndexes.has(id)) entryIndexes.set(id, index < ANIMATED_ROWS ? index : null)
  }
  if (entryIndexes.size !== seenEntries.size) setSeenEntries(entryIndexes)

  function renderDays(rows: ScheduleAppointment[], isInWeek: boolean): React.ReactNode {
    return [...Map.groupBy(rows, (appointment) => appointment.scheduledDate)].map(([date, items]) => (
      <section key={date}>
        <AppointmentDateBand
          date={date}
          isToday={date === businessDate}
          // The open-ended list can run past December.
          hasYear={isSelectable || !date.startsWith(businessYear)}
          isInWeek={isInWeek}
        />
        <ul className="divide-y">
          {items.map((appointment) => {
            const entryIndex = entryIndexes.get(appointment.id) ?? null
            const isAnimated = entryIndex !== null
            const isLocked = selection !== undefined && isLockedRow(appointment.clientId, selection.lockedClientId)
            const tone = appointmentCardTone(appointment)

            return (
              <li
                key={appointment.id}
                className={cn(
                  'flex items-stretch transition-colors duration-base',
                  tone && CARD_TINT_CLASSES[tone],
                  isAnimated && 'animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-base',
                  isLocked && 'opacity-60'
                )}
                style={isAnimated ? { animationDelay: `${entryIndex * ROW_STAGGER_MS}ms` } : undefined}
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
                <AppointmentRowLink
                  appointment={appointment}
                  hasUnpricedTag={isSelectable}
                  // Clears the sticky week header too when focus scrolls a row into view.
                  className={isInWeek ? 'scroll-mt-12 md:scroll-mt-0' : undefined}
                />
              </li>
            )
          })}
        </ul>
      </section>
    ))
  }

  function renderWeek({ weekStart, weekEnd, appointments: rows }: WeekGroup): React.ReactNode {
    const headingId = `${weekHeadingIdPrefix}-${weekStart}`
    return (
      <section key={weekStart} aria-labelledby={headingId} className="not-first:border-t md:not-first:border-t-0">
        <WeekHeader
          id={headingId}
          weekStart={weekStart}
          isThisWeek={weekStart <= businessDate && businessDate <= weekEnd}
          businessDate={businessDate}
        />
        {rows.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground md:sr-only">No appointments this week</p>
        ) : (
          renderDays(rows, true)
        )}
      </section>
    )
  }

  return (
    <div>
      {/* Only while a client is locked, so a view without the lock never announces it. */}
      {isSelectable && selection.lockedClientId !== null ? (
        <span id={lockedHintId} className="sr-only">
          Only one client can be selected at a time.
        </span>
      ) : null}
      {range === undefined
        ? renderDays(appointments, false)
        : groupByWeek(appointments, range).map(renderWeek)}
    </div>
  )
}
