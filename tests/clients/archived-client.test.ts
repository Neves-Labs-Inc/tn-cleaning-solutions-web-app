import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ARCHIVED_CLIENT_ERROR, getEditRefusal } from '../../src/lib/clients/archived-client.ts'
import { createFakeSupabase } from '../invoices/fake-supabase.ts'

const CLIENTS = [
  { id: 'live', is_archived: false },
  { id: 'gone', is_archived: true },
]

describe('getEditRefusal', () => {
  it('lets an active client be edited', async () => {
    const { db } = createFakeSupabase({ clients: CLIENTS })

    assert.equal(await getEditRefusal(db, 'live'), null)
  })

  it('refuses an archived client', async () => {
    const { db } = createFakeSupabase({ clients: CLIENTS })

    assert.equal(await getEditRefusal(db, 'gone'), ARCHIVED_CLIENT_ERROR)
  })

  it('refuses a client that does not exist', async () => {
    const { db } = createFakeSupabase({ clients: CLIENTS })

    assert.equal(await getEditRefusal(db, 'missing'), 'Client not found.')
  })

  it('throws when the client cannot be read', async () => {
    const { db } = createFakeSupabase({ clients: CLIENTS }, undefined, ['clients'])

    await assert.rejects(getEditRefusal(db, 'live'))
  })
})
