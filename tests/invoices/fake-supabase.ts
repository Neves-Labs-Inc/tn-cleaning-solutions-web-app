import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '../../src/types/database.ts'

type Row = Record<string, unknown>
type Filter = (row: Row) => boolean
type EmbedFilter = { embed: string; filter: Filter }
type RpcError = { message: string; details: string | null; hint: string | null; code: string }
export type RpcResponse = { data: unknown; error: RpcError | null }
export type RpcCall = { name: string; args: Record<string, unknown> }

export type FakeSupabase = {
  db: SupabaseClient<Database>
  tables: Record<string, Row[]>
  rpcCalls: RpcCall[]
}

// A refusal shaped like PostgREST's: invoice_error puts the code in DETAIL, which arrives as `details`.
export function refusal(code: string): RpcResponse {
  return { data: null, error: { message: `refused: ${code}`, details: code, hint: null, code: 'P0001' } }
}

export function success(data: unknown = null): RpcResponse {
  return { data, error: null }
}

// PostgREST's max-rows: a response never carries more, so reads that need every row must page.
export const MAX_ROWS = 1000
// Past roughly 250 uuids an `.in()` filter makes the URL too long and PostgREST refuses the request.
export const MAX_IN_VALUES = 250

// Hand-rolled stand-in for the reads the ledger and price module make (`from().select()` with
// `.in() .eq() .neq() .gte() .lte() .is() .not()` filters, `.order() .range()` paging, `.maybeSingle()`, awaited for `{ data, error }`) and for `.rpc()`, whose answer the
// test scripts. Filters are applied, so archived and cancelled rows drop out the way they do in Postgres.
// Embeds are seeded on the row under their alias. A dotted filter (`live.is_archived`) on an array
// embed filters that embed, and `.is('live', null)` then keeps rows whose embed came back empty; on
// an object embed (`!inner`) it filters the parent row.
// `tables` is live: a test can change it between calls to simulate a concurrent write.
// `failingTables` makes every read of those tables answer with an error, like a dropped connection.
// `.update(values)` takes the same filters, writes the values into the matching rows and, like
// `.select()` after it, answers with the updated rows.
function isNullish(value: unknown): boolean {
  return value === null || value === undefined || (Array.isArray(value) && value.length === 0)
}

function valueAt(row: Row, column: string): unknown {
  return column.split('.').reduce<unknown>((value, key) => (value as Row | null)?.[key], row)
}

function applyEmbedFilters(row: Row, embedFilters: EmbedFilter[]): Row {
  return embedFilters.reduce(
    (current, { embed, filter }) => {
      const items = current[embed]
      return Array.isArray(items) ? { ...current, [embed]: items.filter(filter) } : current
    },
    row
  )
}

export function createFakeSupabase(
  tables: Record<string, Row[]>,
  answerRpc: (call: RpcCall, callIndex: number) => RpcResponse = () => success(),
  failingTables: string[] = []
): FakeSupabase {
  const rpcCalls: RpcCall[] = []

  function from(table: string) {
    const filters: Filter[] = []
    const embedFilters: EmbedFilter[] = []
    const orderColumns: string[] = []
    let window: { from: number; to: number } | null = null
    let isUrlTooLong = false
    let isSingle = false
    let updateValues: Row | null = null

    // A dotted column on an array embed filters the embed; anything else filters the row.
    function addFilter(column: string, test: (value: unknown) => boolean) {
      const [embed, field] = column.split('.')
      const isEmbedFilter =
        field !== undefined && (tables[table] ?? []).some((row) => Array.isArray(row[embed]))
      if (isEmbedFilter) {
        embedFilters.push({ embed, filter: (item) => test(item[field]) })
      } else {
        filters.push((row) => test(valueAt(row, column)))
      }
      return builder
    }

    const builder = {
      select: () => builder,
      update: (values: Row) => {
        updateValues = values
        return builder
      },
      in: (column: string, values: unknown[]) => {
        isUrlTooLong = isUrlTooLong || values.length > MAX_IN_VALUES
        return addFilter(column, (value) => values.includes(value))
      },
      eq: (column: string, value: unknown) => addFilter(column, (actual) => actual === value),
      neq: (column: string, value: unknown) => addFilter(column, (actual) => actual !== value),
      // Compared as strings: enough for the yyyy-MM-dd ranges the reads use.
      gte: (column: string, value: string) => addFilter(column, (actual) => String(actual) >= value),
      lte: (column: string, value: string) => addFilter(column, (actual) => String(actual) <= value),
      // Like SQL `IS`, NULL and undefined both match null; an empty embed is null too.
      is: (column: string) => addFilter(column, isNullish),
      not: (column: string, _operator: 'is', value: boolean | null) =>
        addFilter(column, (actual) => (isNullish(actual) ? null : actual) !== value),
      // Ascending only, compared as strings: enough for the id orders the paged reads use.
      order: (column: string) => {
        orderColumns.push(column)
        return builder
      },
      range: (from: number, to: number) => {
        window = { from, to }
        return builder
      },
      // The first matching row, or null.
      maybeSingle: () => {
        isSingle = true
        return builder
      },
      then: (resolve: (result: { data: Row[] | Row | null; error: RpcError | null }) => unknown) => {
        if (failingTables.includes(table)) {
          const error = { message: 'connection reset', details: null, hint: null, code: '08006' }
          return Promise.resolve({ data: null, error }).then(resolve)
        }

        if (isUrlTooLong) {
          const error = { message: 'URI too long', details: null, hint: null, code: '414' }
          return Promise.resolve({ data: null, error }).then(resolve)
        }

        if (updateValues) {
          const changes = updateValues
          const updated = (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)))
          updated.forEach((row) => Object.assign(row, changes))
          return Promise.resolve({ data: isSingle ? (updated[0] ?? null) : updated, error: null }).then(resolve)
        }

        const matching = (tables[table] ?? [])
          .map((row) => applyEmbedFilters(row, embedFilters))
          .filter((row) => filters.every((filter) => filter(row)))
        const ordered = [...matching].sort((a, b) => {
          const column = orderColumns.find((name) => String(a[name]) !== String(b[name]))
          return column ? String(a[column]).localeCompare(String(b[column])) : 0
        })
        const data = (window ? ordered.slice(window.from, window.to + 1) : ordered).slice(0, MAX_ROWS)
        return Promise.resolve({ data: isSingle ? (data[0] ?? null) : data, error: null }).then(resolve)
      },
    }

    return builder
  }

  async function rpc(name: string, args: Record<string, unknown>) {
    const call = { name, args }
    rpcCalls.push(call)
    return answerRpc(call, rpcCalls.length - 1)
  }

  return { db: { from, rpc } as unknown as SupabaseClient<Database>, tables, rpcCalls }
}
