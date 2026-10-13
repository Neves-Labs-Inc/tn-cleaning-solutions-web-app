'use client'

import Link from 'next/link'
import { useId } from 'react'
import { AlertCircle, Calendar, CalendarDays, CalendarRange, CheckCircle2, List, ReceiptText, SearchX } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { PRESS_CLASS_NAME } from '@/components/admin/detail-page/press'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  ALL_APPOINTMENTS_FILTER,
  filterNeedsRows,
  isAppointmentsFilterActive,
  type AppointmentsFilter,
  type FilterOptions,
} from '@/lib/appointments/filters'
import {
  APPOINTMENTS_PATH,
  appointmentsHref,
  appointmentsInView,
  parseAppointmentsSearch,
  type AppointmentsQuery,
  type Overview,
  type ScheduleAppointment,
} from '@/lib/appointments/overview'
import {
  canShowMore,
  getRangeCopy,
  getReadRange,
  getWeekEnd,
  LAYOUTS,
  resolveWeekStart,
  showMore,
  stepWeek,
  switchLayout,
  toCurrentWeek,
  type Layout,
  type RangeQuery,
} from '@/lib/appointments/range'
import type { RangeState } from '@/hooks/use-appointments-screen'
import type { NeedsCompletionAppointment } from '@/lib/appointments/needs-completion'
import type { PaymentMethod } from '@/lib/invoices/ledger'
import type { NeedsBillingAppointment } from '@/lib/invoices/payment-state-queries'
import { cn } from '@/lib/utils'

import AppointmentsCalendar from './appointments-calendar'
import AppointmentsFilters from './appointments-filters'
import AppointmentsList from './appointments-list'
import AppointmentsListSkeleton from './appointments-list-skeleton'
import AppointmentsMonthGridSkeleton from './appointments-month-grid-skeleton'
import AppointmentsMonthNav from './appointments-month-nav'
import AppointmentsNeedsBilling from './appointments-needs-billing'
import AppointmentsNeedsCompletion from './appointments-needs-completion'
import AppointmentsOverviewTiles from './appointments-overview-tiles'
import AppointmentsRangeNav from './appointments-range-nav'
import AppointmentsWeekGrid from './appointments-week-grid'
import AppointmentsWeekGridSkeleton from './appointments-week-grid-skeleton'

type AppointmentsViewToggleProps = {
  // The URL's query: the view, the filters and the target range the nav header shows.
  query: AppointmentsQuery
  // The range the body shows: the target, or while Show more loads, the range shown so far.
  range: RangeQuery
  // Whether the body is a skeleton, or Show more is loading or has failed.
  rangeState: RangeState
  overview: Overview
  // The body range's appointments: the month in the Month layout, from the week start onward otherwise.
  appointments: ScheduleAppointment[]
  // Read only for the Needs billing view; empty otherwise.
  needsBilling: NeedsBillingAppointment[]
  // Read only for the Needs completion view; empty otherwise.
  needsCompletion: NeedsCompletionAppointment[]
  // null until loaded.
  methods: PaymentMethod[] | null
  filterOptions: FilterOptions
  businessDate: string
  // Moves the screen to another query in place, as a new history entry.
  onNavigate: (next: AppointmentsQuery) => void
}

const NEW_APPOINTMENT_PATH = '/solutions/appointments/new'
// The Needs views list every month, so there is no range to name.
const ALL_MONTHS_PHRASE = 'across all months'
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
      className={cn(PRESS_CLASS_NAME, showCancelled && 'bg-muted text-foreground')}
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
      className={cn(PRESS_CLASS_NAME, 'animate-in fade-in-0 duration-fast ease-out-quart', className)}
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
          className={PRESS_CLASS_NAME}
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
        <Button variant="outline" className={PRESS_CLASS_NAME} nativeButton={false} render={<Link href={NEW_APPOINTMENT_PATH} />}>
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
        <Button type="button" variant="outline" className={PRESS_CLASS_NAME} onClick={onClear}>
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
  // The month grid, which shows even an empty month; the week grid, which gives way to an empty state.
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
    // Month's list is a phone's brief stop before the List replaces it, so only whole-week ranges split into weeks.
    const range = query.layout === 'month' ? undefined : getReadRange(query, businessDate)
    body = <AppointmentsList appointments={appointments} businessDate={businessDate} range={range} />
  }
  return body
}

type RangeSkeletonProps = {
  layout: Layout
  month: number
  year: number
}

// The skeleton of the layout being loaded: the list on phones, and the grid from md for Week and Month.
function RangeSkeleton({ layout, month, year }: RangeSkeletonProps): React.ReactNode {
  if (layout === 'list') return <AppointmentsListSkeleton weekHeader />

  return (
    <>
      <div className="md:hidden">
        {/* Phones always land on the week-grouped list (Month is replaced by it there). */}
        <AppointmentsListSkeleton weekHeader />
      </div>
      <div className="hidden md:block">
        {layout === 'month' ? <AppointmentsMonthGridSkeleton month={month} year={year} /> : <AppointmentsWeekGridSkeleton />}
      </div>
    </>
  )
}

type ShowMoreFooterProps = {
  rangeState: RangeState
  // Week shows the 7 days on desktop, so Show more is a phone control there.
  isPhoneOnly: boolean
  onShowMore: () => void
}

// Outside the keyed body, so the rows already shown don't replay their entrance. While the new weeks
// load, skeleton rows sit above the button; if they fail, an inline alert takes the same slot.
function ShowMoreFooter({ rangeState, isPhoneOnly, onShowMore }: ShowMoreFooterProps): React.ReactNode {
  const isLoading = rangeState.status === 'loading-more'
  const isFailed = rangeState.status === 'more-error'

  return (
    <div className={cn(isPhoneOnly && 'md:hidden')}>
      {isLoading ? <AppointmentsListSkeleton bands={1} weekHeader /> : null}
      {rangeState.status === 'more-error' ? (
        <div className="px-4 py-3">
          <Alert variant="destructive" className="animate-in fade-in-0 duration-base ease-out-quart">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>Couldn&apos;t load more weeks</AlertTitle>
            <AlertDescription>The appointments above are still up to date.</AlertDescription>
          </Alert>
        </div>
      ) : null}
      <div className="flex justify-center border-t p-4">
        <Button
          type="button"
          variant="outline"
          // Disabled but focusable, so keyboard focus survives the label swap.
          disabled={isLoading}
          focusableWhenDisabled
          aria-busy={isLoading || undefined}
          className={cn(
            PRESS_CLASS_NAME,
            'w-full sm:w-auto sm:min-w-40',
            // focusableWhenDisabled sets aria-disabled, not :disabled, so the Button's own disabled styles never apply.
            // Dim only the content, not the whole button, so the focus ring keeps its full alpha.
            'aria-disabled:cursor-default aria-disabled:text-muted-foreground aria-disabled:hover:text-muted-foreground aria-disabled:hover:bg-transparent aria-disabled:active:translate-y-0 aria-disabled:active:scale-100'
          )}
          onClick={rangeState.status === 'more-error' ? rangeState.onRetry : onShowMore}
        >
          {isLoading ? (
            <>
              <Spinner className="size-4" />
              Loading more…
            </>
          ) : isFailed ? (
            'Try again'
          ) : (
            'Show more'
          )}
        </Button>
      </div>
    </div>
  )
}

function filterOf({ clientId, jobId, status }: AppointmentsQuery): AppointmentsFilter {
  return { clientId, jobId, status }
}

function isLayout(value: string | undefined): value is Layout {
  return LAYOUTS.some((layout) => layout === value)
}

// A primary click with no modifier: the ones a link may handle in place. The rest open a new tab or window.
function isPlainClick(event: React.MouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
}

// The overview tiles and the appointments card: the range's schedule (Week, Month or List on desktop, the list on
// phones), filtered to Billed or Paid when that tile is active, or the Needs billing or Needs completion list.
export function AppointmentsViewToggle({
  query,
  range,
  rangeState,
  overview,
  appointments,
  needsBilling,
  needsCompletion,
  methods,
  filterOptions,
  businessDate,
  onNavigate,
}: AppointmentsViewToggleProps): React.ReactNode {
  const clientTriggerId = useId()
  const headingId = useId()

  const isNeedsBilling = query.view === 'needs-billing'
  const isNeedsCompletion = query.view === 'needs-completion'
  const isStateView = query.view === 'billed' || query.view === 'paid'
  // The body: the URL's view and filters over the range that has data.
  const bodyQuery = { ...query, ...range }
  const visible = appointmentsInView(appointments, bodyQuery)
  // Status doesn't apply to a Needs view, so it neither narrows nor counts as a filter there.
  const isNeedsView = isNeedsBilling || isNeedsCompletion
  // Only the schedule body has a range to wait for; the Needs lists are already loaded.
  const isBodyLoading = rangeState.status === 'loading' && !isNeedsView
  const filter = filterOf(query)

  const needsFilter = { ...filter, status: 'all' as const }
  const visibleNeedsBilling = filterNeedsRows(needsBilling, filter)
  const visibleNeedsCompletion = filterNeedsRows(needsCompletion, filter)
  const visibleNeedsCount = isNeedsBilling ? visibleNeedsBilling.length : visibleNeedsCompletion.length
  const isNeedsFiltered = isAppointmentsFilterActive(needsFilter) && visibleNeedsCount === 0

  // The header shows the target range at once; the body shows the range that has data.
  const isNavMonth = query.layout === 'month'
  const showThisWeek = !isNavMonth && query.from !== null
  // Phones always get the list, so Week reads as List there.
  const navHeading = (
    <ResponsiveText
      phone={getRangeCopy(query, businessDate, 'list').heading}
      desktop={getRangeCopy(query, businessDate).heading}
    />
  )

  const isWeek = bodyQuery.layout === 'week'
  const isMonth = bodyQuery.layout === 'month'
  const phonePhrase = getRangeCopy(bodyQuery, businessDate, isMonth ? 'month' : 'list').phrase
  const desktopPhrase = getRangeCopy(bodyQuery, businessDate).phrase
  const weekEnd = getWeekEnd(resolveWeekStart(bodyQuery.from, businessDate))
  // Week reads the list's extent (one read serves both widths), so trim it to the 7 days the grid shows.
  const desktopVisible = isWeek ? visible.filter((appointment) => appointment.scheduledDate <= weekEnd) : visible

  function handleFilterChange(patch: Partial<AppointmentsFilter>): void {
    onNavigate({ ...query, ...patch })
  }

  function handleClearFilters(): void {
    // A Needs view hides Status, so a Clear there leaves it in the URL for the schedule.
    handleFilterChange(isNeedsView ? { clientId: '', jobId: '' } : ALL_APPOINTMENTS_FILTER)
    // Both Clear buttons unmount, so focus moves to the first control instead of falling to body.
    document.getElementById(clientTriggerId)?.focus()
  }

  function handleShowMore(): void {
    const next = showMore(query)
    onNavigate(next)
    // At the cap Show more unmounts, so focus moves to the heading instead of falling to body.
    if (!canShowMore(next)) document.getElementById(headingId)?.focus()
  }

  function handleThisWeek(): void {
    onNavigate(toCurrentWeek(query))
    // This week unmounts, so focus moves to the heading, which announces the new range.
    document.getElementById(headingId)?.focus()
  }

  // The tiles and the Show all links are Links to this screen, so a plain click on one moves the
  // screen in place. Modified clicks fall through to the Link and open a new tab as usual; links
  // that leave the screen (rows, New appointment) aren't this path.
  function handleScreenLinkClick(event: React.MouseEvent<HTMLDivElement>): void {
    const anchor = event.target instanceof Element ? event.target.closest('a') : null
    if (anchor === null || !isPlainClick(event)) return

    const url = new URL(anchor.href)
    if (url.origin !== window.location.origin || url.pathname !== APPOINTMENTS_PATH) return

    // Before the Link's own handler, which skips a click already prevented.
    event.preventDefault()
    // Keeps nextjs-toploader's document click listener from starting a bar no navigation will finish.
    event.stopPropagation()
    onNavigate(parseAppointmentsSearch(url.searchParams, businessDate))
  }

  function handleLayoutChange(value: string[]): void {
    // Pressing the active item again would empty the group; keep the current layout then.
    const [next] = value
    if (isLayout(next)) onNavigate(switchLayout(query, next, businessDate))
  }

  const scheduleProps = { query: bodyQuery, businessDate, onClear: handleClearFilters }
  const needsFilteredEmpty = isNeedsFiltered ? (
    <FilteredEmpty query={query} phrase={ALL_MONTHS_PHRASE} onClear={handleClearFilters} />
  ) : null

  return (
    <div className="space-y-6" onClickCapture={handleScreenLinkClick}>
      <AppointmentsOverviewTiles overview={overview} query={query} />
      <div className="space-y-3">
        <AppointmentsFilters
          filter={isNeedsView ? needsFilter : filter}
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
          ) : isBodyLoading ? (
            'Loading appointments…'
          ) : (
            <ResponsiveText phone={countLabel(visible.length)} desktop={countLabel(desktopVisible.length)} />
          )}
        </p>
        <Card
          aria-busy={isBodyLoading || undefined}
          // Visible overflow, so the date bands can stick under the top bar.
          className="gap-0 overflow-visible p-0 text-sm"
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
                      <AppointmentsMonthNav query={query} onNavigate={onNavigate} />
                    ) : (
                      <AppointmentsRangeNav
                        heading={navHeading}
                        headingId={headingId}
                        onPrev={() => onNavigate(stepWeek(query, -1, businessDate))}
                        onNext={() => onNavigate(stepWeek(query, 1, businessDate))}
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
                      disabled={query.status !== 'all'}
                      onToggle={() => onNavigate({ ...query, showCancelled: !query.showCancelled })}
                    />
                  )}
                  <ToggleGroup
                    variant="outline"
                    size="sm"
                    aria-label="Layout"
                    value={[query.layout]}
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

              {isBodyLoading ? (
                <RangeSkeleton layout={bodyQuery.layout} month={bodyQuery.month} year={bodyQuery.year} />
              ) : (
                // Keyed by the range on screen, so rows replay their entrance when new range data lands, not on the click.
                <div
                  key={`${bodyQuery.layout}-${bodyQuery.from}-${bodyQuery.year}-${bodyQuery.month}`}
                  className="animate-in fade-in-0 duration-slow ease-out-quart"
                >
                  {bodyQuery.layout === 'list' ? (
                    <ScheduleBody {...scheduleProps} appointments={visible} phrase={phonePhrase} />
                  ) : (
                    <>
                      <div className="hidden md:block">
                        <ScheduleBody
                          {...scheduleProps}
                          appointments={desktopVisible}
                          phrase={desktopPhrase}
                          calendar={
                            isMonth || desktopVisible.length > 0 ? (
                              <div className="p-4">
                                {isMonth ? (
                                  <AppointmentsCalendar
                                    appointments={visible}
                                    month={bodyQuery.month}
                                    year={bodyQuery.year}
                                    businessDate={businessDate}
                                  />
                                ) : (
                                  <AppointmentsWeekGrid
                                    appointments={desktopVisible}
                                    from={resolveWeekStart(bodyQuery.from, businessDate)}
                                    businessDate={businessDate}
                                  />
                                )}
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
              )}

              {!isMonth && !isBodyLoading && canShowMore(bodyQuery) ? (
                <ShowMoreFooter rangeState={rangeState} isPhoneOnly={isWeek} onShowMore={handleShowMore} />
              ) : null}
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
