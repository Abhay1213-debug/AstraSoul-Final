/**
 * Pure validation of the browser-side Supabase configuration. No network, no SDK import, so it is
 * fully unit-testable.
 *
 * Purpose: make it hard to ship a privileged credential to the browser by mistake. The browser may only
 * ever hold the PUBLIC project URL and a PUBLIC (publishable or legacy "anon") key; everything else is
 * protected by Row Level Security in the database. If a secret / service-role key (or anything we do not
 * recognise) is supplied, the client is NOT created.
 *
 * Messages below never echo the key or URL value, so they are safe to show or log.
 */

export type KeyKind = 'publishable' | 'anon-jwt' | 'secret' | 'service-role-jwt' | 'unknown'

const PUBLISHABLE_RE = /^sb_publishable_[A-Za-z0-9_-]{20,}$/
const SECRET_RE = /^sb_secret_/
const B64URL_RE = /^[A-Za-z0-9_-]+$/

function decodeJwtRole(token: string): string | undefined {
  const parts = token.split('.')
  if (parts.length !== 3 || !parts.every((p) => B64URL_RE.test(p))) return undefined
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
    const role = (JSON.parse(json) as { role?: unknown }).role
    return typeof role === 'string' ? role : undefined
  } catch {
    return undefined
  }
}

/** Classifies a key without ever returning or logging its value. */
export function inspectKey(raw: string): KeyKind {
  const key = raw.trim()
  if (!key || /\s/.test(key)) return 'unknown'
  if (SECRET_RE.test(key)) return 'secret'
  if (PUBLISHABLE_RE.test(key)) return 'publishable'
  const role = decodeJwtRole(key)
  if (role === 'anon') return 'anon-jwt'
  if (role === 'service_role') return 'service-role-jwt'
  return 'unknown'
}

export type UrlProblem = 'malformed' | 'insecure' | 'credentials' | 'path'

/** https only (plain http is allowed solely for a local test stack); no credentials, path or query. */
export function inspectUrl(raw: string): { ok: true; origin: string } | { ok: false; problem: UrlProblem } {
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return { ok: false, problem: 'malformed' }
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return { ok: false, problem: 'insecure' }
  if (u.username || u.password) return { ok: false, problem: 'credentials' }
  if ((u.pathname !== '/' && u.pathname !== '') || u.search || u.hash) return { ok: false, problem: 'path' }
  return { ok: true, origin: u.origin }
}

export type ConfigResult =
  | { status: 'not_configured' }
  | { status: 'invalid'; reason: 'incomplete' | 'url' | 'secret_key' | 'unrecognised_key'; message: string }
  | { status: 'ready'; url: string; key: string }

export function evaluateSupabaseConfig(urlRaw: string | undefined, keyRaw: string | undefined): ConfigResult {
  const url = (urlRaw ?? '').trim()
  const key = (keyRaw ?? '').trim()
  if (!url && !key) return { status: 'not_configured' }
  if (!url || !key) {
    return { status: 'invalid', reason: 'incomplete', message: 'Both the Supabase URL and the publishable key must be set, or neither.' }
  }
  const u = inspectUrl(url)
  if (!u.ok) {
    return { status: 'invalid', reason: 'url', message: `The Supabase URL is not acceptable (${u.problem}). Use the bare project URL over https.` }
  }
  const kind = inspectKey(key)
  if (kind === 'secret' || kind === 'service-role-jwt') {
    return {
      status: 'invalid',
      reason: 'secret_key',
      message: 'A secret/service-role key was supplied. This is refused: such a key must never be used in the browser. Use the publishable key and rotate the exposed key in the Supabase dashboard.',
    }
  }
  if (kind === 'unknown') {
    return { status: 'invalid', reason: 'unrecognised_key', message: 'The Supabase key is not a recognised publishable (sb_publishable_…) or anon key.' }
  }
  return { status: 'ready', url: u.origin, key }
}
