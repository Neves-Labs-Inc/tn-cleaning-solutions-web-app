import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/types/database'
import type { AppointmentStatus } from '../appointments/lifecycle.ts'
import { APPOINTMENT_PRICE_COLUMNS, type PriceableAppointment } from '../pricing/index.ts'
import { inBatches, priceAppointmentsInBatches } from './batch.ts'
import type { LineEntry } from './lines.ts'

export type DraftLine = LineEntry & { appointment_id: string }

type Db = SupabaseClient<Database>
type LineRow = { invoice_id: string; appointment_id: string }
type VisitRow = PriceableAppointment & { status: AppointmentStatus }

// A visit the session can't read is treated as Unpriced, so it blocks issuing instead of being billed $0.
const UNREADABLE_VISIT = { status: 'scheduled', live: { source: 'unpriced' } } as const

async function loadLiveLines(db: Db, invoiceIds: string[]): Promise<LineRow[]> {
  const lines: LineRow[] = []

  for (const batch of inBatches(invoiceIds)) {
    const { data, error } = await db
      .from('invoice_appointments')
      .select('invoice_id, appointment_id')
      .in('invoice_id', batch)
      .eq('is_archived', false)
      .is('cancelled_at', null)
    if (error) throw error
    lines.push(...data)
  }

  return lines
}

async function loadVisits(db: Db, appointmentIds: string[]): Promise<VisitRow[]> {
  const visits: VisitRow[] = []

  for (const batch of inBatches(appointmentIds)) {
    const { data, error } = await db.from('appointments').select(`${APPOINTMENT_PRICE_COLUMNS}, status`).in('id', batch)
    if (error) throw error
    visits.push(...(data as unknown as VisitRow[]))
  }

  return visits
}

// The live (unreleased, uncancelled) lines of each draft with their visits priced at the Live price:
// exactly the line set invoice_issue compares against. Read failures throw.
export async function loadDraftLines(db: Db, invoiceIds: string[]): Promise<Map<string, DraftLine[]>> {
  const byInvoice = new Map<string, DraftLine[]>(invoiceIds.map((id) => [id, []]))

  const lines = await loadLiveLines(db, invoiceIds)
  if (lines.length === 0) return byInvoice

  const visits = await loadVisits(
    db,
    lines.map((line) => line.appointment_id)
  )
  const prices = await priceAppointmentsInBatches(db, visits)
  const statusById = new Map(visits.map((visit) => [visit.id, visit.status]))

  for (const line of lines) {
    const status = statusById.get(line.appointment_id)
    const live = prices.get(line.appointment_id)?.live
    const visit = status === undefined || live === undefined ? UNREADABLE_VISIT : { status, live }

    byInvoice.get(line.invoice_id)?.push({
      appointment_id: line.appointment_id,
      line: { billed_amount_cents: null, cancelled_at: null },
      visit,
    })
  }

  return byInvoice
}
