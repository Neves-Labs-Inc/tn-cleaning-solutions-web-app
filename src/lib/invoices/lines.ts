import type { AppointmentStatus } from '../appointments/lifecycle.ts'
import type { LivePrice } from '../pricing/index.ts'
import type { InvoiceStatus, LineState } from './view.ts'

export type LineFacts = { billed_amount_cents: number | null; cancelled_at: string | null }
export type VisitFacts = { status: AppointmentStatus; live: LivePrice }
export type InvoiceFacts = { status: InvoiceStatus }
export type LineEntry = { line: LineFacts; visit: VisitFacts }

// Only a draft charges the Live price; once issued, the line's Billed amount is what counts.
export function lineState(line: LineFacts, visit: VisitFacts, invoice: InvoiceFacts): LineState {
  if (line.cancelled_at !== null) return 'cancelled'
  if (invoice.status === 'draft' && visit.live.source === 'unpriced') return 'unpriced'

  const isUpcoming = visit.status !== 'completed' && visit.status !== 'cancelled'
  return isUpcoming ? 'upcoming' : 'ok'
}

// An Unpriced visit is never billed; it counts as $0 until it has a price.
export function lineAmountCents(line: LineFacts, visit: VisitFacts, invoice: InvoiceFacts): number {
  if (line.cancelled_at !== null) return 0
  if (invoice.status !== 'draft') return line.billed_amount_cents ?? 0

  return visit.live.source === 'unpriced' ? 0 : visit.live.amount_cents
}

const DRAFT: InvoiceFacts = { status: 'draft' }

export function draftTotalCents(entries: LineEntry[]): number {
  return entries.reduce((total, { line, visit }) => total + lineAmountCents(line, visit, DRAFT), 0)
}

export function hasUnpricedLine(entries: LineEntry[]): boolean {
  return entries.some(({ line, visit }) => lineState(line, visit, DRAFT) === 'unpriced')
}

// Pills for a visit that isn't on a draft yet. Unpriced and Upcoming can both apply, so this is a
// list; lineState picks one.
export function claimableStates(visit: VisitFacts): LineState[] {
  const states: LineState[] = []
  if (visit.live.source === 'unpriced') {
    states.push('unpriced')
  }
  if (visit.status !== 'completed' && visit.status !== 'cancelled') {
    states.push('upcoming')
  }
  return states
}

type DatedVisit = { id: string; scheduled_date: string; scheduled_start_time: string }

function byDateThenTime(a: DatedVisit, b: DatedVisit): number {
  return a.scheduled_date.localeCompare(b.scheduled_date) || a.scheduled_start_time.localeCompare(b.scheduled_start_time)
}

// Past and today oldest first, Upcoming soonest first: both are ascending, so the oldest unbilled work
// leads and the next visit leads the future.
export function groupVisitsByDate<T extends DatedVisit>(
  visits: T[],
  businessDate: string
): { past: T[]; upcoming: T[] } {
  const sorted = [...visits].sort(byDateThenTime)
  return {
    past: sorted.filter((visit) => visit.scheduled_date <= businessDate),
    upcoming: sorted.filter((visit) => visit.scheduled_date > businessDate),
  }
}

// Visits up to today start checked; future visits are listed but left for the admin to opt into.
export function defaultSelectedIds(visits: DatedVisit[], businessDate: string): Set<string> {
  return new Set(visits.filter((visit) => visit.scheduled_date <= businessDate).map((visit) => visit.id))
}
