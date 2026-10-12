import { addDays, addWeeks, endOfMonth, format, isValid, parse, startOfWeek } from 'date-fns'

// The date range the appointments screen shows: a week start (Sunday) for the Week and List
// layouts, a month for the Month layout. Dates are business dates (yyyy-MM-dd) handled as local
// calendar days, never instants. Pure, like overview.ts.

export const LAYOUTS = ['week', 'month', 'list'] as const

export type Layout = (typeof LAYOUTS)[number]

const DATE_FORMAT = 'yyyy-MM-dd'
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DAYS_IN_WEEK = 7
export const MIN_YEAR = 2000
export const MAX_YEAR = 2100
// The list reads this many weeks at a time; Show more adds another chunk, up to the cap.
export const LIST_WEEKS_STEP = 8
const MAX_LIST_WEEKS = 104
const WEEKS_PATTERN = /^\d{1,3}$/

// What the range-aware parts of the query look like here, so this module needs nothing from overview.ts.
type RangeQuery = { layout: Layout; from: string | null; weeks: number; month: number; year: number }

export type DateRange = { from: string; to: string | null }

export type RangeCopy = { heading: string; phrase: string }

function toDay(date: string): Date {
  return parse(date, DATE_FORMAT, new Date())
}

function toDate(day: Date): string {
  return format(day, DATE_FORMAT)
}

// The Sunday that starts the week containing the date.
export function getWeekStart(date: string): string {
  return toDate(startOfWeek(toDay(date)))
}

// A strict yyyy-MM-dd date, or null for anything else (including Feb 30).
export function parseDate(value: string | undefined): string | null {
  if (value === undefined || !DATE_PATTERN.test(value)) return null

  const day = toDay(value)
  const isInRange = day.getFullYear() >= MIN_YEAR && day.getFullYear() <= MAX_YEAR
  return isValid(day) && isInRange && toDate(day) === value ? value : null
}

// null stands for the business week, so the URL leaves it out and a bookmark follows today.
function toFrom(weekStart: string, businessDate: string): string | null {
  return weekStart === getWeekStart(businessDate) ? null : weekStart
}

export function parseFrom(value: string | undefined, businessDate: string): string | null {
  const date = parseDate(value)
  return date === null ? null : toFrom(getWeekStart(date), businessDate)
}

// A whole number of chunks within the cap, so a URL can't ask for an unbounded read.
export function parseWeeks(value: string | undefined): number {
  const weeks = value !== undefined && WEEKS_PATTERN.test(value) ? Number(value) : NaN
  const isValidExtent = weeks >= LIST_WEEKS_STEP && weeks <= MAX_LIST_WEEKS && weeks % LIST_WEEKS_STEP === 0
  return isValidExtent ? weeks : LIST_WEEKS_STEP
}

export function canShowMore(query: RangeQuery): boolean {
  return query.weeks < MAX_LIST_WEEKS
}

export function showMore<Query extends RangeQuery>(query: Query): Query {
  return { ...query, weeks: Math.min(query.weeks + LIST_WEEKS_STEP, MAX_LIST_WEEKS) }
}

export function resolveWeekStart(from: string | null, businessDate: string): string {
  return from ?? getWeekStart(businessDate)
}

function businessMonthOf(businessDate: string): { month: number; year: number } {
  const [year, month] = businessDate.split('-').map(Number)
  return { month, year }
}

// Prev and Next in the Week and List layouts.
export function stepWeek<Query extends RangeQuery>(query: Query, offset: number, businessDate: string): Query {
  const target = toDate(addWeeks(toDay(resolveWeekStart(query.from, businessDate)), offset))
  return { ...query, from: toFrom(target, businessDate) }
}

export function toCurrentWeek<Query extends RangeQuery>(query: Query): Query {
  return { ...query, from: null }
}

// Week and List share the week start. Leaving them opens the month containing it (the business month
// from the business week); coming back from a month opens the week containing its 1st, or the business
// week in the business month.
export function switchLayout<Query extends RangeQuery>(query: Query, layout: Layout, businessDate: string): Query {
  if (layout === query.layout) return query

  const businessMonth = businessMonthOf(businessDate)
  let next: Query
  if (layout === 'month') {
    const weekStart = query.from === null ? null : toDay(query.from)
    const month = weekStart === null ? businessMonth : { month: weekStart.getMonth() + 1, year: weekStart.getFullYear() }
    next = { ...query, ...month, layout, from: null, weeks: LIST_WEEKS_STEP }
  } else if (query.layout === 'month') {
    const isBusinessMonth = query.month === businessMonth.month && query.year === businessMonth.year
    const firstWeek = getWeekStart(toDate(new Date(query.year, query.month - 1, 1)))
    next = { ...query, ...businessMonth, layout, from: isBusinessMonth ? null : toFrom(firstWeek, businessDate) }
  } else {
    next = { ...query, layout }
  }
  return next
}

export function getMonthRange(month: number, year: number): DateRange {
  const firstDay = new Date(year, month - 1, 1)
  return { from: toDate(firstDay), to: toDate(endOfMonth(firstDay)) }
}

function getRangeEnd(weekStart: string, weeks: number): string {
  return toDate(addDays(toDay(weekStart), weeks * DAYS_IN_WEEK - 1))
}

export function getWeekEnd(weekStart: string): string {
  return getRangeEnd(weekStart, 1)
}

// The range the server reads. Week reads the list's extent too: one response serves both widths, and
// phones always show the list.
export function getReadRange(query: RangeQuery, businessDate: string): DateRange {
  const weekStart = resolveWeekStart(query.from, businessDate)
  return query.layout === 'month'
    ? getMonthRange(query.month, query.year)
    : { from: weekStart, to: getRangeEnd(weekStart, query.weeks) }
}

// "Oct 11", or "Jan 3, 2027" outside the business year.
function shortDate(day: Date, businessYear: number): string {
  return format(day, day.getFullYear() === businessYear ? 'MMM d' : 'MMM d, yyyy')
}

// "Oct 11 – 17, 2026", "Sep 27 – Oct 3, 2026" or "Dec 27, 2026 – Jan 2, 2027".
function weekHeading(start: Date, end: Date): string {
  const isSameYear = start.getFullYear() === end.getFullYear()
  const isSameMonth = isSameYear && start.getMonth() === end.getMonth()
  const startLabel = format(start, isSameYear ? 'MMM d' : 'MMM d, yyyy')
  const endLabel = format(end, isSameMonth ? 'd, yyyy' : 'MMM d, yyyy')
  return `${startLabel} – ${endLabel}`
}

// The heading and the phrase empty states use ("No appointments {phrase}") for a layout's range.
export function getRangeCopy(query: RangeQuery, businessDate: string, layout: Layout = query.layout): RangeCopy {
  const { year: businessYear } = businessMonthOf(businessDate)
  const start = toDay(resolveWeekStart(query.from, businessDate))

  let copy: RangeCopy
  if (layout === 'month') {
    const month = format(new Date(query.year, query.month - 1, 1), 'MMMM yyyy')
    copy = { heading: month, phrase: `in ${month}` }
  } else if (layout === 'week') {
    copy = {
      heading: weekHeading(start, toDay(getWeekEnd(toDate(start)))),
      phrase: `in the week of ${shortDate(start, businessYear)}`,
    }
  } else {
    const end = toDay(getRangeEnd(toDate(start), query.weeks))
    copy = {
      heading: `From ${shortDate(start, businessYear)}`,
      phrase: `from ${shortDate(start, businessYear)} to ${shortDate(end, businessYear)}`,
    }
  }
  return copy
}
