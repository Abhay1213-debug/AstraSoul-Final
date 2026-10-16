import { describe, expect, it } from 'vitest'
import { evaluateSupabaseConfig, inspectKey, inspectUrl } from './supabaseConfig'

// All values here are synthetic and built at runtime. None is a real credential.
const b64url = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = (role: string) => [b64url({ alg: 'HS256', typ: 'JWT' }), b64url({ role, iss: 'test' }), 'c2lnbmF0dXJlLXBsYWNlaG9sZGVy'].join('.')
const publishable = 'sb_publishable_' + 'A1b2'.repeat(8)
const secret = 'sb_secret_' + 'Z9y8'.repeat(8)
const URL_OK = 'https://abcdefghijklmnop.supabase.co'

describe('inspectKey', () => {
  it('accepts publishable and anon keys', () => {
    expect(inspectKey(publishable)).toBe('publishable')
    expect(inspectKey(jwt('anon'))).toBe('anon-jwt')
    expect(inspectKey(`  ${publishable}  `)).toBe('publishable')
  })
  it('flags secret and service-role keys', () => {
    expect(inspectKey(secret)).toBe('secret')
    expect(inspectKey(jwt('service_role'))).toBe('service-role-jwt')
  })
  it('treats everything else as unknown', () => {
    for (const bad of ['', '   ', 'hello', 'sb_publishable_short', jwt('authenticated'), jwt(''), 'a.b.c', publishable + '\n' + 'x', `${publishable} extra`]) {
      expect(inspectKey(bad)).toBe('unknown')
    }
  })
  it('does not throw on malformed JWT payloads', () => {
    expect(inspectKey('eyJhbGciOiJIUzI1NiJ9.!!!notbase64!!!.sig')).toBe('unknown')
    expect(inspectKey('eyJhbGciOiJIUzI1NiJ9.bm90LWpzb24.c2ln')).toBe('unknown')
  })
})

describe('inspectUrl', () => {
  it('accepts https project URLs and normalises to the origin', () => {
    expect(inspectUrl(URL_OK)).toEqual({ ok: true, origin: URL_OK })
    expect(inspectUrl(URL_OK + '/')).toEqual({ ok: true, origin: URL_OK })
    expect(inspectUrl(`  ${URL_OK}  `)).toEqual({ ok: true, origin: URL_OK })
  })
  it('allows plain http only for a local test stack', () => {
    expect(inspectUrl('http://127.0.0.1:54321').ok).toBe(true)
    expect(inspectUrl('http://localhost:54321').ok).toBe(true)
    expect(inspectUrl('http://abcdefghijklmnop.supabase.co')).toEqual({ ok: false, problem: 'insecure' })
  })
  it('rejects credentials, paths, queries, other schemes and junk', () => {
    expect(inspectUrl('https://user:pass@abc.supabase.co')).toEqual({ ok: false, problem: 'credentials' })
    expect(inspectUrl(URL_OK + '/rest/v1')).toEqual({ ok: false, problem: 'path' })
    expect(inspectUrl(URL_OK + '?x=1')).toEqual({ ok: false, problem: 'path' })
    expect(inspectUrl(['postgresql', '://u:p@db.example.com:5432/postgres'].join('')).ok).toBe(false) // built at runtime so the repo secret-scan stays strict
    expect(inspectUrl('not a url')).toEqual({ ok: false, problem: 'malformed' })
    expect(inspectUrl('')).toEqual({ ok: false, problem: 'malformed' })
  })
})

describe('evaluateSupabaseConfig', () => {
  it('is "not configured" when both are empty or missing', () => {
    expect(evaluateSupabaseConfig(undefined, undefined)).toEqual({ status: 'not_configured' })
    expect(evaluateSupabaseConfig('', '  ')).toEqual({ status: 'not_configured' })
  })
  it('is invalid when only one value is present', () => {
    expect(evaluateSupabaseConfig(URL_OK, '')).toMatchObject({ status: 'invalid', reason: 'incomplete' })
    expect(evaluateSupabaseConfig('', publishable)).toMatchObject({ status: 'invalid', reason: 'incomplete' })
  })
  it('is ready with a valid URL and a publishable or anon key', () => {
    expect(evaluateSupabaseConfig(URL_OK, publishable)).toEqual({ status: 'ready', url: URL_OK, key: publishable })
    expect(evaluateSupabaseConfig(URL_OK, jwt('anon'))).toMatchObject({ status: 'ready' })
  })
  it('REFUSES a secret or service-role key', () => {
    for (const k of [secret, jwt('service_role')]) {
      expect(evaluateSupabaseConfig(URL_OK, k)).toMatchObject({ status: 'invalid', reason: 'secret_key' })
    }
  })
  it('refuses an unrecognised key and a bad URL', () => {
    expect(evaluateSupabaseConfig(URL_OK, 'whatever')).toMatchObject({ status: 'invalid', reason: 'unrecognised_key' })
    expect(evaluateSupabaseConfig('http://example.com', publishable)).toMatchObject({ status: 'invalid', reason: 'url' })
  })
  it('never echoes the key or URL in its messages', () => {
    const values = [secret, jwt('service_role'), publishable, 'https://user:hunter2@abc.supabase.co']
    for (const v of values) {
      for (const [u, k] of [[URL_OK, v], [v, publishable]] as const) {
        const r = evaluateSupabaseConfig(u, k)
        const text = JSON.stringify(r.status === 'invalid' ? r.message : '')
        expect(text).not.toContain(v)
        expect(text).not.toContain('hunter2')
      }
    }
  })
})
