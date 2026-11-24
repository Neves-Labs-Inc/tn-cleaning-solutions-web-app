'use client'

import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'

import { groupByMonth, tickState, type PickerAppointment, type PickerMonth } from '@/lib/invoices/appointment-picker'
import { formatCents } from '@/lib/pricing/money'
import { cn } from '@/lib/utils'

import { PickerRow, PickerSkeleton, TickAll } from './appointment-picker-parts'

type AppointmentPickerProps = {
  unbilled: PickerAppointment[]
  upcoming: PickerAppointment[]
  selected: ReadonlySet<string>
  onSelectedChange: (next: Set<string>) => void
  disabled?: boolean
  // A client switch is loading: the body shows placeholder rows.
  isLoading?: boolean
  isUpcomingOpenByDefault?: boolean
  // Overrides the picker's own surface, for a host that already draws the card around it.
  className?: string
}

function sumCents(rows: PickerAppointment[]): number {
  return rows.reduce((total, row) => total + (row.price_cents ?? 0), 0)
}

function CountAndTotal({ count, totalCents }: { count: number; totalCents: number }) {
  return (
    <span className="text-sm text-muted-foreground tabular-nums">
      {count} · {formatCents(totalCents)}
    </span>
  )
}

// Ticks every id when any is unticked, otherwise unticks them all.
function toggledIds(ids: string[], selected: ReadonlySet<string>): Set<string> {
  const next = new Set(selected)
  const isAllTicked = tickState(ids, selected) === 'all'
  for (const id of ids) {
    if (isAllTicked) next.delete(id)
    else next.add(id)
  }
  return next
}

type MonthGroupProps = {
  month: PickerMonth
  selected: ReadonlySet<string>
  disabled: boolean
  onToggleIds: (ids: string[]) => void
}

function MonthGroup({ month, selected, disabled, onToggleIds }: MonthGroupProps) {
  const ids = month.rows.map((row) => row.id)

  return (
    <div className="divide-y divide-border">
      <TickAll
        state={tickState(ids, selected)}
        disabled={disabled}
        onToggle={() => onToggleIds(ids)}
        className="bg-muted/60"
      >
        <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{month.label}</span>
        <span className="ml-auto">
          <CountAndTotal count={month.count} totalCents={month.totalCents} />
        </span>
      </TickAll>
      {month.rows.map((row) => (
        <PickerRow
          key={row.id}
          appointment={row}
          isChecked={selected.has(row.id)}
          disabled={disabled}
          onToggle={(id) => onToggleIds([id])}
        />
      ))}
    </div>
  )
}

// The checkbox list of a client's appointments to bill: Unbilled work, and Upcoming work billed ahead.
// Controlled and fetch-free: the owner decides what the ticks mean (a draft's lines, a new draft).
export function AppointmentPicker({
  unbilled,
  upcoming,
  selected,
  onSelectedChange,
  disabled = false,
  isLoading = false,
  isUpcomingOpenByDefault = false,
  className,
}: AppointmentPickerProps) {
  const [isUpcomingOpen, setIsUpcomingOpen] = useState(isUpcomingOpenByDefault)
  const upcomingId = useId()
  const isDisabled = disabled || isLoading

  function handleToggleIds(ids: string[]) {
    onSelectedChange(toggledIds(ids, selected))
  }

  function renderMonths(rows: PickerAppointment[]) {
    return groupByMonth(rows).map((month) => (
      <MonthGroup key={month.key} month={month} selected={selected} disabled={isDisabled} onToggleIds={handleToggleIds} />
    ))
  }

  const unbilledIds = unbilled.map((row) => row.id)

  return (
    <div
      aria-busy={isLoading || disabled}
      className={cn(
        'divide-y divide-border overflow-hidden rounded-lg bg-popover shadow-sm ring-1 ring-foreground/10',
        className
      )}
    >
      {isLoading ? (
        <PickerSkeleton />
      ) : (
        <>
          <section>
            <TickAll
              state={tickState(unbilledIds, selected)}
              disabled={isDisabled || unbilled.length === 0}
              onToggle={() => handleToggleIds(unbilledIds)}
            >
              <span className="text-base font-semibold">Unbilled</span>
              <CountAndTotal count={unbilled.length} totalCents={sumCents(unbilled)} />
              <span className="ml-auto text-sm text-muted-foreground">Select all</span>
            </TickAll>
            {unbilled.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                Every completed appointment is on an invoice.
              </p>
            ) : null}
            {renderMonths(unbilled)}
          </section>

          {upcoming.length > 0 ? (
            <section>
              <button
                type="button"
                aria-expanded={isUpcomingOpen}
                aria-controls={upcomingId}
                disabled={disabled}
                onClick={() => setIsUpcomingOpen((isOpen) => !isOpen)}
                className="flex min-h-11 w-full cursor-pointer items-center gap-3 px-4 text-left outline-none transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset active:bg-muted disabled:cursor-not-allowed md:hover:bg-muted"
              >
                <ChevronDown
                  aria-hidden="true"
                  className={cn(
                    'size-5 shrink-0 transition-transform duration-fast ease-out-quart',
                    !isUpcomingOpen && '-rotate-90'
                  )}
                />
                <span className="text-base font-semibold">Upcoming</span>
                <CountAndTotal count={upcoming.length} totalCents={sumCents(upcoming)} />
                <span className="ml-auto text-sm text-muted-foreground">Bill ahead</span>
              </button>
              {/* grid-rows animates height, so collapse can run faster than expand. inert keeps hidden rows out of the tab order. */}
              <div
                id={upcomingId}
                inert={!isUpcomingOpen}
                className={cn(
                  'grid transition-[grid-template-rows,opacity]',
                  isUpcomingOpen
                    ? 'grid-rows-[1fr] opacity-100 duration-base ease-out-quart'
                    : 'grid-rows-[0fr] opacity-0 duration-fast ease-in-quart'
                )}
              >
                <div className="min-h-0 overflow-hidden">{renderMonths(upcoming)}</div>
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  )
}
