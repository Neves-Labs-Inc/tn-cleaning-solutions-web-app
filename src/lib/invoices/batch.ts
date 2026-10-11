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

// PostgREST caps a response at its max-rows setting, so reads that must see every row page through.
const PAGE_SIZE = 1000

type PageResult<T> = { data: T[] | null; error: unknown }

// Pages through a read until a short page. readPage must order by a unique column, or rows can
// shift between pages.
export async function readAllPages<T>(readPage: (from: number, to: number) => PromiseLike<PageResult<T>>): Promise<T[]> {
  const rows: T[] = []

  for (let from = 0, isLastPage = false; !isLastPage; from += PAGE_SIZE) {
    const { data, error } = await readPage(from, from + PAGE_SIZE - 1)
    if (error) throw error

    const page = data ?? []
    rows.push(...page)
    isLastPage = page.length < PAGE_SIZE
  }

  return rows
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
