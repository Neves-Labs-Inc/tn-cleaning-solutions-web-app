import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ARCHIVED_CLIENT_ERROR } from '../../src/lib/clients/archived-client.ts'
import { ClientLocations } from '../../src/lib/clients/client-locations.ts'
import { createFakeSupabase } from '../invoices/fake-supabase.ts'

const SILENT_LOGGER = { warn: () => {}, error: () => {} }
const EDIT = { label: 'Cottage', address: '1 Lake Rd, Muskoka, ON', notes: 'Gate code 1234' }

function seed() {
  return {
    clients: [
      { id: 'live', is_archived: false },
      { id: 'gone', is_archived: true },
    ],
    client_locations: [
      { id: 'home', client_id: 'live', label: 'Home', address: '1 Queen St', notes: null, is_archived: false },
      { id: 'shed', client_id: 'live', label: 'Shed', address: '2 Queen St', notes: null, is_archived: true },
      { id: 'old', client_id: 'gone', label: 'Old', address: '3 King St', notes: null, is_archived: false },
    ],
  }
}

function createLocations() {
  const fake = createFakeSupabase(seed())
  const locations = new ClientLocations(fake.db, fake.db, SILENT_LOGGER)
  const rowOf = (id: string) => fake.tables.client_locations.find((row) => row.id === id)
  return { locations, rowOf }
}

describe('ClientLocations', () => {
  it('archives and restores a location of an active client', async () => {
    const { locations, rowOf } = createLocations()

    const archived = await locations.setArchived('home', true)
    assert.deepEqual(archived, { value: { id: 'home', clientId: 'live' }, error: null, status: 200 })
    assert.equal(rowOf('home')?.is_archived, true)

    const restored = await locations.setArchived('shed', false)
    assert.equal(restored.status, 200)
    assert.equal(rowOf('shed')?.is_archived, false)
  })

  it('refuses to archive or restore a location of an archived client', async () => {
    const { locations, rowOf } = createLocations()

    const archived = await locations.setArchived('old', true)
    assert.deepEqual(archived, { value: null, error: ARCHIVED_CLIENT_ERROR, status: 409 })
    assert.equal(rowOf('old')?.is_archived, false)

    rowOf('old')!.is_archived = true
    const restored = await locations.setArchived('old', false)
    assert.equal(restored.error, ARCHIVED_CLIENT_ERROR)
    assert.equal(rowOf('old')?.is_archived, true)
  })

  it('saves an edit to an active location of an active client', async () => {
    const { locations, rowOf } = createLocations()

    const result = await locations.update('home', EDIT)

    assert.deepEqual(result, { value: { id: 'home', clientId: 'live' }, error: null, status: 200 })
    assert.equal(rowOf('home')?.label, 'Cottage')
    assert.equal(rowOf('home')?.notes, 'Gate code 1234')
  })

  it('refuses an edit to a location of an archived client', async () => {
    const { locations, rowOf } = createLocations()

    const result = await locations.update('old', EDIT)

    assert.deepEqual(result, { value: null, error: ARCHIVED_CLIENT_ERROR, status: 409 })
    assert.equal(rowOf('old')?.label, 'Old')
  })

  it('refuses an edit to an archived location', async () => {
    const { locations, rowOf } = createLocations()

    const result = await locations.update('shed', EDIT)

    assert.deepEqual(result, { value: null, error: 'Location not found.', status: 404 })
    assert.equal(rowOf('shed')?.label, 'Shed')
  })

  it('answers not found for a location that does not exist', async () => {
    const { locations } = createLocations()

    assert.equal((await locations.setArchived('missing', true)).status, 404)
    assert.equal((await locations.update('missing', EDIT)).status, 404)
  })

  it('throws when the locations cannot be read', async () => {
    const fake = createFakeSupabase(seed(), undefined, ['client_locations'])
    const locations = new ClientLocations(fake.db, fake.db, SILENT_LOGGER)

    await assert.rejects(locations.setArchived('home', true))
  })
})
