import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { AppointmentStatus } from '@/lib/appointments/lifecycle'
import { APPOINTMENT_PRICE_COLUMNS, type LivePrice, type PriceableAppointment } from '@/lib/pricing'
import type { Database, Views } from '@/types/database'
import { priceAppointmentsInBatches } from './batch'
import { loadDraftLines, type DraftLine } from './draft-lines'
import { draftTotalCents, hasUnpricedLine, lineAmountCents, lineState } from './lines'
import type { InvoiceViewRow, LineState, UnbilledVisit } from './view'

// The read shapes the invoice screens need, so pages never rebuild these joins. Read failures throw
// to the route's error boundary. Every function takes the user-session client.
//
// Admin pages only: these read client phone and email, and the clients RLS lets a Cleaner read those
// too, so call them from under the (admin) route group, never from a Cleaner page.

type Db = SupabaseClient<Database>

export type ClientContact = { id: string; name: string; phone: string; email: string }

export type InvoiceListRow = InvoiceViewRow & {
  created_at: string | null
  clients: { name: string; phone: string; email: string } | null
}

export type VisitDetails = {
  id: string
  status: AppointmentStatus
  scheduled_date: string
  scheduled_start_time: string
  scheduled_end_time: string
  job_name: string
  location_label: string | null
  location_address: string | null
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
  invoice: Views<'invoices_with_status'> & { client: ClientContact | null }
  lines: InvoiceDetailLine[]
  // A draft's total is at the Live price; otherwise the view's total of Billed amounts.
  total_cents: number
  has_unpriced: boolean
}

// A visit that may join a draft: not cancelled, not archived, no Live claim; any status or date.
export type ClaimableVisit = VisitDetails & { state: LineState; amount_cents: number }

export type UnbilledVisitRow = UnbilledVisit & { job_name: string; location_label: string | null }

export type Receivables = {
  invoices: InvoiceListRow[]
  clients: ClientContact[]
  unbilled: UnbilledVisitRow[]
  // Open, unarchived drafts at the Live price: not owed yet.
  drafted_cents: number
}

type VisitRow = PriceableAppointment & {
  status: AppointmentStatus
  jobs: { name: string } | null
  client_locations: { label: string; address: string } | null
}

type UnbilledRow = VisitRow & { excluded_from_automatic: boolean; clients: { name: string } | null }

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
  client_locations ( label, address )
`

// "No Live claim" as a PostgREST anti-join: embed only the visit's Live claims, then keep the rows
// where that embed is empty. It runs in the database, so no id list travels in the URL.
const LIVE_CLAIM_EMBED = 'live:invoice_appointments ( appointment_id )'

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
    location_address: row.client_locations?.address ?? null,
    live: prices.get(row.id)?.live ?? UNPRICED,
  }))
}

async function loadInvoiceRows(
  db: Db,
  clientId: string | null
): Promise<{ rows: InvoiceListRow[]; draftLines: Map<string, DraftLine[]> }> {
  let query = db.from('invoices_with_status').select(INVOICE_LIST_COLUMNS).order('created_at', { ascending: false })
  if (clientId) {
    query = query.eq('client_id', clientId)
  }

  const { data, error } = await query
  if (error) throw error

  const invoices = data as unknown as InvoiceRow[]
  // An archived draft's lines are released, so only open drafts have lines to price.
  const draftIds = invoices.filter((row) => row.status === 'draft' && !row.is_archived).map((row) => row.id)
  const draftLines = await loadDraftLines(db, draftIds)

  // The view sums Billed amounts, which a draft doesn't have yet: its total is at the Live price.
  const rows = invoices.map((row) => {
    const lines = draftLines.get(row.id) ?? []
    return {
      ...row,
      total_cents: row.status === 'draft' ? draftTotalCents(lines) : row.total_cents,
      has_unpriced: hasUnpricedLine(lines),
    }
  })

  return { rows, draftLines }
}

// Completed after launch and still completed (completed_at isn't cleared when a visit is reopened),
// not archived, no Live claim. Excluded and Unpriced visits are included and tagged.
function unbilledQuery(db: Db, columns: string, options: { clientId: string | null; isCount: boolean }) {
  let query = db
    .from('appointments')
    .select(`${columns}, ${LIVE_CLAIM_EMBED}`, options.isCount ? { count: 'exact', head: true } : undefined)
    .eq('live.is_archived', false)
    .is('live.cancelled_at', null)
    .is('live', null)
    .not('completed_at', 'is', null)
    .eq('status', 'completed')
    .eq('is_archived', false)
  if (options.clientId) {
    query = query.eq('client_id', options.clientId)
  }
  return query
}

async function loadUnbilled(db: Db, clientId: string | null): Promise<UnbilledVisitRow[]> {
  const { data, error } = await unbilledQuery(db, `${VISIT_COLUMNS}, excluded_from_automatic, clients ( name )`, {
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
      live_price_cents: live.source === 'unpriced' ? null : live.amount_cents,
      is_excluded: row.excluded_from_automatic,
      job_name: row.jobs?.name ?? 'Unknown job',
      location_label: row.client_locations?.label ?? null,
    }
  })
}

// Newest first, with client contact and has_unpriced on drafts.
export async function listInvoices(db: Db): Promise<InvoiceListRow[]> {
  const { rows } = await loadInvoiceRows(db, null)
  return rows
}

export async function getInvoiceDetail(db: Db, invoiceId: string): Promise<InvoiceDetail | null> {
  const { data, error } = await db
    .from('invoices_with_status')
    .select('*, client:clients ( id, name, phone, email )')
    .eq('id', invoiceId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const invoice = data as unknown as InvoiceDetail['invoice']

  // The visits come embedded in the lines, so no id list travels in the URL.
  const { data: lineData, error: linesError } = await db
    .from('invoice_appointments')
    .select(
      `billed_amount_cents, billed_rate_cents, billed_minutes, cancelled_at, is_archived, appointment:appointments ( ${VISIT_COLUMNS} )`
    )
    .eq('invoice_id', invoiceId)
  if (linesError) throw linesError

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

// Inputs for receivablesTotals, clientBalances, overdueInvoices and groupUnbilled in view.ts.
// Pass a client id to scope everything to one client (the client page).
export async function getReceivables(db: Db, clientId: string | null = null): Promise<Receivables> {
  let clientsQuery = db.from('clients').select('id, name, phone, email').order('name', { ascending: true })
  if (clientId) {
    clientsQuery = clientsQuery.eq('id', clientId)
  }

  const [{ rows, draftLines }, { data: clients, error: clientsError }, unbilled] = await Promise.all([
    loadInvoiceRows(db, clientId),
    clientsQuery,
    loadUnbilled(db, clientId),
  ])
  if (clientsError) throw clientsError

  const openDraftIds = rows.filter((row) => row.status === 'draft' && !row.is_archived).map((row) => row.id)
  const draftedCents = openDraftIds.reduce((total, id) => total + draftTotalCents(draftLines.get(id) ?? []), 0)

  return { invoices: rows, clients, unbilled, drafted_cents: draftedCents }
}

// The dashboard's Unbilled tile: the same rows Receivables lists, counted in the database.
export async function countUnbilledVisits(db: Db): Promise<number> {
  const { count, error } = await unbilledQuery(db, 'id', { clientId: null, isCount: true })
  if (error) throw error
  return count ?? 0
}
