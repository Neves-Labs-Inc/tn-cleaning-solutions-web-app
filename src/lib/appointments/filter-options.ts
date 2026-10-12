import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/types/database'
import type { FilterOptions } from './filters.ts'

// The Client and Job filter choices: active clients and unarchived jobs, A to Z. Server code only.
// Read failures throw.
export async function listFilterOptions(db: SupabaseClient<Database>): Promise<FilterOptions> {
  const [clients, jobs] = await Promise.all([
    db
      .from('clients')
      .select('id, name')
      .eq('is_active', true)
      .eq('is_archived', false)
      .order('name', { ascending: true }),
    db.from('jobs').select('id, name').eq('is_archived', false).order('name', { ascending: true }),
  ])
  if (clients.error) throw clients.error
  if (jobs.error) throw jobs.error

  return { clients: clients.data, jobs: jobs.data }
}
