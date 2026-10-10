import type { InvoiceStatus } from './view.ts'

export type InvoiceAction =
  | 'edit'
  | 'issue'
  | 'archive'
  | 'unarchive'
  | 'void'
  | 'recordPayment'
  | 'editPayment'
  | 'undoPayment'

// Decision #62. An issued invoice is still owed, so it can't be archived; a draft is archived
// rather than voided.
const ACTIONS_BY_STATUS: Record<InvoiceStatus, readonly InvoiceAction[]> = {
  draft: ['edit', 'issue', 'archive'],
  issued: ['recordPayment', 'void'],
  paid: ['editPayment', 'undoPayment', 'void', 'archive'],
  void: ['archive'],
}

// An archived invoice is read-only whatever its status.
const ARCHIVED_ACTIONS: readonly InvoiceAction[] = ['unarchive']

export function allowedActions(invoice: { status: InvoiceStatus; is_archived: boolean }): ReadonlySet<InvoiceAction> {
  return new Set(invoice.is_archived ? ARCHIVED_ACTIONS : ACTIONS_BY_STATUS[invoice.status])
}
