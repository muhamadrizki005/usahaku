import { createBrowserClient } from '@supabase/ssr'
import { requireSupabaseConfig } from './config'

export function createClient() {
  const { url, key } = requireSupabaseConfig()
  return createBrowserClient(
    url,
    key,
    {
      cookieOptions: { secure: process.env.NODE_ENV === 'production' },
    },
  )
}
