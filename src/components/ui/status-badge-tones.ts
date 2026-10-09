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
