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
