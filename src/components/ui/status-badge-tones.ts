// Plain .ts so node:test can load it; status-badge.tsx re-exports these, keeping
// the status-to-tone mapping next to the component (DESIGN.md §3.2, §10).
import type { InvoiceEffectiveStatus, LineState } from '../../lib/invoices/view'
import type { StatusBadgeSpec } from './status-badge'

const INVOICE_STATUS_BADGES: Record<InvoiceEffectiveStatus, StatusBadgeSpec> = {
  draft: { tone: 'neutral', label: 'Draft' },
  issued: { tone: 'info', label: 'Issued' },
  overdue: { tone: 'warning', label: 'Overdue' },
  paid: { tone: 'success', label: 'Paid' },
  void: { tone: 'danger', label: 'Void' },
}

const LINE_STATE_BADGES: Record<LineState, StatusBadgeSpec | null> = {
  ok: null,
  unpriced: { tone: 'warning', label: 'Unpriced' },
  upcoming: { tone: 'info', label: 'Upcoming' },
  cancelled: { tone: 'danger', label: 'Cancelled' },
}

export function invoiceStatusBadge(status: InvoiceEffectiveStatus): StatusBadgeSpec {
  return INVOICE_STATUS_BADGES[status]
}

export function lineStateBadge(state: LineState): StatusBadgeSpec | null {
  return LINE_STATE_BADGES[state]
}

type InvoiceFlagRow = {
  effective_status: InvoiceEffectiveStatus
  is_automatic: boolean
  is_archived: boolean
  has_unpriced?: boolean
}

// The pills an invoice row wears, in fixed order: status, Automatic, Archived, Unpriced. Every
// invoice screen renders these through InvoiceBadges, so no page builds its own.
export function invoiceFlagBadges(row: InvoiceFlagRow): StatusBadgeSpec[] {
  const badges: Array<StatusBadgeSpec | null> = [
    invoiceStatusBadge(row.effective_status),
    row.is_automatic ? { tone: 'neutral', label: 'Automatic' } : null,
    row.is_archived ? { tone: 'neutral', label: 'Archived' } : null,
    row.has_unpriced ? lineStateBadge('unpriced') : null,
  ]
  return badges.filter((badge) => badge !== null)
}
