import type { NeedsBillingAppointment } from '../invoices/payment-state-queries.ts'
import type { PaymentClaim, PaymentState } from '../invoices/payment-state.ts'
import type { NeedsCompletionAppointment } from './needs-completion.ts'
import { getGraceEnd } from '../time-sheets/session-view.ts'
import {
  appointmentsFilterEntries,
  matchesFilters,
  parseAppointmentsFilter,
  type AppointmentsFilter,
  type AppointmentsFilterParams,
} from './filters.ts'
import type { AppointmentStatus } from './lifecycle.ts'
import { LAYOUTS, LIST_WEEKS_STEP, MAX_YEAR, MIN_YEAR, parseFrom, parseWeeks, type Layout } from './range.ts'

// The appointments screen: its URL state, overview tiles and views. Pure, so node:test, the server
// page and client components can all load it.

// One of the visible range's appointments.
export type ScheduleAppointment = {
  id: string
  clientId: string
  clientName: string
  jobId: string
  jobName: string
  scheduledDate: string
  startTime: string
  endTime: string
  status: AppointmentStatus
  // The displayed price: the Billed amount, else the Live price; null when Unpriced.
  priceCents: number | null
  paymentState: PaymentState | null
  claim: PaymentClaim | null
  // Still scheduled an hour past its end; computed on the server so every render agrees.
  isNotClocked: boolean
}

// Scheduled means nobody has a counted clock-in, so no clock read is needed. Display only.
export function isNotClocked(
  appointment: Pick<ScheduleAppointment, 'status' | 'scheduledDate' | 'endTime'>,
  now: Date
): boolean {
  if (appointment.status !== 'scheduled') return false

  // An unreadable date or time reads as "not flagged": a render must never throw over a label.
  try {
    return now.getTime() > getGraceEnd(appointment.scheduledDate, appointment.endTime).getTime()
  } catch {
    return false
  }
}

// Unpriced appointments count toward count and unpricedCount, never the money.
export type TileTotal = { totalCents: number; count: number; unpricedCount: number }

export type Overview = { needsCompletion: TileTotal; needsBilling: TileTotal; billed: TileTotal; paid: TileTotal }

export type AppointmentsView = 'schedule' | 'needs-completion' | 'needs-billing' | 'billed' | 'paid'

export type AppointmentsQuery = AppointmentsFilter & {
  view: AppointmentsView
  layout: Layout
  // The Sunday starting the Week and List range; null for the business week.
  from: string | null
  // How many weeks the list shows from `from`; Show more extends it.
  weeks: number
  // The Month layout's month.
  month: number
  year: number
  showCancelled: boolean
}

type SearchParam = string | string[] | undefined

type AppointmentsSearchParams = AppointmentsFilterParams & {
  view?: SearchParam
  layout?: SearchParam
  from?: SearchParam
  weeks?: SearchParam
  month?: SearchParam
  year?: SearchParam
  showCancelled?: SearchParam
}

const APPOINTMENTS_PATH = '/solutions/appointments'
const FILTERED_VIEWS: AppointmentsView[] = ['needs-completion', 'needs-billing', 'billed', 'paid']
const MONTHS_IN_YEAR = 12

// A repeated param is ambiguous, so it counts as absent.
function single(value: SearchParam): string | undefined {
  return Array.isArray(value) ? undefined : value
}

function parseIntegerIn(value: string | undefined, min: number, max: number, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback
}

function parseView(value: string | undefined): AppointmentsView {
  return FILTERED_VIEWS.find((view) => view === value) ?? 'schedule'
}

function parseLayout(value: string | undefined): Layout {
  return LAYOUTS.find((layout) => layout === value) ?? 'week'
}

// businessDate (yyyy-MM-dd) picks the week and the month when the URL names none.
export function parseAppointmentsQuery(
  params: AppointmentsSearchParams,
  businessDate: string
): AppointmentsQuery {
  const [businessYear, businessMonth] = businessDate.split('-').map(Number)
  return {
    view: parseView(single(params.view)),
    layout: parseLayout(single(params.layout)),
    from: parseFrom(single(params.from), businessDate),
    weeks: parseWeeks(single(params.weeks)),
    month: parseIntegerIn(single(params.month), 1, MONTHS_IN_YEAR, businessMonth),
    year: parseIntegerIn(single(params.year), MIN_YEAR, MAX_YEAR, businessYear),
    showCancelled: single(params.showCancelled) === 'true',
    ...parseAppointmentsFilter(params),
  }
}

// Defaults are left out: the schedule, the week layout, the business week and the first 8 weeks. Each
// layout keeps only its own range: the week start and extent, or the month.
export function appointmentsHref(query: AppointmentsQuery): string {
  const params = new URLSearchParams()
  if (query.view !== 'schedule') params.set('view', query.view)
  if (query.layout !== 'week') params.set('layout', query.layout)
  if (query.layout === 'month') {
    params.set('month', String(query.month))
    params.set('year', String(query.year))
  } else {
    if (query.from !== null) params.set('from', query.from)
    if (query.weeks !== LIST_WEEKS_STEP) params.set('weeks', String(query.weeks))
  }
  if (query.showCancelled) params.set('showCancelled', 'true')
  for (const [name, value] of appointmentsFilterEntries(query)) params.set(name, value)
  const search = params.toString()
  return search === '' ? APPOINTMENTS_PATH : `${APPOINTMENTS_PATH}?${search}`
}

// A tile's target: its view, or the full schedule when that view is already showing.
export function toggleView(query: AppointmentsQuery, view: AppointmentsView): AppointmentsQuery {
  return { ...query, view: query.view === view ? 'schedule' : view }
}

export function totalPrices(prices: Array<number | null>): TileTotal {
  return prices.reduce<TileTotal>(
    (total, cents) => ({
      totalCents: total.totalCents + (cents ?? 0),
      count: total.count + 1,
      unpricedCount: total.unpricedCount + (cents === null ? 1 : 0),
    }),
    { totalCents: 0, count: 0, unpricedCount: 0 }
  )
}

function totalInState(appointments: ScheduleAppointment[], state: PaymentState): TileTotal {
  return totalPrices(
    appointments
      .filter((appointment) => appointment.paymentState === state)
      .map((appointment) => appointment.priceCents)
  )
}

// Needs billing and Needs completion cover every month; Billed and Paid cover the business month,
// whatever range the screen shows.
export function summarizeOverview(
  needsBilling: NeedsBillingAppointment[],
  monthAppointments: ScheduleAppointment[],
  needsCompletion: NeedsCompletionAppointment[]
): Overview {
  return {
    needsCompletion: totalPrices(needsCompletion.map((appointment) => appointment.priceCents)),
    needsBilling: totalPrices(needsBilling.map((appointment) => appointment.livePriceCents)),
    billed: totalInState(monthAppointments, 'billed'),
    paid: totalInState(monthAppointments, 'paid'),
  }
}

export type TileScope = 'all months' | 'this month'

// "14 appointments · all months · 2 Unpriced". Only the all-months tiles name their Unpriced ones.
export function tileCaption(count: number, scope: TileScope, unpricedCount: number = 0): string {
  const noun = count === 1 ? 'appointment' : 'appointments'
  const unpriced = unpricedCount > 0 ? ` · ${unpricedCount} Unpriced` : ''
  return `${count} ${noun} · ${scope}${unpriced}`
}

// The range's appointments a schedule view shows, narrowed by the filters. Needs billing and Needs
// completion list every month instead, so they show none of these.
export function appointmentsInView(
  rangeAppointments: ScheduleAppointment[],
  query: AppointmentsQuery
): ScheduleAppointment[] {
  const { view, showCancelled } = query
  if (view === 'needs-billing' || view === 'needs-completion') return []

  return rangeAppointments.filter(
    (appointment) =>
      matchesFilters(appointment, query, showCancelled) &&
      (view === 'schedule' || appointment.paymentState === view)
  )
}

// A tile click whose navigation may still be in flight, and the URL showing when this was last synced.
export type PendingTile = { seenHref: string; target: AppointmentsQuery | null }

export function createPendingTile(query: AppointmentsQuery, target: AppointmentsQuery | null = null): PendingTile {
  return { seenHref: appointmentsHref(query), target }
}

// Any URL change spends the tile's navigation, landed or abandoned, so a later return to the URL it
// was clicked from (Back, "Show all") never revives it. Returns the same object when nothing changed.
export function syncPendingTile(pending: PendingTile, query: AppointmentsQuery): PendingTile {
  const href = appointmentsHref(query)
  if (pending.seenHref === href) return pending

  return { seenHref: href, target: null }
}

// What Prev, Next, This week, the layout toggle and Show cancelled build on: a pending tile's view, so a push made before the tile's
// navigation lands keeps its ?view=; otherwise the URL.
export function getNavQuery(pending: PendingTile, query: AppointmentsQuery): AppointmentsQuery {
  return syncPendingTile(pending, query).target ?? query
}

// Needs billing's checked rows, read through the current list so a row that left it after a refresh
// drops out. Rows are picked for one client at a time; lockedClientId is that client, null when none.
export type BillingSelection = { selected: NeedsBillingAppointment[]; lockedClientId: string | null }

export function resolveBillingSelection(
  appointments: NeedsBillingAppointment[],
  selectedIds: string[]
): BillingSelection {
  const selected = appointments.filter((appointment) => selectedIds.includes(appointment.id))
  return { selected, lockedClientId: selected[0]?.clientId ?? null }
}

export function isLockedRow(clientId: string, lockedClientId: string | null): boolean {
  return lockedClientId !== null && clientId !== lockedClientId
}
