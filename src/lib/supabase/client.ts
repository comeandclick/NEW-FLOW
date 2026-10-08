import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getBrowserDemoClient, isDemoBrowser } from '@/lib/demo/runtime'

let real: SupabaseClient | null = null

export const isConfigured = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

/** Browser data client. In demo mode this is an in-memory, browser-persisted mock with the same API. */
export function getDb(): SupabaseClient {
  if (isDemoBrowser()) return getBrowserDemoClient() as unknown as SupabaseClient
  if (!real) {
    real = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  }
  return real
}
