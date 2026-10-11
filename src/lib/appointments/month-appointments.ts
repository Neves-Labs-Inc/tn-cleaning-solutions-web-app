import type { SupabaseClient } from '@supabase/supabase-js'
import { endOfMonth, format } from 'date-fns'

import type { Database } from '@/types/database'
import { priceAppointmentsInBatches, readAllPages } from '../invoices/batch.ts'
import { paymentStateOf } from '../invoices/payment-state.ts'
import { loadClaims } from '../invoices/payment-state-queries.ts'
import { APPOINTMENT_PRICE_COLUMNS, type DisplayPrice, type PriceableAppointment } from '../pricing/index.ts'
import type { AppointmentStatus } from './lifecycle.ts'
import { isNotClocked, type ScheduleAppointment } from './overview.ts'

// The appointments screen's month read. Admin pages only: it reads client names and invoice
// numbers. No `server-only` import, so node:test can load it; call it from server code only.
// Read failures throw.

type Db = SupabaseClient<Database>

type MonthRow = PriceableAppointment & {
  status: AppointmentStatus
  completed_at: string | null
  clients: { name: string } | null
  jobs: { name: string } | null
}

const MONTH_COLUMNS = `
  ${APPOINTMENT_PRICE_COLUMNS},
  status, completed_at,
  clients!inner ( name ),
  jobs!inner ( name )
`

function displayedCents(display: DisplayPrice | undefined): number | null {
  return display && display.source !== 'unpriced' ? display.amount_cents : null
}

// Every appointment in the month, by date and start time, with its displayed price and Payment
// state. Prices and claims are read in batches, never per row.
export async function listMonthAppointments(
  db: Db,
  { month, year }: { month: number; year: number },
  now: Date
): Promise<ScheduleAppointment[]> {
  const firstDay = new Date(year, month - 1, 1)
  const from = format(firstDay, 'yyyy-MM-dd')
  const to = format(endOfMonth(firstDay), 'yyyy-MM-dd')

  // Paged in an order with a unique last key so no row shifts between pages.
  const rows = (await readAllPages((start, end) =>
    db
      .from('appointments')
      .select(MONTH_COLUMNS)
      .eq('is_archived', false)
      .gte('scheduled_date', from)
      .lte('scheduled_date', to)
      .order('scheduled_date', { ascending: true })
      .order('scheduled_start_time', { ascending: true })
      .order('id', { ascending: true })
      .range(start, end)
  )) as unknown as MonthRow[]

  const ids = rows.map((row) => row.id)
  const [prices, claims] = await Promise.all([priceAppointmentsInBatches(db, rows), loadClaims(db, ids)])

  return rows.map((row) => {
    const claim = claims.get(row.id) ?? null
    return {
      id: row.id,
      clientId: row.client_id,
      clientName: row.clients?.name ?? 'Unknown client',
      jobName: row.jobs?.name ?? 'Unknown job',
      scheduledDate: row.scheduled_date,
      startTime: row.scheduled_start_time,
      endTime: row.scheduled_end_time,
      status: row.status,
      priceCents: displayedCents(prices.get(row.id)?.display),
      paymentState: paymentStateOf({ status: row.status, completed_at: row.completed_at, claim }),
      claim,
      isNotClocked: isNotClocked(
        { status: row.status, scheduledDate: row.scheduled_date, endTime: row.scheduled_end_time },
        now
      ),
    }
  })
}
