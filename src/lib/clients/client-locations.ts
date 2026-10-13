import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/types/database'

import { getEditRefusal } from './archived-client.ts'

type Db = SupabaseClient<Database>
type Logger = Pick<Console, 'warn' | 'error'>

export type Result<T> = { value: T | null; error: string | null; status: number }
export type LocationRef = { id: string; clientId: string }
export type LocationInput = { label: string; address: string; notes: string | null }

const NOT_FOUND_ERROR = 'Location not found.'
const STATUS_OK = 200
const STATUS_NOT_FOUND = 404
const STATUS_CONFLICT = 409

// Location edits for the client page. Every change is refused once the client is archived, whatever
// the UI shows. Reads go through `reader` (the admin's RLS session); writes through `writer`.
export class ClientLocations {
  private readonly reader: Db
  private readonly writer: Db
  private readonly logger: Logger

  constructor(reader: Db, writer: Db, logger: Logger = console) {
    this.reader = reader
    this.writer = writer
    this.logger = logger
  }

  // Only active locations can be edited; an archived one is restored first.
  async update(locationId: string, input: LocationInput): Promise<Result<LocationRef>> {
    const found = await this.findEditable('update', locationId, { isArchivedAllowed: false })
    if (!found.value) return found

    const { data, error } = await this.writer
      .from('client_locations')
      .update({ label: input.label, address: input.address, notes: input.notes })
      .eq('id', locationId)
      .eq('is_archived', false)
      .select('id')
      .maybeSingle()

    if (error) throw new Error(`Couldn't update location ${locationId}: ${error.message}`)
    // Archived between the read and the write.
    if (!data) return this.refuse('update', locationId, NOT_FOUND_ERROR, STATUS_NOT_FOUND)
    return found
  }

  async setArchived(locationId: string, isArchived: boolean): Promise<Result<LocationRef>> {
    const operation = isArchived ? 'archive' : 'restore'
    const found = await this.findEditable(operation, locationId, { isArchivedAllowed: true })
    if (!found.value) return found

    const { error } = await this.writer
      .from('client_locations')
      .update({ is_archived: isArchived })
      .eq('id', locationId)

    if (error) throw new Error(`Couldn't ${operation} location ${locationId}: ${error.message}`)
    return found
  }

  private async findEditable(
    operation: string,
    locationId: string,
    { isArchivedAllowed }: { isArchivedAllowed: boolean }
  ): Promise<Result<LocationRef>> {
    const { data: location, error } = await this.reader
      .from('client_locations')
      .select('id, client_id, is_archived')
      .eq('id', locationId)
      .maybeSingle()

    if (error) throw new Error(`Couldn't read location ${locationId}: ${error.message}`)
    if (!location || (location.is_archived && !isArchivedAllowed)) {
      return this.refuse(operation, locationId, NOT_FOUND_ERROR, STATUS_NOT_FOUND)
    }

    const refusal = await getEditRefusal(this.reader, location.client_id)
    if (refusal) return this.refuse(operation, locationId, refusal, STATUS_CONFLICT)

    return { value: { id: location.id, clientId: location.client_id }, error: null, status: STATUS_OK }
  }

  private refuse(operation: string, locationId: string, error: string, status: number): Result<LocationRef> {
    this.logger.warn('Location change refused', { operation, locationId, error })
    return { value: null, error, status }
  }
}
