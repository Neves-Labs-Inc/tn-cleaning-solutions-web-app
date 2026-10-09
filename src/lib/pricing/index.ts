import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/types/database'
import { fetchClientJobRules } from './lookup.ts'
import { durationMinutes } from './money.ts'
import { pickEffectiveRule, resolveAppointmentPrice, type ClientJobRule, type PriceSource } from './resolve.ts'

// A caller adds this to its own appointments select. The Job embed is aliased so the caller can
// still embed `jobs` for its own columns, and is a left join so a missing Job surfaces as Unpriced.
export const APPOINTMENT_PRICE_COLUMNS = `
  id, client_id, job_id, scheduled_date, scheduled_start_time, scheduled_end_time, price_override_cents,
  pricing_job:jobs ( hourly_rate_cents )
`

export type PriceableAppointment = {
  id: string
  client_id: string
  job_id: string
  scheduled_date: string
  scheduled_start_time: string
  scheduled_end_time: string
  price_override_cents: number | null
  pricing_job: { hourly_rate_cents: number } | null
}

export type LivePrice =
  | {
      source: PriceSource
      amount_cents: number
      rate_cents: number | null
      minutes: number | null
      headcount: number
    }
  | { source: 'unpriced' }

export type DisplayPrice = { source: 'billed'; amount_cents: number } | LivePrice

export type PricedAppointment = { live: LivePrice; display: DisplayPrice }

// A visit with no crew assigned is still billed once.
const MIN_HEADCOUNT = 1

export async function priceAppointments(
  db: SupabaseClient<Database>,
  rows: PriceableAppointment[]
): Promise<Map<string, PricedAppointment>> {
  const priced = new Map<string, PricedAppointment>()
  if (rows.length === 0) return priced

  const appointmentIds = rows.map((row) => row.id)
  const [rulesByPair, billedById, headcountById] = await Promise.all([
    fetchClientJobRules(
      db,
      rows.map((row) => ({ clientId: row.client_id, jobId: row.job_id }))
    ),
    fetchBilledAmounts(db, appointmentIds),
    fetchHeadcounts(db, appointmentIds),
  ])

  for (const row of rows) {
    const live = livePrice(
      row,
      rulesByPair.get(`${row.client_id}:${row.job_id}`) ?? [],
      Math.max(headcountById.get(row.id) ?? 0, MIN_HEADCOUNT)
    )
    const billedCents = billedById.get(row.id)
    const display: DisplayPrice =
      billedCents === undefined ? live : { source: 'billed', amount_cents: billedCents }

    priced.set(row.id, { live, display })
  }

  return priced
}

function livePrice(row: PriceableAppointment, rules: ClientJobRule[], headcount: number): LivePrice {
  if (row.pricing_job === null) return { source: 'unpriced' }

  const resolved = resolveAppointmentPrice({
    job: row.pricing_job,
    rule: pickEffectiveRule(rules, row.scheduled_date),
    minutes: durationMinutes(row.scheduled_start_time, row.scheduled_end_time),
    appointmentOverrideCents: row.price_override_cents,
  })

  // An override is the visit's flat price as typed; only hourly prices scale with the crew.
  const amountCents =
    resolved.source === 'appointment_override' ? resolved.amount_cents : resolved.amount_cents * headcount

  return { ...resolved, amount_cents: amountCents, headcount }
}

async function fetchBilledAmounts(
  db: SupabaseClient<Database>,
  appointmentIds: string[]
): Promise<Map<string, number>> {
  // A released line (on a voided invoice) is archived and a Cancelled line charges nothing; neither
  // claims its appointment.
  const { data, error } = await db
    .from('invoice_appointments')
    .select('appointment_id, billed_amount_cents')
    .in('appointment_id', appointmentIds)
    .eq('is_archived', false)
    .is('cancelled_at', null)

  if (error) throw error

  // A draft line has no amount yet (null), so it falls back to the Live price.
  return new Map(
    data.flatMap((line) =>
      line.billed_amount_cents === null ? [] : [[line.appointment_id, line.billed_amount_cents] as const]
    )
  )
}

async function fetchHeadcounts(
  db: SupabaseClient<Database>,
  appointmentIds: string[]
): Promise<Map<string, number>> {
  const { data, error } = await db
    .from('appointment_employees')
    .select('appointment_id')
    .in('appointment_id', appointmentIds)
    // Matches the SQL's `coalesce(is_archived, false)`: a NULL flag is a live assignment.
    .not('is_archived', 'is', true)

  if (error) throw error

  const headcounts = new Map<string, number>()
  for (const assignment of data) {
    headcounts.set(assignment.appointment_id, (headcounts.get(assignment.appointment_id) ?? 0) + 1)
  }
  return headcounts
}
