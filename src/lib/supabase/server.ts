import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import { getSupabasePublicEnv } from '@/lib/env'

export async function createClient() {
  // cookies() first: it opts the route out of prerendering, so the build never reads env here.
  const cookieStore = await cookies()
  const { url, publishableKey } = getSupabasePublicEnv()

  return createServerClient(
    url,
    publishableKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}