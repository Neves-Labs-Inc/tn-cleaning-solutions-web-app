import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '../../src/types/database.ts'

type Row = Record<string, unknown>
type Filter = (row: Row) => boolean
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

// Hand-rolled stand-in for the reads the ledger and price module make (`from().select()` with
// `.in() .eq() .is() .not()` filters, awaited for `{ data, error }`) and for `.rpc()`, whose answer the
// test scripts. Filters are applied, so archived and cancelled rows drop out the way they do in Postgres.
// `tables` is live: a test can change it between calls to simulate a concurrent write.
// `failingTables` makes every read of those tables answer with an error, like a dropped connection.
export function createFakeSupabase(
  tables: Record<string, Row[]>,
  answerRpc: (call: RpcCall, callIndex: number) => RpcResponse = () => success(),
  failingTables: string[] = []
): FakeSupabase {
  const rpcCalls: RpcCall[] = []

  function from(table: string) {
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
      // Like SQL `IS`, NULL and undefined both match null.
      is: (column: string, value: null) => {
        filters.push((row) => (row[column] ?? null) === value)
        return builder
      },
      not: (column: string, _operator: 'is', value: boolean | null) => {
        filters.push((row) => (row[column] ?? null) !== value)
        return builder
      },
      then: (resolve: (result: { data: Row[] | null; error: RpcError | null }) => unknown) => {
        if (failingTables.includes(table)) {
          const error = { message: 'connection reset', details: null, hint: null, code: '08006' }
          return Promise.resolve({ data: null, error }).then(resolve)
        }

        const data = (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)))
        return Promise.resolve({ data, error: null }).then(resolve)
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
