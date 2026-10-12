'use client'

import Link from 'next/link'
import { useId, useOptimistic, useState, useTransition } from 'react'
import { Calendar, CalendarDays, CalendarRange, CheckCircle2, List, ReceiptText, SearchX } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  ALL_APPOINTMENTS_FILTER,
  filterNeedsRows,
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
import {
  canShowMore,
  getRangeCopy,
  getWeekEnd,
  LAYOUTS,
  resolveWeekStart,
  showMore,
  stepWeek,
  switchLayout,
  toCurrentWeek,
  type Layout,
} from '@/lib/appointments/range'
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
import AppointmentsRangeNav from './appointments-range-nav'

type AppointmentsViewToggleProps = {
  query: AppointmentsQuery
  overview: Overview
  // The visible range's appointments: the month in the Month layout, from the week start onward otherwise.
  appointments: ScheduleAppointment[]
  // Read only for the Needs billing view; empty otherwise.
  needsBilling: NeedsBillingAppointment[]
  // Read only for the Needs completion view; empty otherwise.
  needsCompletion: NeedsCompletionAppointment[]
  methods: PaymentMethod[]
  filterOptions: FilterOptions
  businessDate: string
}

type RangeState = Pick<AppointmentsQuery, 'layout' | 'from' | 'weeks' | 'month' | 'year'>

const NEW_APPOINTMENT_PATH = '/solutions/appointments/new'
// The Needs views list every month, so there is no range to name.
const ALL_MONTHS_PHRASE = 'across all months'
const PRESS_CLASS = 'transition-[background-color,transform,box-shadow] duration-fast active:scale-[0.98]'
const TOGGLE_ITEM_CLASS = 'h-8 cursor-pointer px-2.5 text-xs transition-colors duration-fast hover:bg-muted data-pressed:bg-muted data-pressed:text-foreground'

type ResponsiveTextProps = {
  phone: string
  desktop: string
}

// Week shows the 7 days on desktop but the list on phones, so its copy differs by width.
function ResponsiveText({ phone, desktop }: ResponsiveTextProps): React.ReactNode {
  if (phone === desktop) return phone

  return (
    <>
      <span className="md:hidden">{phone}</span>
      <span className="hidden md:inline">{desktop}</span>
    </>
  )
}

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

type ThisWeekButtonProps = {
  className?: string
  onClick: () => void
}

function ThisWeekButton({ className, onClick }: ThisWeekButtonProps): React.ReactNode {
  return (
    <Button
      type="button"
      variant="outline"
      className={cn(PRESS_CLASS, 'animate-in fade-in-0 duration-fast ease-out-quart', className)}
      onClick={onClick}
    >
      This week
    </Button>
  )
}

type PaymentStateEmptyProps = {
  query: AppointmentsQuery
  phrase: string
}

// Billed or Paid with nothing in the range: replaces both the calendar and the list.
function PaymentStateEmpty({ query, phrase }: PaymentStateEmptyProps): React.ReactNode {
  const Icon = query.view === 'paid' ? CheckCircle2 : ReceiptText
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>
          No {query.view} appointments {phrase}.
        </EmptyTitle>
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

function RangeEmpty({ phrase }: { phrase: string }): React.ReactNode {
  return (
    <Empty className="animate-in fade-in-0 duration-base ease-out-quart">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CalendarDays aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>No appointments {phrase}</EmptyTitle>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" className={PRESS_CLASS} nativeButton={false} render={<Link href={NEW_APPOINTMENT_PATH} />}>
          New appointment
        </Button>
      </EmptyContent>
    </Empty>
  )
}

function countLabel(count: number): string {
  return `${count} ${count === 1 ? 'appointment' : 'appointments'}`
}

type FilteredEmptyProps = {
  query: AppointmentsQuery
  phrase: string
  onClear: () => void
}

// The filters match nothing: replaces both the calendar and the list, which has nowhere for Clear.
function FilteredEmpty({ query, phrase, onClear }: FilteredEmptyProps): React.ReactNode {
  const isStateView = query.view === 'billed' || query.view === 'paid'
  return (
    <Empty className="animate-in fade-in-0 duration-base ease-out-quart">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchX aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{isStateView ? `No ${query.view} appointments match` : 'No appointments match'}</EmptyTitle>
        <EmptyDescription>Nothing {phrase} matches these filters.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button type="button" variant="outline" className={PRESS_CLASS} onClick={onClear}>
          Clear filters
        </Button>
      </EmptyContent>
    </Empty>
  )
}

type ScheduleBodyProps = {
  query: AppointmentsQuery
  appointments: ScheduleAppointment[]
  phrase: string
  businessDate: string
  onClear: () => void
  // The month grid, which shows even an empty month; the list otherwise.
  calendar?: React.ReactNode
}

// One width's schedule: the empty state that fits, else the calendar or the list.
function ScheduleBody({ query, appointments, phrase, businessDate, onClear, calendar }: ScheduleBodyProps): React.ReactNode {
  const isEmpty = appointments.length === 0
  const isStateView = query.view === 'billed' || query.view === 'paid'

  let body: React.ReactNode
  if (isEmpty && isAppointmentsFilterActive(query)) {
    body = <FilteredEmpty query={query} phrase={phrase} onClear={onClear} />
  } else if (isEmpty && isStateView) {
    body = <PaymentStateEmpty query={query} phrase={phrase} />
  } else if (calendar) {
    body = calendar
  } else if (isEmpty) {
    body = <RangeEmpty phrase={phrase} />
  } else {
    body = <AppointmentsList appointments={appointments} businessDate={businessDate} />
  }
  return body
}

function filterOf({ clientId, jobId, status }: AppointmentsQuery): AppointmentsFilter {
  return { clientId, jobId, status }
}

function rangeOf({ layout, from, weeks, month, year }: AppointmentsQuery): RangeState {
  return { layout, from, weeks, month, year }
}

function isLayout(value: string | undefined): value is Layout {
  return LAYOUTS.some((layout) => layout === value)
}

// The overview tiles and the appointments card: the range's schedule (Week, Month or List on desktop, the list on
// phones), filtered to Billed or Paid when that tile is active, or the Needs billing or Needs completion list.
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
  const [pendingTile, setPendingTile] = useState(() => createPendingTile(query))
  const [optimisticFilter, setOptimisticFilter] = useOptimistic(filterOf(query))
  const [optimisticRange, setOptimisticRange] = useOptimistic(rangeOf(query))
  const clientTriggerId = useId()
  const headingId = useId()

  const isNeedsBilling = query.view === 'needs-billing'
  const isNeedsCompletion = query.view === 'needs-completion'
  const isStateView = query.view === 'billed' || query.view === 'paid'
  const visible = appointmentsInView(appointments, query)
  // Status doesn't apply to a Needs view, so it neither narrows nor counts as a filter there.
  const isNeedsView = isNeedsBilling || isNeedsCompletion
  // Next keeps this state across search-param changes, so the pending tile is synced to the URL on render.
  const syncedTile = syncPendingTile(pendingTile, query)
  if (syncedTile !== pendingTile) setPendingTile(syncedTile)
  // A filter or range change still in flight rides along, so the next press doesn't drop it.
  const navQuery = { ...getNavQuery(syncedTile, query), ...optimisticFilter, ...optimisticRange }

  const needsFilter = { ...optimisticFilter, status: 'all' as const }
  const visibleNeedsBilling = filterNeedsRows(needsBilling, optimisticFilter)
  const visibleNeedsCompletion = filterNeedsRows(needsCompletion, optimisticFilter)
  const visibleNeedsCount = isNeedsBilling ? visibleNeedsBilling.length : visibleNeedsCompletion.length
  const isNeedsFiltered = isAppointmentsFilterActive(needsFilter) && visibleNeedsCount === 0

  // The header shows the target range at once; the body shows the range the server sent.
  const isNavMonth = navQuery.layout === 'month'
  const showThisWeek = !isNavMonth && navQuery.from !== null
  // Phones always get the list, so Week reads as List there.
  const navHeading = (
    <ResponsiveText
      phone={getRangeCopy(navQuery, businessDate, 'list').heading}
      desktop={getRangeCopy(navQuery, businessDate).heading}
    />
  )

  const isWeek = query.layout === 'week'
  const isMonth = query.layout === 'month'
  const phonePhrase = getRangeCopy(query, businessDate, isMonth ? 'month' : 'list').phrase
  const desktopPhrase = getRangeCopy(query, businessDate).phrase
  const weekEnd = getWeekEnd(resolveWeekStart(query.from, businessDate))
  // Until the week grid lands, Week lists its 7 days of the list-extent read.
  const desktopVisible = isWeek ? visible.filter((appointment) => appointment.scheduledDate <= weekEnd) : visible

  function handleNavigate(next: AppointmentsQuery): void {
    // Pushed (not replaced), so Back steps through ranges, layouts and filter changes.
    startTransition(() => {
      setOptimisticRange(rangeOf(next))
      setOptimisticFilter(filterOf(next))
      router.push(appointmentsHref(next), { scroll: false })
    })
  }

  function handleFilterChange(patch: Partial<AppointmentsFilter>): void {
    handleNavigate({ ...navQuery, ...patch })
  }

  function handleClearFilters(): void {
    // A Needs view hides Status, so a Clear there leaves it in the URL for the schedule.
    handleFilterChange(isNeedsView ? { clientId: '', jobId: '' } : ALL_APPOINTMENTS_FILTER)
    // Both Clear buttons unmount, so focus moves to the first control instead of falling to body.
    document.getElementById(clientTriggerId)?.focus()
  }

  function handleShowMore(): void {
    const next = showMore(navQuery)
    handleNavigate(next)
    // At the cap Show more unmounts, so focus moves to the heading instead of falling to body.
    if (!canShowMore(next)) document.getElementById(headingId)?.focus()
  }

  function handleThisWeek(): void {
    handleNavigate(toCurrentWeek(navQuery))
    // This week unmounts, so focus moves to the heading, which announces the new range.
    document.getElementById(headingId)?.focus()
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
    if (isLayout(next)) handleNavigate(switchLayout(navQuery, next, businessDate))
  }

  const scheduleProps = { query, businessDate, onClear: handleClearFilters }
  const needsFilteredEmpty = isNeedsFiltered ? (
    <FilteredEmpty query={query} phrase={ALL_MONTHS_PHRASE} onClear={handleClearFilters} />
  ) : null

  return (
    <div className="space-y-6">
      <div onClickCapture={handleTileClick}>
        <AppointmentsOverviewTiles overview={overview} query={query} />
      </div>
      <div className="space-y-3">
        <AppointmentsFilters
          filter={isNeedsView ? needsFilter : optimisticFilter}
          clients={filterOptions.clients}
          jobs={filterOptions.jobs}
          clientTriggerId={clientTriggerId}
          showStatus={!isNeedsView}
          onChange={handleFilterChange}
          onClear={handleClearFilters}
        />
        <p aria-live="polite" className="sr-only">
          {isNeedsView ? (
            countLabel(visibleNeedsCount)
          ) : (
            <ResponsiveText phone={countLabel(visible.length)} desktop={countLabel(desktopVisible.length)} />
          )}
        </p>
        <Card
          aria-busy={isPending || undefined}
          className={cn(
            // Visible overflow, so the date bands can stick under the top bar.
            'gap-0 overflow-visible p-0 text-sm transition-opacity duration-fast',
            isPending && 'opacity-60'
          )}
        >
          {isNeedsBilling ? (
            <AppointmentsNeedsBilling
              appointments={visibleNeedsBilling}
              methods={methods}
              businessDate={businessDate}
              filteredEmpty={needsFilteredEmpty}
            />
          ) : isNeedsCompletion ? (
            <AppointmentsNeedsCompletion
              appointments={visibleNeedsCompletion}
              businessDate={businessDate}
              filteredEmpty={needsFilteredEmpty}
            />
          ) : (
            <>
              <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:flex-wrap md:items-center md:justify-between">
                {/* This week comes after the nav block, so showing it never moves Prev, the heading or Next. */}
                <div className="flex min-w-0 items-center gap-2">
                  <div className="min-w-0 flex-1 md:w-96 md:flex-none">
                    {isNavMonth ? (
                      <AppointmentsMonthNav query={navQuery} onNavigate={handleNavigate} />
                    ) : (
                      <AppointmentsRangeNav
                        heading={navHeading}
                        headingId={headingId}
                        onPrev={() => handleNavigate(stepWeek(navQuery, -1, businessDate))}
                        onNext={() => handleNavigate(stepWeek(navQuery, 1, businessDate))}
                      />
                    )}
                  </div>
                  {showThisWeek ? <ThisWeekButton className="max-md:hidden" onClick={handleThisWeek} /> : null}
                </div>
                {/* On phones a Billed or Paid view off This week has nothing here (no toggles), so the row goes. */}
                <div
                  className={cn(
                    // ml-auto keeps the group on the right when the header wraps (~768px).
                    'flex items-center gap-2 md:ml-auto md:justify-end',
                    showThisWeek ? 'justify-between' : 'justify-end',
                    isStateView && !showThisWeek && 'max-md:hidden'
                  )}
                >
                  {showThisWeek ? <ThisWeekButton className="md:hidden" onClick={handleThisWeek} /> : null}
                  {/* A cancelled appointment is never Billed or Paid, so the toggle only serves the schedule. */}
                  {isStateView ? null : (
                    <ShowCancelledToggle
                      showCancelled={query.showCancelled}
                      disabled={optimisticFilter.status !== 'all'}
                      onToggle={() => handleNavigate({ ...navQuery, showCancelled: !navQuery.showCancelled })}
                    />
                  )}
                  <ToggleGroup
                    variant="outline"
                    size="sm"
                    aria-label="Layout"
                    value={[optimisticRange.layout]}
                    onValueChange={handleLayoutChange}
                    className="hidden md:flex"
                  >
                    <ToggleGroupItem value="week" className={TOGGLE_ITEM_CLASS}>
                      <CalendarRange aria-hidden="true" className="size-4" />
                      Week
                    </ToggleGroupItem>
                    <ToggleGroupItem value="month" className={TOGGLE_ITEM_CLASS}>
                      <Calendar aria-hidden="true" className="size-4" />
                      Month
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
                  Showing {query.view} appointments <ResponsiveText phone={phonePhrase} desktop={desktopPhrase} /> ·{' '}
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

              {/* Keyed so a new range, layout or view replays the row entrance. */}
              <div key={`${query.view}-${query.layout}-${query.from}-${query.year}-${query.month}`}>
                {query.layout === 'list' ? (
                  <ScheduleBody {...scheduleProps} appointments={visible} phrase={phonePhrase} />
                ) : (
                  <>
                    <div className="hidden md:block">
                      <ScheduleBody
                        {...scheduleProps}
                        appointments={desktopVisible}
                        phrase={desktopPhrase}
                        calendar={
                          isMonth ? (
                            <div className="p-4">
                              <AppointmentsCalendar
                                appointments={visible}
                                month={query.month}
                                year={query.year}
                                businessDate={businessDate}
                              />
                            </div>
                          ) : undefined
                        }
                      />
                    </div>
                    <div className="md:hidden">
                      <ScheduleBody {...scheduleProps} appointments={visible} phrase={phonePhrase} />
                    </div>
                  </>
                )}
              </div>

              {/* Outside the keyed block, so the rows already shown don't replay their entrance. */}
              {!isMonth && canShowMore(query) ? (
                <div className={cn('flex justify-center border-t p-4', isWeek && 'md:hidden')}>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(PRESS_CLASS, 'w-full sm:w-auto')}
                    onClick={handleShowMore}
                  >
                    Show more
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
