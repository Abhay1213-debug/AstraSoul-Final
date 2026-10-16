import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseAuthService, mapError } from './supabaseAuth'

/** A stand-in for the Supabase client: no network, no real project. */
function fakeClient() {
  const auth = {
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    updateUser: vi.fn(),
  }
  return { client: { auth } as unknown as SupabaseClient, auth }
}

afterEach(() => vi.restoreAllMocks())

describe('createSupabaseAuthService (against a stand-in client; NOT a real Supabase project)', () => {
  it('sign-up sends the name as profile metadata and the redirect, and reports "needs confirmation" when no session comes back', async () => {
    const { client, auth } = fakeClient()
    auth.signUp.mockResolvedValue({ data: { user: { id: 'u' }, session: null }, error: null })
    const svc = createSupabaseAuthService(client, { redirectTo: 'https://site.example/dashboard' })
    const r = await svc.signUp({ fullName: 'Asha Rao', email: 'asha@example.com', password: 'blue-river-lantern' })
    expect(r).toEqual({ ok: true, data: { needsConfirmation: true } })
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'asha@example.com',
      password: 'blue-river-lantern',
      options: { data: { full_name: 'Asha Rao' }, emailRedirectTo: 'https://site.example/dashboard' },
    })
  })

  it('sign-up reports "no confirmation needed" only when a session is returned', async () => {
    const { client, auth } = fakeClient()
    auth.signUp.mockResolvedValue({ data: { user: { id: 'u' }, session: { access_token: 'x' } }, error: null })
    const r = await createSupabaseAuthService(client).signUp({ fullName: 'Asha Rao', email: 'a@b.co', password: 'x'.repeat(12) })
    expect(r).toEqual({ ok: true, data: { needsConfirmation: false } })
  })

  it('an already-registered email looks EXACTLY like a new sign-up (nothing reveals who has an account)', async () => {
    const { client, auth } = fakeClient()
    for (const code of ['user_already_exists', 'email_exists']) {
      auth.signUp.mockResolvedValue({ data: { user: null, session: null }, error: { code, status: 422, name: 'AuthApiError', message: 'User already registered' } })
      const r = await createSupabaseAuthService(client).signUp({ fullName: 'Asha Rao', email: 'a@b.co', password: 'x'.repeat(12) })
      expect(r, code).toEqual({ ok: true, data: { needsConfirmation: true } })
    }
  })

  it('maps server errors to short fixed codes and never returns the server text', async () => {
    const { client, auth } = fakeClient()
    const cases: [object, string][] = [
      [{ code: 'invalid_credentials', status: 400, message: 'Invalid login credentials: internal detail 123' }, 'invalid_credentials'],
      [{ code: 'email_not_confirmed', status: 400, message: 'Email not confirmed' }, 'email_not_confirmed'],
      [{ code: 'weak_password', status: 422, message: 'Password is known to be weak' }, 'weak_password'],
      [{ code: 'over_request_rate_limit', status: 429, message: 'rate' }, 'rate_limited'],
      [{ code: 'over_email_send_rate_limit', status: 429, message: 'rate' }, 'rate_limited'],
      [{ status: 429, message: 'slow down' }, 'rate_limited'],
      [{ code: 'signup_disabled', status: 422, message: 'Signups not allowed' }, 'signup_disabled'],
      [{ name: 'AuthRetryableFetchError', status: 0, message: 'fetch failed' }, 'network'],
      [{ code: 'something_new', status: 500, message: 'Database error: secret-table-name' }, 'unknown'],
    ]
    for (const [err, code] of cases) {
      auth.signInWithPassword.mockResolvedValue({ data: {}, error: err })
      const r = await createSupabaseAuthService(client).signIn({ email: 'a@b.co', password: 'pw' })
      expect(r).toEqual({ ok: false, code })
      expect(JSON.stringify(r)).not.toMatch(/secret-table-name|internal detail|fetch failed/)
    }
  })

  it('a thrown network failure becomes the "network" code', async () => {
    const { client, auth } = fakeClient()
    auth.signInWithPassword.mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await createSupabaseAuthService(client).signIn({ email: 'a@b.co', password: 'pw' })).toEqual({ ok: false, code: 'network' })
    auth.signUp.mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await createSupabaseAuthService(client).signUp({ fullName: 'Asha Rao', email: 'a@b.co', password: 'x'.repeat(12) })).toEqual({ ok: false, code: 'network' })
  })

  it('log-in and log-out succeed without leaking anything', async () => {
    const { client, auth } = fakeClient()
    auth.signInWithPassword.mockResolvedValue({ data: { session: {} }, error: null })
    auth.signOut.mockResolvedValue({ error: null })
    const svc = createSupabaseAuthService(client)
    expect(await svc.signIn({ email: 'a@b.co', password: 'pw' })).toEqual({ ok: true, data: undefined })
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.co', password: 'pw' })
    expect(await svc.signOut()).toEqual({ ok: true, data: undefined })
  })

  it('getUser returns a small, safe view of the signed-in person (name capped at 80, plain text only)', async () => {
    const { client, auth } = fakeClient()
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1', email: 'a@b.co', user_metadata: { full_name: 'N'.repeat(200), role: 'admin' } } } } })
    const u = await createSupabaseAuthService(client).getUser()
    expect(u).toEqual({ id: 'u1', email: 'a@b.co', fullName: 'N'.repeat(80) })
    expect(Object.keys(u!).sort()).toEqual(['email', 'fullName', 'id']) // nothing from metadata such as "role" is exposed
    auth.getSession.mockResolvedValue({ data: { session: null } })
    expect(await createSupabaseAuthService(client).getUser()).toBeNull()
    auth.getSession.mockRejectedValue(new Error('boom'))
    expect(await createSupabaseAuthService(client).getUser()).toBeNull()
  })

  it('onChange forwards sign-in/out events and can be unsubscribed', () => {
    const { client, auth } = fakeClient()
    const unsubscribe = vi.fn()
    let handler: (event: string, session: unknown) => void = () => {}
    auth.onAuthStateChange.mockImplementation((h: typeof handler) => {
      handler = h
      return { data: { subscription: { unsubscribe } } }
    })
    const seen: unknown[] = []
    const off = createSupabaseAuthService(client).onChange((u) => seen.push(u))
    handler('SIGNED_IN', { user: { id: 'u1', email: 'a@b.co', user_metadata: { full_name: 'Asha' } } })
    handler('SIGNED_OUT', null)
    expect(seen).toEqual([{ id: 'u1', email: 'a@b.co', fullName: 'Asha' }, null])
    off()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('never writes to the console (no passwords, emails or errors are ever logged)', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}))
    const { client, auth } = fakeClient()
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: { code: 'invalid_credentials', message: 'bad' } })
    auth.signUp.mockRejectedValue(new Error('boom'))
    const svc = createSupabaseAuthService(client)
    await svc.signIn({ email: 'a@b.co', password: 'topsecretpw' })
    await svc.signUp({ fullName: 'Asha Rao', email: 'a@b.co', password: 'topsecretpw' })
    spies.forEach((s) => expect(s).not.toHaveBeenCalled())
  })
})

describe('mapError', () => {
  it('treats anything unexpected as "unknown"', () => {
    expect(mapError(undefined)).toBe('unknown')
    expect(mapError(null)).toBe('unknown')
    expect(mapError('text')).toBe('unknown')
    expect(mapError({})).toBe('unknown')
  })
})

describe('password reset (stand-in client; NOT a real Supabase project)', () => {
  it('asks for the reset email with the reset page as the return address', async () => {
    const { client, auth } = fakeClient()
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })
    const svc = createSupabaseAuthService(client, { resetRedirectTo: 'https://site.example/reset-password' })
    expect(await svc.requestPasswordReset('asha@example.com')).toEqual({ ok: true, data: undefined })
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('asha@example.com', { redirectTo: 'https://site.example/reset-password' })
  })

  it('reset-request failures become fixed codes only', async () => {
    const { client, auth } = fakeClient()
    auth.resetPasswordForEmail.mockResolvedValue({ data: null, error: { code: 'over_email_send_rate_limit', status: 429, name: 'AuthApiError', message: 'secret server text' } })
    const r = await createSupabaseAuthService(client).requestPasswordReset('a@b.co')
    expect(r).toEqual({ ok: false, code: 'rate_limited' })
    expect(JSON.stringify(r)).not.toContain('secret')
    auth.resetPasswordForEmail.mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await createSupabaseAuthService(client).requestPasswordReset('a@b.co')).toEqual({ ok: false, code: 'network' })
  })

  it('changes the password, then signs out the OTHER sessions (best effort)', async () => {
    const { client, auth } = fakeClient()
    auth.updateUser.mockResolvedValue({ data: { user: { id: 'u' } }, error: null })
    auth.signOut.mockResolvedValue({ error: null })
    expect(await createSupabaseAuthService(client).updatePassword('green-harbour-lamp')).toEqual({ ok: true, data: undefined })
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'green-harbour-lamp' })
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'others' })
  })

  it('still reports success if signing out the other sessions fails, and never signs out this one on failure', async () => {
    const { client, auth } = fakeClient()
    auth.updateUser.mockResolvedValue({ data: { user: { id: 'u' } }, error: null })
    auth.signOut.mockRejectedValue(new Error('boom'))
    expect(await createSupabaseAuthService(client).updatePassword('green-harbour-lamp')).toEqual({ ok: true, data: undefined })
    auth.signOut.mockClear()
    auth.updateUser.mockResolvedValue({ data: { user: null }, error: { code: 'same_password', status: 422, name: 'AuthApiError', message: 'x' } })
    expect(await createSupabaseAuthService(client).updatePassword('green-harbour-lamp')).toEqual({ ok: false, code: 'same_password' })
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it.each([
    [{ code: 'weak_password', status: 422, name: 'AuthWeakPasswordError' }, 'weak_password'],
    [{ code: 'reauthentication_needed', status: 401, name: 'AuthApiError' }, 'session_expired'],
    [{ code: 'session_not_found', status: 403, name: 'AuthApiError' }, 'session_expired'],
    [{ name: 'AuthSessionMissingError', status: 400 }, 'session_expired'],
  ])('maps %j to %s', async (err, code) => {
    const { client, auth } = fakeClient()
    auth.updateUser.mockResolvedValue({ data: { user: null }, error: err })
    expect(await createSupabaseAuthService(client).updatePassword('green-harbour-lamp')).toEqual({ ok: false, code })
  })
})
