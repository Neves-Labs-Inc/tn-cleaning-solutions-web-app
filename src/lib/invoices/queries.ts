import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { AppointmentStatus } from '@/lib/appointments/lifecycle'
import { APPOINTMENT_PRICE_COLUMNS, type LivePrice, type PriceableAppointment } from '@/lib/pricing'
import type { Database, Views } from '@/types/database'
import { priceAppointmentsInBatches, readAllPages } from './batch'
import { splitClaimable, type PickerAppointment } from './appointment-picker'
import { scopeToClient } from './client-scope'
import type { ClientInvoice } from './client-invoices'
import { loadDraftLines } from './draft-lines'
import { draftTotalCents, hasUnpricedLine, lineAmountCents, lineState } from './lines'
import { LIVE_CLAIM_EMBED, unbilledQuery } from './unbilled-query'
import {
  type InvoiceViewRow,
  type LineState,
  type OpenDraft,
  type ReceivablesTotals,
  type UnbilledVisit,
} from './view'

// The read shapes the invoice screens need, so pages never rebuild these joins. Read failures throw
// to the route's error boundary. Every function takes the user-session client.
//
// Admin pages only: these read client phone and email, and the clients RLS lets a Cleaner read those
// too, so call them from under the (admin) route group, never from a Cleaner page.

type Db = SupabaseClient<Database>

export type ClientContact = { id: string; name: string; phone: string | null; email: string | null }

export type InvoiceListRow = InvoiceViewRow & {
  created_at: string | null
  clients: { name: string; phone: string | null; email: string | null } | null
}

export type VisitDetails = {
  id: string
  status: AppointmentStatus
  scheduled_date: string
  scheduled_start_time: string
  scheduled_end_time: string
  job_name: string
  location_label: string | null
  // The appointment's own price; null when it follows the calculated price.
  price_override_cents: number | null
  live: LivePrice
}

export type InvoiceDetailLine = {
  visit: VisitDetails
  billed_amount_cents: number | null
  billed_rate_cents: number | null
  billed_minutes: number | null
  cancelled_at: string | null
  // Released lines (void invoice, archived draft) are shown as a record; they claim nothing.
  is_released: boolean
  state: LineState
  amount_cents: number
}

export type InvoiceDetail = {
  // internal_note is read from invoices: invoices_with_status doesn't carry it, so no list shows it.
  invoice: Views<'invoices_with_status'> & { client: ClientContact | null; internal_note: string | null }
  lines: InvoiceDetailLine[]
  // A draft's total is at the Live price; otherwise the view's total of Billed amounts.
  total_cents: number
  has_unpriced: boolean
}

// A visit that may join a draft: not cancelled, not archived, no Live claim; any status or date.
export type ClaimableVisit = VisitDetails & { state: LineState; amount_cents: number }

export type UnbilledVisitRow = UnbilledVisit & {
  scheduled_start_time: string
  scheduled_end_time: string
  job_name: string
  location_label: string | null
}

export type Receivables = {
  // Summed in the database (invoice_receivables_totals), so right at any volume.
  totals: ReceivablesTotals
  // Every owed invoice (issued, unarchived), read past PostgREST's row cap.
  owed: InvoiceListRow[]
  clients: ClientContact[]
  unbilled: UnbilledVisitRow[]
  // Open, unarchived drafts at the Live price: not owed yet.
  drafts: OpenDraft[]
  drafted_cents: number
}

type VisitRow = PriceableAppointment & {
  status: AppointmentStatus
  jobs: { name: string } | null
  client_locations: { label: string } | null
}

type UnbilledRow = VisitRow & { clients: { name: string } | null }

type InvoiceRow = Omit<InvoiceListRow, 'has_unpriced'>

type DetailLineRow = {
  billed_amount_cents: number | null
  billed_rate_cents: number | null
  billed_minutes: number | null
  cancelled_at: string | null
  is_archived: boolean
  appointment: VisitRow | null
}

// pricing_job is the price module's own Job embed, so `jobs` stays free for the name.
const VISIT_COLUMNS = `
  ${APPOINTMENT_PRICE_COLUMNS},
  status,
  jobs ( name ),
  client_locations ( label )
`

const INVOICE_LIST_COLUMNS = `
  id, client_id, status, effective_status, invoice_number, issued_date, due_date, total_cents,
  is_archived, is_automatic, created_at,
  clients ( name, phone, email )
`

const DRAFT = { status: 'draft' } as const
const UNCLAIMED_LINE = { billed_amount_cents: null, cancelled_at: null }
const UNPRICED: LivePrice = { source: 'unpriced' }

async function priceVisits(db: Db, rows: VisitRow[]): Promise<VisitDetails[]> {
  const prices = await priceAppointmentsInBatches(db, rows)

  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    scheduled_date: row.scheduled_date,
    scheduled_start_time: row.scheduled_start_time,
    scheduled_end_time: row.scheduled_end_time,
    job_name: row.jobs?.name ?? 'Unknown job',
    location_label: row.client_locations?.label ?? null,
    price_override_cents: row.price_override_cents,
    live: prices.get(row.id)?.live ?? UNPRICED,
  }))
}

async function loadUnbilled(db: Db, clientId: string | null): Promise<UnbilledVisitRow[]> {
  const { data, error } = await unbilledQuery(db, `${VISIT_COLUMNS}, clients ( name )`, {
    clientId,
    isCount: false,
  }).order('scheduled_date', { ascending: true })
  if (error) throw error

  const rows = data as unknown as UnbilledRow[]
  const prices = await priceAppointmentsInBatches(db, rows)

  return rows.map((row) => {
    const live = prices.get(row.id)?.live ?? UNPRICED
    return {
      id: row.id,
      client_id: row.client_id,
      client_name: row.clients?.name ?? 'Unknown client',
      scheduled_date: row.scheduled_date,
      scheduled_start_time: row.scheduled_start_time,
      scheduled_end_time: row.scheduled_end_time,
      live_price_cents: live.source === 'unpriced' ? null : live.amount_cents,
      job_name: row.jobs?.name ?? 'Unknown job',
      location_label: row.client_locations?.label ?? null,
    }
  })
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// A cheap existence check for the route layout, which must decide 404 before the page streams.
// An invoice under another client's URL doesn't exist as far as this route is concerned.
export async function invoiceExistsForClient(db: Db, clientId: string, invoiceId: string): Promise<boolean> {
  if (!UUID.test(clientId) || !UUID.test(invoiceId)) return false

  const { data, error } = await db
    .from('invoices')
    .select('id')
    .eq('id', invoiceId)
    .eq('client_id', clientId)
    .maybeSingle()
  if (error) throw error
  return data !== null
}

export async function getInvoiceDetail(db: Db, invoiceId: string): Promise<InvoiceDetail | null> {
  const { data, error } = await db
    .from('invoices_with_status')
    .select('*, client:clients ( id, name, phone, email )')
    .eq('id', invoiceId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  // The visits come embedded in the lines, so no id list travels in the URL.
  const [{ data: lineData, error: linesError }, { data: noteData, error: noteError }] = await Promise.all([
    db
      .from('invoice_appointments')
      .select(
        `billed_amount_cents, billed_rate_cents, billed_minutes, cancelled_at, is_archived, appointment:appointments ( ${VISIT_COLUMNS} )`
      )
      .eq('invoice_id', invoiceId),
    db.from('invoices').select('internal_note').eq('id', invoiceId).maybeSingle(),
  ])
  if (linesError) throw linesError
  if (noteError) throw noteError

  const invoice = {
    ...(data as unknown as Omit<InvoiceDetail['invoice'], 'internal_note'>),
    internal_note: noteData?.internal_note ?? null,
  }

  const lineRows = (lineData as unknown as DetailLineRow[]).filter((line) => line.appointment !== null)
  const visits = await priceVisits(
    db,
    lineRows.map((line) => line.appointment as VisitRow)
  )

  const lines = lineRows
    .map((line, index) => {
      const visit = visits[index]
      return {
        visit,
        billed_amount_cents: line.billed_amount_cents,
        billed_rate_cents: line.billed_rate_cents,
        billed_minutes: line.billed_minutes,
        cancelled_at: line.cancelled_at,
        is_released: line.is_archived,
        state: lineState(line, visit, invoice),
        amount_cents: lineAmountCents(line, visit, invoice),
      }
    })
    .sort((a, b) => a.visit.scheduled_date.localeCompare(b.visit.scheduled_date))

  const isDraft = invoice.status === 'draft'
  const entries = lines.map((line) => ({ line, visit: line.visit }))

  return {
    invoice,
    lines,
    total_cents: isDraft ? draftTotalCents(entries) : invoice.total_cents,
    has_unpriced: isDraft && hasUnpricedLine(entries),
  }
}

export async function listClaimableVisits(db: Db, clientId: string): Promise<ClaimableVisit[]> {
  const { data, error } = await db
    .from('appointments')
    .select(`${VISIT_COLUMNS}, ${LIVE_CLAIM_EMBED}`)
    .eq('live.is_archived', false)
    .is('live.cancelled_at', null)
    .is('live', null)
    .eq('client_id', clientId)
    .neq('status', 'cancelled')
    .eq('is_archived', false)
    .order('scheduled_date', { ascending: true })
  if (error) throw error

  const visits = await priceVisits(db, data as unknown as VisitRow[])

  return visits.map((visit) => ({
    ...visit,
    state: lineState(UNCLAIMED_LINE, visit, DRAFT),
    amount_cents: lineAmountCents(UNCLAIMED_LINE, visit, DRAFT),
  }))
}

// The Receivables figures, summed in the database so they stay right past the row cap. Drafts are
// only counted: their Live price is computed here (ADR 0001), by loadOpenDrafts.
export async function getReceivablesTotals(db: Db, clientId: string | null = null): Promise<ReceivablesTotals> {
  const { data, error } = await db
    .rpc('invoice_receivables_totals', { p_client_id: clientId ?? undefined })
    .single()
  if (error) throw error

  return {
    outstandingCents: data.outstanding_cents,
    overdueCents: data.overdue_cents,
    noDueDateCents: data.no_due_date_cents,
    unpaidCount: data.unpaid_count,
    draftCount: data.draft_count,
  }
}

// What a client still owes: issued, unarchived. Their totals are the view's Billed amounts.
export async function loadOwedInvoices(db: Db, clientId: string | null): Promise<InvoiceListRow[]> {
  const rows = await readAllPages((from, to) =>
    scopeToClient(
      db.from('invoices_with_status').select(INVOICE_LIST_COLUMNS).eq('status', 'issued').eq('is_archived', false),
      'client_id',
      clientId
    )
      .order('id', { ascending: true })
      .range(from, to)
  )

  return (rows as unknown as InvoiceRow[]).map((row) => ({ ...row, has_unpriced: false }))
}

type DraftRow = { id: string; client_id: string; created_at: string; clients: { name: string } | null }

// Open, unarchived drafts at the Live price. An archived draft's lines are released, so it has none.
async function loadOpenDrafts(db: Db, clientId: string | null): Promise<OpenDraft[]> {
  const rows = (await readAllPages((from, to) =>
    scopeToClient(
      db
        .from('invoices')
        .select('id, client_id, created_at, clients ( name )')
        .eq('status', 'draft')
        .eq('is_archived', false),
      'client_id',
      clientId
    )
      .order('id', { ascending: true })
      .range(from, to)
  )) as unknown as DraftRow[]

  const draftLines = await loadDraftLines(
    db,
    rows.map((row) => row.id)
  )

  return rows.map((row) => {
    const entries = draftLines.get(row.id) ?? []
    return {
      id: row.id,
      clientId: row.client_id,
      clientName: row.clients?.name ?? 'Unknown client',
      createdAt: row.created_at,
      appointmentCount: entries.length,
      unpricedCount: entries.filter((entry) => hasUnpricedLine([entry])).length,
      totalCents: draftTotalCents(entries),
    }
  })
}

// Inputs for clientBalances, overdueInvoices, owedInvoices and groupUnbilled in view.ts.
// Pass a client id to scope everything to one client (the client page).
export async function getReceivables(db: Db, clientId: string | null = null): Promise<Receivables> {
  const clientsQuery = scopeToClient(
    db.from('clients').select('id, name, phone, email').order('name', { ascending: true }),
    'id',
    clientId
  )

  const [totals, owed, drafts, { data: clients, error: clientsError }, unbilled] = await Promise.all([
    getReceivablesTotals(db, clientId),
    loadOwedInvoices(db, clientId),
    loadOpenDrafts(db, clientId),
    clientsQuery,
    loadUnbilled(db, clientId),
  ])
  if (clientsError) throw clientsError

  const draftedCents = drafts.reduce((total, draft) => total + draft.totalCents, 0)

  return { totals, owed, clients, unbilled, drafts, drafted_cents: draftedCents }
}

// The dashboard's Unbilled tile: the same rows Receivables lists, counted in the database.
export async function countUnbilledVisits(db: Db): Promise<number> {
  const { count, error } = await unbilledQuery(db, 'id', { clientId: null, isCount: true })
  if (error) throw error
  return count ?? 0
}

const CLIENT_INVOICE_COLUMNS = `
  id, status, invoice_number, created_at, issued_date, due_date, paid_date, payment_method,
  total_cents, is_archived, is_automatic, is_mark_paid
`

type ClientInvoiceRow = Omit<ClientInvoice, 'line_count'>

// Every invoice of one client, archived too (the Billing tab's Show archived is client-side). An open
// draft carries its Live price and line count; no other invoice has Live lines.
async function loadClientInvoices(db: Db, clientId: string): Promise<ClientInvoice[]> {
  const [rows, drafts] = await Promise.all([
    readAllPages((from, to) =>
      db
        .from('invoices_with_status')
        .select(CLIENT_INVOICE_COLUMNS)
        .eq('client_id', clientId)
        .order('id', { ascending: true })
        .range(from, to)
    ),
    loadOpenDrafts(db, clientId),
  ])
  const draftsById = new Map(drafts.map((draft) => [draft.id, draft]))

  return (rows as unknown as ClientInvoiceRow[]).map((row) => {
    const draft = draftsById.get(row.id)
    return draft
      ? { ...row, total_cents: draft.totalCents, line_count: draft.appointmentCount }
      : { ...row, line_count: null }
  })
}

export type ClientBilling = {
  totals: ReceivablesTotals
  invoices: ClientInvoice[]
  // The picker's two groups: completed work not on an invoice, and open work that can be billed ahead.
  unbilled: PickerAppointment[]
  upcoming: PickerAppointment[]
}

// Everything the client page's Billing tab reads, in parallel. Read failures throw.
export async function getClientBilling(db: Db, clientId: string): Promise<ClientBilling> {
  const [totals, invoices, claimable] = await Promise.all([
    getReceivablesTotals(db, clientId),
    loadClientInvoices(db, clientId),
    listClaimableVisits(db, clientId),
  ])

  return { totals, invoices, ...splitClaimable(claimable) }
}
