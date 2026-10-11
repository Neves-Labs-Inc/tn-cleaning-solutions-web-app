'use client'

import Link from 'next/link'
import { useId, useOptimistic, useState, useTransition } from 'react'
import { format } from 'date-fns'
import { Calendar, CalendarDays, CheckCircle2, List, ReceiptText, SearchX } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  ALL_APPOINTMENTS_FILTER,
  isAppointmentsFilterActive,
  type AppointmentsFilter,
  type FilterOptions,
} from '@/lib/appointments/filters'
import {
  appointmentsHref,
  appointmentsInView,
  createPendingTile,
  getNavQuery,
  parseAppointmentsQuery,
  syncPendingTile,
  type AppointmentsQuery,
  type Overview,
  type ScheduleAppointment,
} from '@/lib/appointments/overview'
import type { NeedsCompletionAppointment } from '@/lib/appointments/needs-completion'
import type { PaymentMethod } from '@/lib/invoices/ledger'
import type { NeedsBillingAppointment } from '@/lib/invoices/payment-state-queries'
import { cn } from '@/lib/utils'

import AppointmentsCalendar from './appointments-calendar'
import AppointmentsFilters from './appointments-filters'
import AppointmentsList from './appointments-list'
import AppointmentsMonthNav from './appointments-month-nav'
import AppointmentsNeedsBilling from './appointments-needs-billing'
import AppointmentsNeedsCompletion from './appointments-needs-completion'
import AppointmentsOverviewTiles from './appointments-overview-tiles'

type AppointmentsViewToggleProps = {
  query: AppointmentsQuery
  overview: Overview
  // The selected month's appointments.
  appointments: ScheduleAppointment[]
  // Read only for the Needs billing view; empty otherwise.
  needsBilling: NeedsBillingAppointment[]
  // Read only for the Needs completion view; empty otherwise.
  needsCompletion: NeedsCompletionAppointment[]
  methods: PaymentMethod[]
  filterOptions: FilterOptions
  businessDate: string
}

type Layout = 'calendar' | 'list'

const NEW_APPOINTMENT_PATH = '/solutions/appointments/new'
const PRESS_CLASS = 'transition-[background-color,transform,box-shadow] duration-fast active:scale-[0.98]'
const TOGGLE_ITEM_CLASS = 'h-8 px-2.5 text-xs transition-colors duration-fast hover:bg-muted data-pressed:bg-muted data-pressed:text-foreground'

type ShowCancelledToggleProps = {
  showCancelled: boolean
  // A status filter other than All already decides whether cancelled rows show.
  disabled: boolean
  onToggle: () => void
}

function ShowCancelledToggle({ showCancelled, disabled, onToggle }: ShowCancelledToggleProps): React.ReactNode {
  return (
    <Button
      variant="outline"
      aria-pressed={showCancelled}
      disabled={disabled}
      className={cn(PRESS_CLASS, showCancelled && 'bg-muted text-foreground')}
      onClick={onToggle}
    >
      {showCancelled ? 'Hide cancelled' : 'Show cancelled'}
    </Button>
  )
}

type StateEmptyProps = {
  query: AppointmentsQuery
}

// Billed or Paid with nothing this month: replaces both the calendar and the list.
function PaymentStateEmpty({ query }: StateEmptyProps): React.ReactNode {
  const Icon = query.view === 'paid' ? CheckCircle2 : ReceiptText
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>No {query.view} appointments this month.</EmptyTitle>
      </EmptyHeader>
      <EmptyContent>
        <Button
          variant="outline"
          className={PRESS_CLASS}
          nativeButton={false}
          render={<Link href={appointmentsHref({ ...query, view: 'schedule' })} />}
        >
          Show all
        </Button>
      </EmptyContent>
    </Empty>
  )
}

function MonthEmpty({ query }: StateEmptyProps): React.ReactNode {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CalendarDays aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>No appointments in {monthLabel(query)}</EmptyTitle>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" className={PRESS_CLASS} nativeButton={false} render={<Link href={NEW_APPOINTMENT_PATH} />}>
          New appointment
        </Button>
      </EmptyContent>
    </Empty>
  )
}

function monthLabel(query: AppointmentsQuery): string {
  return format(new Date(query.year, query.month - 1, 1), 'MMMM yyyy')
}

function countLabel(count: number): string {
  return `${count} ${count === 1 ? 'appointment' : 'appointments'}`
}

type FilteredEmptyProps = {
  query: AppointmentsQuery
  onClear: () => void
}

// The filters match nothing: replaces both the calendar and the list, which has nowhere for Clear.
function FilteredEmpty({ query, onClear }: FilteredEmptyProps): React.ReactNode {
  const isStateView = query.view === 'billed' || query.view === 'paid'
  return (
    <Empty className="animate-in fade-in-0 duration-base ease-out-quart">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchX aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{isStateView ? `No ${query.view} appointments match` : 'No appointments match'}</EmptyTitle>
        <EmptyDescription>Nothing in {monthLabel(query)} matches these filters.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button type="button" variant="outline" className={PRESS_CLASS} onClick={onClear}>
          Clear filters
        </Button>
      </EmptyContent>
    </Empty>
  )
}

function filterOf({ clientId, jobId, status }: AppointmentsQuery): AppointmentsFilter {
  return { clientId, jobId, status }
}

// The overview tiles and the appointments card: the month's schedule (calendar on desktop, list everywhere), filtered to
// Billed or Paid when that tile is active, or the Needs billing or Needs completion list.
export function AppointmentsViewToggle({
  query,
  overview,
  appointments,
  needsBilling,
  needsCompletion,
  methods,
  filterOptions,
  businessDate,
}: AppointmentsViewToggleProps): React.ReactNode {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [layout, setLayout] = useState<Layout>('calendar')
  const [pendingTile, setPendingTile] = useState(() => createPendingTile(query))
  const [optimisticFilter, setOptimisticFilter] = useOptimistic(filterOf(query))
  const clientTriggerId = useId()

  const isNeedsBilling = query.view === 'needs-billing'
  const isNeedsCompletion = query.view === 'needs-completion'
  const isStateView = query.view === 'billed' || query.view === 'paid'
  const visible = appointmentsInView(appointments, query)
  const isCalendar = layout === 'calendar'
  const isFilteredEmpty = isAppointmentsFilterActive(query) && visible.length === 0

  // Next keeps this state across search-param changes, so the pending tile is synced to the URL on render.
  const syncedTile = syncPendingTile(pendingTile, query)
  if (syncedTile !== pendingTile) setPendingTile(syncedTile)
  // A filter change still in flight rides along, so Prev, Next and Show cancelled don't drop it.
  const navQuery = { ...getNavQuery(syncedTile, query), ...optimisticFilter }

  function handleNavigate(href: string): void {
    startTransition(() => router.push(href))
  }

  // Pushed (not replaced) like the month nav, so Back steps through filter changes.
  function handleFilterChange(patch: Partial<AppointmentsFilter>): void {
    const next = { ...navQuery, ...patch }
    startTransition(() => {
      setOptimisticFilter(filterOf(next))
      router.push(appointmentsHref(next), { scroll: false })
    })
  }

  function handleClearFilters(): void {
    handleFilterChange(ALL_APPOINTMENTS_FILTER)
    // Both Clear buttons unmount, so focus moves to the first control instead of falling to body.
    document.getElementById(clientTriggerId)?.focus()
  }

  function handleTileClick(event: React.MouseEvent<HTMLDivElement>): void {
    // A modified click opens a new tab and leaves this page as it is.
    const isModified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0
    const anchor = (event.target as HTMLElement).closest('a')
    if (isModified || !anchor) return

    const params = Object.fromEntries(new URL(anchor.href).searchParams)
    setPendingTile(createPendingTile(query, parseAppointmentsQuery(params, businessDate)))
  }

  function handleLayoutChange(value: string[]): void {
    // Pressing the active item again would empty the group; keep the current layout then.
    const [next] = value
    if (next === 'calendar' || next === 'list') setLayout(next)
  }

  const listContent =
    visible.length > 0 ? (
      <AppointmentsList appointments={visible} businessDate={businessDate} />
    ) : (
      <MonthEmpty query={query} />
    )

  return (
    <div className="space-y-6">
      <div onClickCapture={handleTileClick}>
        <AppointmentsOverviewTiles overview={overview} query={query} />
      </div>
      <div className="space-y-3">
        {/* The Needs views list every month unfiltered for now. */}
        {isNeedsBilling || isNeedsCompletion ? null : (
          <>
            <AppointmentsFilters
              filter={optimisticFilter}
              clients={filterOptions.clients}
              jobs={filterOptions.jobs}
              clientTriggerId={clientTriggerId}
              onChange={handleFilterChange}
              onClear={handleClearFilters}
            />
            <p aria-live="polite" className="sr-only">
              {countLabel(visible.length)}
            </p>
          </>
        )}
        <Card
          aria-busy={isPending || undefined}
          className={cn(
            // Visible overflow, so the date bands can stick under the top bar.
            'gap-0 overflow-visible p-0 text-sm transition-opacity duration-fast',
            isPending && 'opacity-60'
          )}
        >
          {isNeedsBilling ? (
            <AppointmentsNeedsBilling appointments={needsBilling} methods={methods} businessDate={businessDate} />
          ) : isNeedsCompletion ? (
            <AppointmentsNeedsCompletion appointments={needsCompletion} businessDate={businessDate} />
          ) : (
            <>
              <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 md:w-80">
                  <AppointmentsMonthNav query={navQuery} onNavigate={handleNavigate} />
                </div>
                {/* On phones a Billed or Paid view has nothing here (no toggles), so the row goes. */}
                <div className={cn('flex items-center justify-end gap-2', isStateView && 'max-md:hidden')}>
                  {/* A cancelled appointment is never Billed or Paid, so the toggle only serves the schedule. */}
                  {isStateView ? null : (
                    <ShowCancelledToggle
                      showCancelled={query.showCancelled}
                      disabled={optimisticFilter.status !== 'all'}
                      onToggle={() =>
                        handleNavigate(appointmentsHref({ ...navQuery, showCancelled: !navQuery.showCancelled }))
                      }
                    />
                  )}
                  <ToggleGroup
                    variant="outline"
                    size="sm"
                    aria-label="Layout"
                    value={[layout]}
                    onValueChange={handleLayoutChange}
                    className="hidden md:flex"
                  >
                    <ToggleGroupItem value="calendar" className={TOGGLE_ITEM_CLASS}>
                      <Calendar aria-hidden="true" className="size-4" />
                      Calendar
                    </ToggleGroupItem>
                    <ToggleGroupItem value="list" className={TOGGLE_ITEM_CLASS}>
                      <List aria-hidden="true" className="size-4" />
                      List
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </div>

              {isStateView ? (
                <p className="border-b px-4 py-2 text-sm text-muted-foreground">
                  Showing {query.view} appointments ·{' '}
                  <Button
                    variant="link"
                    className="h-auto p-0 text-sm"
                    nativeButton={false}
                    render={<Link href={appointmentsHref({ ...query, view: 'schedule' })} />}
                  >
                    show all
                  </Button>
                </p>
              ) : null}

              {isFilteredEmpty ? (
                <FilteredEmpty query={query} onClear={handleClearFilters} />
              ) : isStateView && visible.length === 0 ? (
                <PaymentStateEmpty query={query} />
              ) : (
                // Keyed so a new month or view replays the row entrance.
                <div key={`${query.view}-${query.year}-${query.month}`}>
                  {isCalendar ? (
                    <div className="hidden p-4 md:block">
                      <AppointmentsCalendar
                        appointments={visible}
                        month={query.month}
                        year={query.year}
                        businessDate={businessDate}
                      />
                    </div>
                  ) : null}
                  <div className={cn(isCalendar && 'md:hidden')}>{listContent}</div>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
