import { afterEach, describe, expect, it, vi } from 'vitest'
import { getBackendMessage, getBackendStatus, getSupabase, isBackendReady, resetSupabaseForTests } from './supabase'

const b64url = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = (role: string) => [b64url({ alg: 'HS256' }), b64url({ role }), 'c2lnbmF0dXJl'].join('.')

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  resetSupabaseForTests()
})

const configure = (url: string, key: string) => {
  vi.stubEnv('VITE_SUPABASE_URL', url)
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', key)
  resetSupabaseForTests()
}

describe('Supabase client module (Stage 1: prepared, not connected)', () => {
  it('returns no client and says "not_configured" when env is empty (the current real state)', () => {
    configure('', '')
    expect(getSupabase()).toBeNull()
    expect(getBackendStatus()).toBe('not_configured')
    expect(isBackendReady()).toBe(false)
    expect(getBackendMessage()).toBeUndefined()
  })

  it('refuses to create a client from a secret / service-role key', () => {
    for (const key of ['sb_secret_' + 'Q'.repeat(30), jwt('service_role')]) {
      configure('https://abcdefghijklmnop.supabase.co', key)
      expect(getSupabase()).toBeNull()
      expect(getBackendStatus()).toBe('invalid')
      expect(getBackendMessage()).toMatch(/refused/i)
      expect(getBackendMessage()).not.toContain(key)
    }
  })

  it('creates a client from a valid public configuration without making any network request', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    configure('https://abcdefghijklmnop.supabase.co', 'sb_publishable_' + 'k'.repeat(30))
    const client = getSupabase()
    expect(client).not.toBeNull()
    expect(typeof client!.auth.signInWithPassword).toBe('function')
    expect(isBackendReady()).toBe(true)
    expect(getSupabase()).toBe(client) // singleton
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('does not write anything to localStorage just by being created', () => {
    configure('https://abcdefghijklmnop.supabase.co', jwt('anon'))
    getSupabase()
    expect(localStorage.length).toBe(0)
  })
})
