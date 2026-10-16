import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { evaluateSupabaseConfig, type ConfigResult } from './supabaseConfig'

/**
 * The single place the browser Supabase client is created.
 *
 * STAGE 1: prepared only. No page imports this yet, so the site behaves exactly as before. Nothing here
 * has been connected to, or tested against, a real Supabase project.
 *
 * Safety properties:
 *  - Only the PUBLIC URL and publishable/anon key are read (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY).
 *  - A secret or service-role key makes the client refuse to start (see supabaseConfig.ts).
 *  - When not configured the site keeps working and callers get `null`, so UI can say so honestly.
 *  - This module never logs configuration, keys, queries or user data.
 *  - Authorisation is NOT decided here or anywhere in the browser: Row Level Security in the database is
 *    the enforcement point. Route guards added later are convenience only.
 */

interface Backend {
  result: ConfigResult
  client: SupabaseClient | null
}

let cached: Backend | undefined

function build(): Backend {
  const result = evaluateSupabaseConfig(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
  if (result.status !== 'ready') return { result, client: null }
  const client = createClient(result.url, result.key, {
    auth: {
      flowType: 'pkce', // recommended for browser apps
      persistSession: true, // the auth token (not customer data) lives in browser storage — standard for supabase-js
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
  return { result, client }
}

function backend(): Backend {
  cached ??= build()
  return cached
}

/** The browser client, or `null` when Supabase is not (validly) configured. */
export function getSupabase(): SupabaseClient | null {
  return backend().client
}

/** 'ready' | 'not_configured' | 'invalid'. For invalid, `getBackendMessage()` explains why (never includes secrets). */
export function getBackendStatus(): ConfigResult['status'] {
  return backend().result.status
}

export function getBackendMessage(): string | undefined {
  const r = backend().result
  return r.status === 'invalid' ? r.message : undefined
}

export const isBackendReady = (): boolean => getBackendStatus() === 'ready'

/** Test helper: forget the cached client so a test can change the env. */
export function resetSupabaseForTests(): void {
  cached = undefined
}
