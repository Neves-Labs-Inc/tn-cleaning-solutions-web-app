// Mirrors the CASE block of invoice_error() in supabase/migrations/20261009130000_invoicing_schema.sql;
// tests/invoices/errors.test.ts fails when the two drift.
export const INVOICE_ERROR_CODES = [
  'not_admin',
  'invoice_not_found',
  'invalid_status',
  'archived_invoice',
  'draft_changed',
  'unpriced_line',
  'empty_lines',
  'due_before_issue',
  'paid_date_future',
  'method_required',
  'visit_claimed',
  'visit_cancelled',
  'visit_other_client',
  'invoice_paid',
  'invoice_issued',
] as const

// Refusals with no SQL function behind them: form input the actions reject, and the plain table
// writes the ledger makes itself (clients, payment_methods, a draft line's price).
export const LEDGER_ONLY_CODES = [
  'invalid_input',
  'not_found',
  'method_name_required',
  'method_name_taken',
  'not_draft',
  'line_not_on_draft',
] as const

export type InvoiceErrorCode = (typeof INVOICE_ERROR_CODES)[number]
export type LedgerErrorCode = InvoiceErrorCode | (typeof LEDGER_ONLY_CODES)[number] | 'unknown'
export type LedgerError = { code: LedgerErrorCode; message: string }

// The shape PostgREST returns: invoice_error puts the code in DETAIL, which arrives as `details`.
export type PostgrestLikeError = { message: string; details?: string | null; hint?: string | null; code?: string }

const MESSAGES: Record<Exclude<LedgerErrorCode, 'unknown'>, string> = {
  not_admin: 'Only an admin can change invoices.',
  invoice_not_found: 'Invoice not found.',
  invalid_status: "This invoice can't do that in its current status.",
  archived_invoice: 'This invoice is archived. Unarchive it first.',
  draft_changed: 'The draft changed since you opened it. Reload it and try again.',
  unpriced_line: 'Every line needs a price before the invoice can be issued.',
  empty_lines: 'Pick at least one appointment.',
  due_before_issue: "The due date can't be before the issue date.",
  paid_date_future: "The paid date can't be in the future.",
  method_required: 'Choose how the invoice was paid.',
  visit_claimed: 'An appointment is already on another invoice.',
  visit_cancelled: "A cancelled appointment can't be invoiced.",
  visit_other_client: "Every appointment must belong to the invoice's client.",
  invoice_paid: 'This appointment is on a paid invoice. Void the invoice first.',
  invoice_issued: 'This appointment is on an issued invoice. Void the invoice first.',
  invalid_input: 'Please check the form and try again.',
  not_found: 'Not found.',
  method_name_required: 'Enter a name for the payment method.',
  method_name_taken: 'A payment method with that name already exists.',
  not_draft: 'This invoice is no longer a draft. Refresh and try again.',
  line_not_on_draft: 'This appointment is no longer on this draft. Refresh and try again.',
}

export function messageFor(code: Exclude<LedgerErrorCode, 'unknown'>): string {
  return MESSAGES[code]
}

export function isInvoiceErrorCode(value: string | null | undefined): value is InvoiceErrorCode {
  return (INVOICE_ERROR_CODES as readonly (string | null | undefined)[]).includes(value)
}

// Anything that isn't an invoice_error refusal keeps its raw message, so the cause is never lost.
export function toLedgerError(error: PostgrestLikeError): LedgerError {
  const { details } = error
  return isInvoiceErrorCode(details)
    ? { code: details, message: messageFor(details) }
    : { code: 'unknown', message: error.message }
}
