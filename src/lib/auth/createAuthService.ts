import type { AuthService } from './types'

/**
 * Accounts are switched on ONLY when BOTH are true:
 *   1. the public Supabase URL + publishable key are configured and valid, and
 *   2. VITE_ACCOUNTS_ENABLED is exactly "true".
 * The second switch exists so that adding the keys alone can never expose sign-up before the database has been installed
 * and checked. Until then the pages say, honestly, that accounts are not available yet.
 */
export function accountsEnabled(env: { VITE_ACCOUNTS_ENABLED?: string } = import.meta.env): boolean {
  return env.VITE_ACCOUNTS_ENABLED === 'true'
}

/**
 * Builds the real account service - or returns null when accounts are off.
 * The Supabase library is loaded with a dynamic import, AFTER the switch is checked, so while accounts are off
 * (the default) no visitor downloads it and the public pages stay exactly as light as before.
 */
export async function loadDefaultAuthService(): Promise<AuthService | null> {
  if (!accountsEnabled()) return null
  const [{ getSupabase, isBackendReady }, { createSupabaseAuthService }] = await Promise.all([
    import('../supabase'),
    import('./supabaseAuth'),
  ])
  if (!isBackendReady()) return null
  const client = getSupabase()
  if (!client) return null
  return createSupabaseAuthService(client, {
    redirectTo: `${window.location.origin}/dashboard`,
    resetRedirectTo: `${window.location.origin}/reset-password`,
  })
}
