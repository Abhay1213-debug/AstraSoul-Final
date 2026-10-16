import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Repository-wide guard: privileged credentials must never appear in the project, because everything
 * under src/ and public/ ships to every visitor's browser, and everything else gets committed.
 * Failing this test means a secret (or something shaped like one) was added. Remove it and ROTATE it.
 */
const ROOT = process.cwd()
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.claude'])
// The only files allowed to mention these words: the validator that detects them, and its tests.
const ALLOW_WORDS = new Set(['src/lib/supabaseConfig.ts', 'src/lib/supabaseConfig.test.ts', 'src/lib/supabase.test.ts', 'src/test/noSecrets.test.ts', 'tools/check-live-setup/checks.mjs', 'tools/check-live-setup/checks.test.mjs'])
const TEXT_EXT = /\.(ts|tsx|js|jsx|json|md|html|css|svg|txt|sql|toml|yml|yaml|example|env)$|^\.env/i

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (TEXT_EXT.test(name) && name !== 'package-lock.json' && st.size < 1_000_000) out.push(p)
  }
  return out
}

const files = walk(ROOT).map((p) => ({ rel: relative(ROOT, p).replace(/\\/g, '/'), text: readFileSync(p, 'utf8') }))

const PATTERNS: [string, RegExp, boolean][] = [
  // [label, regex, allowedInDetectorFiles]
  ['sb_secret_ key', /sb_secret_[A-Za-z0-9_-]{8,}/, true],
  ['service-role identifier', /service_role/, true],
  ['SUPABASE_SERVICE… variable', /SUPABASE_SERVICE/i, false],
  ['database connection string with password', /postgres(?:ql)?:\/\/[^\s"'`:/]+:[^\s"'`@]+@/i, false],
  ['JWT-shaped token', /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/, false],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/, false],
  ['browser-exposed variable named like a secret', /VITE_[A-Z0-9_]*(?:SECRET|SERVICE|PASSWORD|PRIVATE)[A-Z0-9_]*/, false],
]

describe('no privileged credentials in the repository', () => {
  it('scans a sensible number of files', () => {
    expect(files.length).toBeGreaterThan(40)
  })

  for (const [label, re, allowedInDetectors] of PATTERNS) {
    it(`contains no ${label}`, () => {
      const hits = files
        .filter((f) => !(allowedInDetectors && ALLOW_WORDS.has(f.rel)) && !f.rel.endsWith('noSecrets.test.ts'))
        .filter((f) => re.test(f.text))
        .map((f) => f.rel)
      expect(hits).toEqual([])
    })
  }

  it('.env.example documents the two public Supabase values and leaves them empty', () => {
    const env = files.find((f) => f.rel === '.env.example')!.text
    expect(env).toMatch(/^VITE_SUPABASE_URL=$/m)
    expect(env).toMatch(/^VITE_SUPABASE_PUBLISHABLE_KEY=$/m)
    // no Supabase variable in the example may carry a value
    expect(env).not.toMatch(/^VITE_SUPABASE_[A-Z_]+=\S+/m)
  })

  it('.gitignore keeps real env files out of Git but allows the example', () => {
    const ig = readFileSync(join(ROOT, '.gitignore'), 'utf8').split('\n').map((l) => l.trim())
    expect(ig).toContain('.env')
    expect(ig).toContain('.env.*')
    expect(ig).toContain('!.env.example')
    expect(ig).toContain('*.local')
  })

  it('no real .env files exist in the project folder with Supabase secrets (only the example is tracked)', () => {
    const real = readdirSync(ROOT).filter((n) => /^\.env/.test(n) && n !== '.env.example')
    for (const n of real) {
      const text = readFileSync(join(ROOT, n), 'utf8')
      expect(text, `${n} must not contain a secret/service-role key`).not.toMatch(/sb_secret_|service_role|SUPABASE_SERVICE/)
    }
  })
})
