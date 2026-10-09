import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/types/database'
import { priceAppointments, type PriceableAppointment, type PricedAppointment } from '../pricing/index.ts'

// An `.in()` filter travels in the URL, and PostgREST answers "URI too long" past roughly 250 uuids.
// 100 keeps every request well under that.
export const MAX_IDS_PER_REQUEST = 100

export function inBatches<T>(items: T[], size: number = MAX_IDS_PER_REQUEST): T[][] {
  const batches: T[][] = []
  for (let start = 0; start < items.length; start += size) {
    batches.push(items.slice(start, start + size))
  }
  return batches
}

// priceAppointments sends every row id in its own `.in()` reads, so a long list is priced in batches.
export async function priceAppointmentsInBatches(
  db: SupabaseClient<Database>,
  rows: PriceableAppointment[]
): Promise<Map<string, PricedAppointment>> {
  const priced = new Map<string, PricedAppointment>()

  for (const batch of inBatches(rows)) {
    for (const [id, price] of await priceAppointments(db, batch)) {
      priced.set(id, price)
    }
  }

  return priced
}
