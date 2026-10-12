import 'server-only'

import { createClient } from '@supabase/supabase-js'

import { getSupabasePublicEnv } from '@/lib/env'
import { getSupabaseSecretKey } from '@/lib/env.server'

export function createAdminClient() {
  const { url } = getSupabasePublicEnv()

  return createClient(url, getSupabaseSecretKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}