import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '../../src/types/database.ts'

type Row = Record<string, unknown>
type Filter = (row: Row) => boolean

export type FakeTables = {
  client_job_pricing?: Row[]
  invoice_appointments?: Row[]
  appointment_employees?: Row[]
}

export type FakeDb = {
  db: SupabaseClient<Database>
  queriesByTable: Map<string, number>
}

// Hand-rolled stand-in for the three reads the price module makes: `from().select().in().eq()/.not()`,
// awaited for `{ data, error }`. It applies the filters, so archived rows drop out the way they would in Postgres.
export function createFakeDb(tables: FakeTables): FakeDb {
  const queriesByTable = new Map<string, number>()

  function from(table: keyof FakeTables) {
    queriesByTable.set(table, (queriesByTable.get(table) ?? 0) + 1)
    const filters: Filter[] = []

    const builder = {
      select: () => builder,
      in: (column: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[column]))
        return builder
      },
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value)
        return builder
      },
      // Only the `is` operator is used; like SQL `IS`, NULL and undefined both match null.
      not: (column: string, _operator: 'is', value: boolean | null) => {
        filters.push((row) => (row[column] ?? null) !== value)
        return builder
      },
      then: (resolve: (result: { data: Row[]; error: null }) => unknown) => {
        const data = (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)))
        return Promise.resolve({ data, error: null }).then(resolve)
      },
    }

    return builder
  }

  return { db: { from } as unknown as SupabaseClient<Database>, queriesByTable }
}
