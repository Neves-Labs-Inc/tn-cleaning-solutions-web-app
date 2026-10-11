import assert from 'node:assert/strict'
import { test } from 'node:test'

import { scopeToClient } from '../../src/lib/invoices/client-scope.ts'
import { createFakeSupabase } from './fake-supabase.ts'

const INVOICES = [
  { id: 'smith-1', client_id: 'smith' },
  { id: 'jones-1', client_id: 'jones' },
  { id: 'smith-2', client_id: 'smith' },
]

const CLIENTS = [
  { id: 'smith', name: 'Smith' },
  { id: 'jones', name: 'Jones' },
]

async function readIds(query: PromiseLike<{ data: unknown }>): Promise<string[]> {
  const { data } = await query
  return (data as Array<{ id: string }>).map((row) => row.id)
}

test('with no client id, every client is read', async () => {
  const { db } = createFakeSupabase({ invoices: INVOICES })

  const ids = await readIds(scopeToClient(db.from('invoices').select('id, client_id'), 'client_id', null))

  assert.deepEqual(ids, ['smith-1', 'jones-1', 'smith-2'])
})

test('with a client id, only that client is read', async () => {
  const { db } = createFakeSupabase({ invoices: INVOICES })

  const ids = await readIds(scopeToClient(db.from('invoices').select('id, client_id'), 'client_id', 'smith'))

  assert.deepEqual(ids, ['smith-1', 'smith-2'])
})

test('the scope column can be the client row itself', async () => {
  const { db } = createFakeSupabase({ clients: CLIENTS })

  const ids = await readIds(scopeToClient(db.from('clients').select('id, name'), 'id', 'jones'))

  assert.deepEqual(ids, ['jones'])
})
