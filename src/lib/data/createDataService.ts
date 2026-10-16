import { accountsEnabled } from '../auth/createAuthService'
import type { DataService } from './types'

/**
 * Builds the real data service - or returns null when accounts are off (the default), exactly like the account service.
 * The Supabase library is loaded only AFTER the switch is checked, so public pages stay as light as before.
 */
export async function loadDefaultDataService(): Promise<DataService | null> {
  if (!accountsEnabled()) return null
  const [{ getSupabase, isBackendReady }, { createSupabaseDataService }] = await Promise.all([import('../supabase'), import('./supabaseData')])
  if (!isBackendReady()) return null
  const client = getSupabase()
  return client ? createSupabaseDataService(client) : null
}
