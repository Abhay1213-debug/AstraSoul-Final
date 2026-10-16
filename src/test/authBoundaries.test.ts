import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { accountsEnabled, loadDefaultAuthService } from '../lib/auth/createAuthService'

/**
 * Structural rules for the account screens, checked on the source text. They protect the design decisions:
 * one adapter talks to Supabase, accounts are OFF by default, nothing sensitive is logged or stored by our code.
 */
const SRC = join(process.cwd(), 'src')
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}
const files = walk(SRC).map((p) => ({ rel: relative(SRC, p).replace(/\\/g, '/'), text: readFileSync(p, 'utf8') }))
const isTest = (rel: string) => /\.test\.tsx?$/.test(rel) || rel.startsWith('test/')
const app = files.filter((f) => !isTest(f.rel))
const authCode = app.filter((f) => f.rel.startsWith('lib/auth/') || f.rel.startsWith('lib/data/') || ['components/AuthForms.tsx', 'components/AdminShell.tsx', 'components/RequestManage.tsx', 'components/RequestParts.tsx', 'components/ProfileCard.tsx', 'pages/Account.tsx', 'pages/Admin.tsx', 'pages/MyRequest.tsx'].includes(f.rel))

describe('accounts are OFF unless explicitly switched on', () => {
  it('needs exactly VITE_ACCOUNTS_ENABLED="true"', () => {
    expect(accountsEnabled({})).toBe(false)
    for (const v of ['', '1', 'yes', 'TRUE', 'True', ' true', 'false']) expect(accountsEnabled({ VITE_ACCOUNTS_ENABLED: v }), v).toBe(false)
    expect(accountsEnabled({ VITE_ACCOUNTS_ENABLED: 'true' })).toBe(true)
  })
  it('creates no account service in the test/default environment (no keys, no switch)', async () => {
    expect(await loadDefaultAuthService()).toBeNull()
  })
  it('the Supabase library is loaded lazily, only after the switch is checked (so visitors do not download it while accounts are off)', () => {
    const f = readFileSync(join(SRC, 'lib/auth/createAuthService.ts'), 'utf8')
    expect(f).not.toMatch(/^import .* from ['"]\.\.\/supabase['"]/m)
    expect(f).toMatch(/import\('\.\.\/supabase'\)/)
    expect(f.indexOf('if (!accountsEnabled()) return null')).toBeLessThan(f.indexOf("import('../supabase')"))
  })
  it('.env.example documents the switch and leaves it empty', () => {
    const env = readFileSync(join(process.cwd(), '.env.example'), 'utf8')
    expect(env).toMatch(/^VITE_ACCOUNTS_ENABLED=$/m)
  })
})

describe('where Supabase may be touched', () => {
  it('only the client wrapper, the config checker and the two auth adapter files import it', () => {
    const allowed = new Set(['lib/supabase.ts', 'lib/supabaseConfig.ts', 'lib/auth/supabaseAuth.ts', 'lib/auth/createAuthService.ts', 'lib/data/supabaseData.ts', 'lib/data/createDataService.ts'])
    const importers = app.filter((f) => /from ['"]@supabase\/supabase-js['"]|from ['"](\.\.?\/)+(lib\/)?supabase(Config)?['"]|import\(['"](\.\.?\/)+(lib\/)?supabase(Config)?['"]\)/.test(f.text)).map((f) => f.rel)
    expect(importers.filter((r) => !allowed.has(r))).toEqual([])
    // no page or component talks to the client directly
    // (pages/Legal.tsx only NAMES the provider in the privacy text; it imports nothing)
    expect(app.filter((f) => /^(pages|components)\//.test(f.rel) && f.rel !== 'pages/Legal.tsx' && /supabase/i.test(f.text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''))).map((f) => f.rel)).toEqual([])
  })
  it('the site never imports the test stand-in', () => {
    expect(app.filter((f) => /from ['"](\.\.?\/)+test\//.test(f.text)).map((f) => f.rel)).toEqual([])
  })
})

describe('what the account code must never do', () => {
  it('never logs (console.*) anything', () => {
    expect(authCode.filter((f) => /\bconsole\./.test(f.text)).map((f) => f.rel)).toEqual([])
  })
  it('never stores anything itself (the sign-in library manages its own session)', () => {
    expect(authCode.filter((f) => /localStorage|sessionStorage|indexedDB|document\.cookie/.test(f.text)).map((f) => f.rel)).toEqual([])
  })
  it('never puts a password in a URL, a query string or a message', () => {
    for (const f of authCode) {
      expect(f.text, f.rel).not.toMatch(/[?&]password=|(\bnavigate\(|\bhref=|\bto=|\bredirectTo:|\bemailRedirectTo:)[^\n;>]*(?<!-)\bpassword\b/i)
    }
  })
  it('never uses innerHTML-style rendering for names or messages', () => {
    expect(authCode.filter((f) => /dangerouslySetInnerHTML|innerHTML/.test(f.text)).map((f) => f.rel)).toEqual([])
  })
  it('never decides who may do what: no role/admin/staff logic in the browser account code', () => {
    // The ONE exception: the data adapter reads the account's OWN staff row so the site can choose which menu to show.
    // That is display only; the database decides access (Row Level Security + the authenticator check).
    const display = 'lib/data/supabaseData.ts'
    expect(authCode.filter((f) => f.rel !== display && /\b(is_admin|isAdmin|role\s*===|app_metadata|user_metadata\.role|staff_members)\b/.test(f.text)).map((f) => f.rel)).toEqual([])
    expect(authCode.filter((f) => /\b(is_admin|isAdmin|app_metadata|user_metadata\.role)\b/.test(f.text)).map((f) => f.rel)).toEqual([])
  })
  it('only the sign-up adapter reads profile metadata, and only the display name', () => {
    const reads = app.flatMap((f) => [...f.text.matchAll(/user_metadata[^\n;]*/g)].map((m) => `${f.rel}: ${m[0]}`))
    for (const r of reads) expect(r).toMatch(/full_name/)
  })
})
