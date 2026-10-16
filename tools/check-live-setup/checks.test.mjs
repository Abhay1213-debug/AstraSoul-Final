import { describe, expect, it, vi } from 'vitest'
import { checkUrl, classifyKey, runChecks } from './checks.mjs'

const KEY = 'sb_publishable_' + 'A'.repeat(24)
const URL = 'https://abcdefghijklmnop.supabase.co'
const json = (status, body) => ({ status, json: async () => body })

/** A stand-in for the network: answers like a correctly installed project unless overridden. */
function projectFetch(over = {}) {
  const good = {
    '/auth/v1/settings': json(200, { external: { email: true, anonymous_users: false }, disable_signup: false, mailer_autoconfirm: false }),
    '/rest/v1/services': json(200, ['numerology', 'palmistry', 'gemstone-guidance', 'color-therapy'].map((slug) => ({ slug, name: slug, active: true }))),
    '/rest/v1/service_prices': json(200, Array.from({ length: 12 }, (_, i) => ({ service_slug: 's', mode: 'chat', amount_minor: null, i }))),
    '/rest/v1/experts': json(200, []),
    '/rest/v1/expert_services': json(200, []),
    '/rest/v1/': json(406, { code: 'PGRST106' }),
  }
  for (const t of ['profiles', 'staff_members', 'consent_versions', 'consultation_requests', 'request_notes', 'payments', 'app_settings', 'audit_log']) good[`/rest/v1/${t}`] = json(401, { code: '42501' })
  const table = { ...good, ...over }
  return vi.fn(async (u) => {
    const path = new globalThis.URL(u).pathname
    if (!(path in table)) return json(404, {})
    const r = table[path]
    if (r instanceof Error) throw r
    return r
  })
}

const verdict = (rows) => rows.at(-1).result
const find = (rows, text) => rows.find((r) => r.check.includes(text))

describe('classifyKey / checkUrl', () => {
  it('recognises public and secret keys', () => {
    expect(classifyKey(KEY)).toBe('publishable')
    expect(classifyKey('sb_secret_abc')).toBe('secret')
    const jwt = (role) => ['e30', Buffer.from(JSON.stringify({ role })).toString('base64url'), 'sig'].join('.')
    expect(classifyKey(jwt('anon'))).toBe('anon-jwt')
    expect(classifyKey(jwt('service_role'))).toBe('service-role-jwt')
    expect(classifyKey('nonsense')).toBe('unknown')
  })
  it('accepts only a plain https project address', () => {
    expect(checkUrl(URL)).toBe(URL)
    for (const bad of ['http://x.supabase.co', 'https://u:p@x.supabase.co', 'https://x.supabase.co/rest', '', 'nope']) expect(checkUrl(bad), bad).toBeNull()
  })
})

describe('runChecks (stand-in network; no real project is contacted)', () => {
  it('a correctly installed project gets OK', async () => {
    const rows = await runChecks({ url: URL, key: KEY, fetchFn: projectFetch() })
    expect(rows.filter((r) => r.result === 'PROBLEM' || r.result === 'UNKNOWN')).toEqual([])
    expect(verdict(rows)).toBe('OK')
  })

  it('only ever sends GET requests, with the public key only, to the project address', async () => {
    const f = projectFetch()
    await runChecks({ url: URL, key: KEY, fetchFn: f })
    for (const [u, init] of f.mock.calls) {
      expect(init.method).toBe('GET')
      expect(u.startsWith(URL)).toBe(true)
      expect(init.headers.apikey).toBe(KEY)
    }
  })

  it('refuses to use a secret key at all: nothing is sent anywhere', async () => {
    const f = projectFetch()
    const rows = await runChecks({ url: URL, key: 'sb_secret_whatever', fetchFn: f })
    expect(f).not.toHaveBeenCalled()
    expect(verdict(rows)).toBe('STOP')
    expect(JSON.stringify(rows)).not.toContain('sb_secret_whatever')
  })

  it('never prints the key', async () => {
    const rows = await runChecks({ url: URL, key: KEY, fetchFn: projectFetch() })
    expect(JSON.stringify(rows)).not.toContain(KEY)
  })

  it('STOP when a private table returns rows to the public key', async () => {
    const rows = await runChecks({ url: URL, key: KEY, fetchFn: projectFetch({ '/rest/v1/payments': json(200, [{ id: 'x' }]) }) })
    expect(find(rows, 'payments').result).toBe('PROBLEM')
    expect(verdict(rows)).toBe('STOP')
  })

  it('STOP when the private schema is exposed, or e-mail confirmation is switched off, or sign-ups are disabled', async () => {
    expect(verdict(await runChecks({ url: URL, key: KEY, fetchFn: projectFetch({ '/rest/v1/': json(200, {}) }) }))).toBe('STOP')
    expect(find(await runChecks({ url: URL, key: KEY, fetchFn: projectFetch({ '/auth/v1/settings': json(200, { external: { email: true }, disable_signup: false, mailer_autoconfirm: true }) }) }), 'confirmation').result).toBe('PROBLEM')
    expect(find(await runChecks({ url: URL, key: KEY, fetchFn: projectFetch({ '/auth/v1/settings': json(200, { external: { email: true }, disable_signup: true, mailer_autoconfirm: false }) }) }), 'sign-ups').result).toBe('PROBLEM')
  })

  it('STOP when the database is not installed in the project (services missing)', async () => {
    const rows = await runChecks({ url: URL, key: KEY, fetchFn: projectFetch({ '/rest/v1/services': json(404, { code: 'PGRST205' }) }) })
    expect(find(rows, 'four services').result).toBe('PROBLEM')
    expect(verdict(rows)).toBe('STOP')
  })

  it('reports what it cannot see as UNKNOWN, never as OK', async () => {
    const rows = await runChecks({ url: URL, key: KEY, fetchFn: projectFetch({ '/auth/v1/settings': json(200, {}) }) })
    expect(find(rows, 'anonymous').result).toBe('UNKNOWN')
    expect(verdict(rows)).toBe('MANUAL CHECK NEEDED')
  })

  it('a network failure is a PROBLEM, not a pass', async () => {
    const f = vi.fn(async () => { throw new TypeError('fetch failed') })
    const rows = await runChecks({ url: URL, key: KEY, fetchFn: f })
    expect(verdict(rows)).toBe('STOP')
  })
})
