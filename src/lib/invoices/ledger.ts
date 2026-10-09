import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/types/database'
import { loadDraftLines, type DraftLine } from './draft-lines.ts'
import { messageFor, toLedgerError, type LedgerError, type LedgerErrorCode, type PostgrestLikeError } from './errors.ts'
import { hasUnpricedLine } from './lines.ts'
import { normalizePaymentMethodName } from './view.ts'

// Server-only: it takes the user-session client, so every write runs as the signed-in admin and the
// SQL functions check the role themselves (ADR 0001). It never sees a service-role client.

export type LedgerResult<T> = { ok: true; data: T } | ({ ok: false } & LedgerError)

export type DraftInput = { dueDate: string | null; notes: string | null }
export type CreateDraftInput = DraftInput & { clientId: string; appointmentIds: string[] }
// The difference the admin made against what the page loaded, so a visit that joined an Automatic
// draft meanwhile isn't dropped. SQL overwrites due date and notes, so send the current values.
export type UpdateDraftInput = DraftInput & { addAppointmentIds: string[]; removeAppointmentIds: string[] }
export type PaymentInput = { paidDate: string | null; method: string; reference: string | null }
export type PaymentMethod = { id: string; name: string; is_hidden: boolean; sort_order: number }
export type BulkIssueOutcome = {
  issued: string[]
  skipped: Array<{ id: string; code: LedgerErrorCode; message: string }>
}

type Logger = { warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void }
type BilledLine = {
  appointment_id: string
  billed_amount_cents: number
  billed_rate_cents: number | null
  billed_minutes: number | null
}

const UNIQUE_VIOLATION = '23505'

function refusal(code: Exclude<LedgerErrorCode, 'unknown'>): LedgerError {
  return { code, message: messageFor(code) }
}

// No line column holds the crew size, so a multi-Cleaner line freezes no rate or minutes: rate ×
// minutes would not add up to its Billed amount.
function toBilledLine({ appointment_id, visit }: DraftLine): BilledLine[] {
  const { live } = visit
  if (live.source === 'unpriced') return []

  const isSolo = live.headcount === 1
  return [
    {
      appointment_id,
      billed_amount_cents: live.amount_cents,
      billed_rate_cents: isSolo ? live.rate_cents : null,
      billed_minutes: isSolo ? live.minutes : null,
    },
  ]
}

function asPostgrestLike(thrown: unknown): PostgrestLikeError {
  const hasMessage = typeof thrown === 'object' && thrown !== null && 'message' in thrown
  return hasMessage ? (thrown as PostgrestLikeError) : { message: String(thrown) }
}

export class InvoiceLedger {
  private readonly db: SupabaseClient<Database>
  private readonly logger: Logger

  constructor(db: SupabaseClient<Database>, logger: Logger = console) {
    this.db = db
    this.logger = logger
  }

  async createDraft(input: CreateDraftInput): Promise<LedgerResult<{ id: string }>> {
    const { data, error } = await this.db.rpc('invoice_create_draft', {
      p_client_id: input.clientId,
      p_appointment_ids: input.appointmentIds,
      p_due_date: input.dueDate,
      p_notes: input.notes,
    })
    return this.settle('createDraft', { clientId: input.clientId }, error, { id: data ?? '' })
  }

  // A draft left with no lines is deleted and the call still succeeds; isDeleted tells the caller
  // there is no draft page to go back to.
  async updateDraft(invoiceId: string, input: UpdateDraftInput): Promise<LedgerResult<{ isDeleted: boolean }>> {
    const { error } = await this.db.rpc('invoice_update_draft', {
      p_invoice_id: invoiceId,
      p_add_appointment_ids: input.addAppointmentIds,
      p_remove_appointment_ids: input.removeAppointmentIds,
      p_due_date: input.dueDate,
      p_notes: input.notes,
    })
    if (error) return this.fail('updateDraft', { invoiceId }, toLedgerError(error))

    const { data, error: readError } = await this.db.from('invoices').select('id').eq('id', invoiceId).maybeSingle()
    return this.settle('updateDraft', { invoiceId }, readError, { isDeleted: data === null })
  }

  async issue(invoiceId: string, dueDate: string | null): Promise<LedgerResult<{ invoiceNumber: string }>> {
    const first = await this.issueOnce(invoiceId, dueDate)
    if (first.ok || first.code !== 'draft_changed') return first

    // A completion or an edit changed the lines between our read and SQL's lock; one fresh read
    // settles it. A second change in that window is surfaced rather than chased.
    return this.issueOnce(invoiceId, dueDate)
  }

  // Unpriced drafts are skipped like any refusal; the batch never stops on one draft.
  async bulkIssue(invoiceIds: string[], dueDate: string | null): Promise<LedgerResult<BulkIssueOutcome>> {
    const outcome: BulkIssueOutcome = { issued: [], skipped: [] }

    for (const id of new Set(invoiceIds)) {
      const result = await this.issue(id, dueDate)
      if (result.ok) {
        outcome.issued.push(id)
      } else {
        outcome.skipped.push({ id, code: result.code, message: result.message })
      }
    }

    return { ok: true, data: outcome }
  }

  async voidInvoice(invoiceId: string): Promise<LedgerResult<null>> {
    const { error } = await this.db.rpc('invoice_void', { p_invoice_id: invoiceId })
    return this.settle('voidInvoice', { invoiceId }, error, null)
  }

  async recordPayment(invoiceId: string, payment: PaymentInput): Promise<LedgerResult<null>> {
    const { error } = await this.db.rpc('invoice_record_payment', {
      p_invoice_id: invoiceId,
      p_paid_date: payment.paidDate,
      p_method: payment.method,
      p_reference: payment.reference,
    })
    return this.settle('recordPayment', { invoiceId }, error, null)
  }

  async updatePayment(invoiceId: string, payment: PaymentInput): Promise<LedgerResult<null>> {
    const { error } = await this.db.rpc('invoice_update_payment', {
      p_invoice_id: invoiceId,
      p_paid_date: payment.paidDate,
      p_method: payment.method,
      p_reference: payment.reference,
    })
    return this.settle('updatePayment', { invoiceId }, error, null)
  }

  async undoPayment(invoiceId: string): Promise<LedgerResult<null>> {
    const { error } = await this.db.rpc('invoice_undo_payment', { p_invoice_id: invoiceId })
    return this.settle('undoPayment', { invoiceId }, error, null)
  }

  async archive(invoiceId: string): Promise<LedgerResult<null>> {
    const { error } = await this.db.rpc('invoice_archive', { p_invoice_id: invoiceId })
    return this.settle('archive', { invoiceId }, error, null)
  }

  async unarchive(invoiceId: string): Promise<LedgerResult<null>> {
    const { error } = await this.db.rpc('invoice_unarchive', { p_invoice_id: invoiceId })
    return this.settle('unarchive', { invoiceId }, error, null)
  }

  async setAutomaticInvoicing(clientId: string, isOn: boolean): Promise<LedgerResult<null>> {
    const { data, error } = await this.db
      .from('clients')
      .update({ automatic_invoicing: isOn })
      .eq('id', clientId)
      .select('id')
    return this.settleRowWrite('setAutomaticInvoicing', { clientId }, error, data)
  }

  async listPaymentMethods(): Promise<LedgerResult<PaymentMethod[]>> {
    const { data, error } = await this.db
      .from('payment_methods')
      .select('id, name, is_hidden, sort_order')
      .order('sort_order', { ascending: true })
    return this.settle('listPaymentMethods', {}, error, data ?? [])
  }

  // Saved the way invoice_record_payment saves a typed method: trimmed, whitespace runs collapsed.
  async renamePaymentMethod(methodId: string, name: string): Promise<LedgerResult<null>> {
    const normalized = normalizePaymentMethodName(name)
    if (!normalized) return this.fail('renamePaymentMethod', { methodId }, refusal('method_name_required'))

    const { data, error } = await this.db
      .from('payment_methods')
      .update({ name: normalized })
      .eq('id', methodId)
      .select('id')

    // payment_methods_name_lower_key makes names unique ignoring case.
    if (error?.code === UNIQUE_VIOLATION) {
      return this.fail('renamePaymentMethod', { methodId, name: normalized }, refusal('method_name_taken'))
    }
    return this.settleRowWrite('renamePaymentMethod', { methodId }, error, data)
  }

  async setPaymentMethodHidden(methodId: string, isHidden: boolean): Promise<LedgerResult<null>> {
    const { data, error } = await this.db
      .from('payment_methods')
      .update({ is_hidden: isHidden })
      .eq('id', methodId)
      .select('id')
    return this.settleRowWrite('setPaymentMethodHidden', { methodId }, error, data)
  }

  private async issueOnce(invoiceId: string, dueDate: string | null): Promise<LedgerResult<{ invoiceNumber: string }>> {
    let lines: DraftLine[]
    try {
      lines = (await loadDraftLines(this.db, [invoiceId])).get(invoiceId) ?? []
    } catch (thrown) {
      // Returned, not thrown, so one failed read doesn't abort a bulk issue halfway.
      return this.fail('issue', { invoiceId }, toLedgerError(asPostgrestLike(thrown)))
    }

    // Refused here so SQL is never asked to bill an Unpriced visit at all.
    if (hasUnpricedLine(lines)) return this.fail('issue', { invoiceId }, refusal('unpriced_line'))

    const { data, error } = await this.db.rpc('invoice_issue', {
      p_invoice_id: invoiceId,
      p_lines: lines.flatMap(toBilledLine),
      p_due_date: dueDate,
    })
    return this.settle('issue', { invoiceId }, error, { invoiceNumber: data ?? '' })
  }

  private settle<T>(
    operation: string,
    context: Record<string, unknown>,
    error: PostgrestLikeError | null,
    value: T
  ): LedgerResult<T> {
    if (error) return this.fail(operation, context, toLedgerError(error))
    return { ok: true, data: value }
  }

  // RLS turns a write the session can't see into zero rows, not an error, so an empty result is a miss.
  private settleRowWrite(
    operation: string,
    context: Record<string, unknown>,
    error: PostgrestLikeError | null,
    rows: unknown[] | null
  ): LedgerResult<null> {
    if (error) return this.fail(operation, context, toLedgerError(error))
    if (!rows || rows.length === 0) return this.fail(operation, context, refusal('not_found'))
    return { ok: true, data: null }
  }

  private fail(operation: string, context: Record<string, unknown>, error: LedgerError): { ok: false } & LedgerError {
    // A refusal is the caller's to fix (4xx); an unknown error is ours (5xx).
    const level = error.code === 'unknown' ? 'error' : 'warn'
    this.logger[level](`Invoice ledger ${operation} failed`, { ...context, code: error.code, message: error.message })
    return { ok: false, ...error }
  }
}
