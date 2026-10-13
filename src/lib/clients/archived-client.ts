import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/types/database'

export const ARCHIVED_CLIENT_ERROR = 'This client is archived. Restore it to make changes.'

// Server-side twin of the UI hiding controls on an archived client. Null means the client can be edited.
export async function getEditRefusal(db: SupabaseClient<Database>, clientId: string): Promise<string | null> {
  const { data: client, error } = await db.from('clients').select('is_archived').eq('id', clientId).maybeSingle()

  if (error) return error.message
  if (!client) return 'Client not found.'
  if (client.is_archived) return ARCHIVED_CLIENT_ERROR
  return null
}
