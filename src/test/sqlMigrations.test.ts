import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * STATIC checks on the Supabase SQL files. They read the SQL TEXT. They do NOT run any SQL and do NOT prove the database
 * behaves correctly: a static test can pass while the SQL is wrong. They exist to stop the SECURITY CONVENTIONS in the files
 * from silently regressing. Three kinds of evidence exist (see supabase/README.md section 8):
 *   1. STATIC       - this file.
 *   2. SIMULATED SQL - supabase/tests/isolation_tests.sql, which the owner runs in the SQL Editor (not run yet).
 *   3. REAL-SESSION  - supabase/tests/REAL_SESSION_VALIDATION.md, done by a person with real logins (not done yet).
 *
 * Every assertion below is made PER STATEMENT (the SQL is split into statements first, comments removed, dollar-quoted
 * bodies kept whole), so a later statement can never satisfy a check about an earlier function, grant or policy.
 */
const ROOT = join(process.cwd(), 'supabase')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

/** Splits SQL into statements: removes `--` comments, keeps '...' and $tag$...$tag$ bodies intact, splits on `;` outside them. */
function statements(sql: string): string[] {
  const out: string[] = []
  let cur = ''
  let i = 0
  let dollar: string | null = null
  let single = false
  const n = sql.length
  const skipComment = () => {
    while (i < n && sql[i] !== '\n') i++
  }
  while (i < n) {
    const ch = sql[i]
    const two = sql.slice(i, i + 2)
    if (dollar) {
      if (sql.startsWith(dollar, i)) {
        cur += dollar
        i += dollar.length
        dollar = null
        continue
      }
      if (two === '--') {
        skipComment()
        continue
      }
      cur += ch
      i++
      continue
    }
    if (single) {
      cur += ch
      if (ch === "'") {
        if (sql[i + 1] === "'") {
          cur += "'"
          i += 2
          continue
        }
        single = false
      }
      i++
      continue
    }
    if (two === '--') {
      skipComment()
      continue
    }
    if (ch === "'") {
      single = true
      cur += ch
      i++
      continue
    }
    if (ch === '$') {
      const m = /^\$[A-Za-z_]*\$/.exec(sql.slice(i))
      if (m) {
        dollar = m[0]
        cur += m[0]
        i += m[0].length
        continue
      }
    }
    if (ch === ';') {
      if (cur.trim()) out.push(cur.trim())
      cur = ''
      i++
      continue
    }
    cur += ch
    i++
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()
const stripQuoted = (s: string) => s.replace(/'(?:[^']|'')*'/g, "''")

const TABLES = [
  'profiles', 'staff_members', 'services', 'service_prices', 'experts', 'expert_services', 'consent_versions',
  'consultation_requests', 'request_notes', 'payments', 'app_settings', 'audit_log',
]

const migrationFiles = readdirSync(join(ROOT, 'migrations')).filter((f) => f.endsWith('.sql')).sort()
const byKey = (key: string) => migrationFiles.find((f) => f.includes(key))!
const stmtsOf = (file: string) => statements(read(`migrations/${file}`))
const allStmts = migrationFiles.flatMap((f) => stmtsOf(f).map((raw) => ({ file: f, raw, n: norm(raw) })))
const allCode = allStmts.map((s) => s.raw).join(';\n')

// ---- functions ----------------------------------------------------------------------------------------------------
interface Fn { name: string; types: string[]; key: string; header: string; raw: string; definer: boolean }
const splitTypes = (args: string) =>
  args.trim() === '' ? [] : args.split(',').map((a) => a.trim().split(/\s+/)[1]!.toLowerCase())
const fns: Fn[] = allStmts
  .filter((s) => /^create or replace function\s/i.test(s.raw))
  .map((s) => {
    const m = /^create or replace function\s+([\w.]+)\s*\(([^)]*)\)/i.exec(s.raw)!
    const types = splitTypes(m[2]!)
    const header = s.raw.split(/\bas\s+\$\$/i)[0]!
    return { name: m[1]!.toLowerCase(), types, key: `${m[1]!.toLowerCase()}(${types.join(', ')})`, header, raw: s.raw, definer: /security definer/i.test(header) }
  })
const fn = (name: string) => fns.find((f) => f.name === name)!

// ---- grants / revokes ---------------------------------------------------------------------------------------------
const grants = allStmts
  .filter((s) => /^grant\s/i.test(s.raw))
  .map((s) => {
    const m = /^grant\s+([\s\S]+?)\s+on\s+([\s\S]+?)\s+to\s+([\s\S]+)$/i.exec(s.raw)!
    return { file: s.file, privs: norm(m[1]!), target: norm(m[2]!), to: norm(m[3]!).split(',').map((x) => x.trim()), full: s.n }
  })
const fnRevokes = allStmts
  .filter((s) => /^revoke all on function\s/i.test(s.raw))
  .map((s) => {
    const m = /^revoke all on function\s+([\w.]+)\s*\(([^)]*)\)\s+from\s+([\s\S]+)$/i.exec(s.raw)!
    const types = m[2]!.trim() === '' ? [] : m[2]!.split(',').map((t) => t.trim().toLowerCase())
    return { key: `${m[1]!.toLowerCase()}(${types.join(', ')})`, from: norm(m[3]!).split(',').map((x) => x.trim()) }
  })

// ---- policies -----------------------------------------------------------------------------------------------------
interface Policy { name: string; table: string; cmd: string; to: string[]; text: string }
const policies: Policy[] = allStmts
  .filter((s) => /^create policy\s/i.test(s.raw))
  .map((s) => {
    const m = /^create policy\s+(\w+)\s+on\s+public\.(\w+)\s+for\s+(\w+)\s+to\s+([\w,\s]+?)\s+(?:using|with check)\b/i.exec(s.raw)!
    return { name: m[1]!, table: m[2]!, cmd: m[3]!.toLowerCase(), to: m[4]!.toLowerCase().split(',').map((x) => x.trim()), text: s.n }
  })

describe('migration files (static)', () => {
  it('exist in the intended order', () => {
    expect(migrationFiles.map((f) => f.split('_').slice(1).join('_'))).toEqual([
      'foundation.sql', 'tables.sql', 'functions_and_triggers.sql', 'rpc_functions.sql', 'rls_and_grants.sql', 'seed_reference_data.sql',
    ])
    const stamps = migrationFiles.map((f) => f.split('_')[0])
    expect([...stamps].sort()).toEqual(stamps)
  })

  it('parse into a sensible number of statements (guards the splitter used by every other test)', () => {
    expect(allStmts.length).toBeGreaterThan(250)
    expect(fns.length).toBe(24) // 20 in schema private + the 4 public RPC functions
    expect(policies.length).toBeGreaterThan(30)
    expect(grants.length).toBeGreaterThan(15)
  })

  it('create exactly the 12 Phase 1 tables, each marked as ours', () => {
    const created = allStmts.map((s) => /^create table if not exists public\.(\w+)/i.exec(s.raw)?.[1]).filter(Boolean).sort()
    expect(created).toEqual([...TABLES].sort())
    for (const t of TABLES) {
      expect(allStmts.some((s) => s.n === `comment on table public.${t} is 'astrasoul:phase1'`), `no marker for ${t}`).toBe(true)
    }
  })

  it('switch RLS on and revoke API access in the VERY NEXT statements after each table is created, before any index', () => {
    const tables = stmtsOf(byKey('tables')).map(norm)
    for (const t of TABLES) {
      const iCreate = tables.findIndex((s) => s.startsWith(`create table if not exists public.${t} `) || s.startsWith(`create table if not exists public.${t}(`))
      expect(iCreate, `${t} not created in the tables migration`).toBeGreaterThanOrEqual(0)
      // adjacency: nothing at all may sit between the table, its RLS switch and its revoke
      expect(tables[iCreate + 1], `${t}: RLS is not the very next statement`).toBe(`alter table public.${t} enable row level security`)
      expect(tables[iCreate + 2], `${t}: the revoke is not right after RLS`).toBe(`revoke all on table public.${t} from anon, authenticated`)
      // every index of this table comes AFTER its lock-down
      for (const [i, st] of tables.entries()) {
        if (new RegExp(`^create (unique )?index if not exists \\w+\\s+on public\\.${t}\\b`).test(st)) {
          expect(i, `an index on ${t} is created before the table is locked down`).toBeGreaterThan(iCreate + 2)
        }
      }
    }
    // the grants migration re-asserts both, for every table
    const rls = stmtsOf(byKey('rls_and_grants')).map(norm)
    for (const t of TABLES) {
      expect(rls, `0500 does not enable RLS on ${t}`).toContain(`alter table public.${t} enable row level security`)
    }
    const blanket = rls.find((s) => s.startsWith('revoke all on table'))!
    for (const t of TABLES) expect(blanket, `0500 blanket revoke misses ${t}`).toContain(`public.${t}`)
  })

  it('every migration that can collide with existing objects begins with a guard that stops before changing anything', () => {
    for (const key of ['foundation', 'tables', 'functions_and_triggers', 'rpc_functions']) {
      const first = stmtsOf(byKey(key))[0]!
      expect(first, key).toMatch(/^do \$guard\$/i)
      expect(first, key).toMatch(/MIGRATION STOPPED/)
    }
    expect(stmtsOf(byKey('foundation'))[1]!).toMatch(/^do \$guard\$/i) // the type guard also runs before anything is created
    const tablesStmts = stmtsOf(byKey('tables'))
    expect(tablesStmts[1]!, 'the index guard must be the second statement of 0200').toMatch(/^do \$guard\$/i)
    expect(tablesStmts[1]!).toMatch(/MIGRATION STOPPED/)
    for (const ix of ['payments_reference_active', 'payments_one_pending_per_request']) expect(tablesStmts[1]!, ix).toContain(ix)
    const idxSchema = stmtsOf(byKey('foundation')).findIndex((s) => /^create schema/i.test(s))
    expect(idxSchema).toBeGreaterThan(1)
  })

  it('never contain destructive statements (those live only in the guarded teardown script)', () => {
    const drops = [...allCode.matchAll(/\bdrop\s+(\w+)/gi)].map((m) => m[1]!.toLowerCase())
    expect([...new Set(drops)].sort()).toEqual(['policy', 'trigger'])
    // the ONLY allowed mention of the word is the audit-log PROTECTION trigger ("before truncate on public.audit_log")
    expect(allCode.replace(/before truncate on public\.audit_log/gi, '')).not.toMatch(/\btruncate\b/i)
    expect(allStmts.filter((s) => /^truncate\b/i.test(s.raw))).toEqual([])
    expect(allCode).not.toMatch(/\bdelete\s+from\b/i)
    expect(allCode.replace(/on (delete|update) cascade/gi, '')).not.toMatch(/\bcascade\b/i)
  })

  it('never create extensions or roles, or touch Auth settings or sessions', () => {
    for (const bad of [/create\s+extension/i, /create\s+role/i, /alter\s+role/i, /alter\s+user/i, /alter\s+database/i, /\bset\s+session\s+authorization\b/i]) {
      expect(allCode).not.toMatch(bad)
    }
  })

  it('only the three expected triggers are ever created on auth.users, each calling a function in schema private', () => {
    const onAuth = allStmts.filter((s) => /^create trigger\s/i.test(s.raw) && /on auth\.users/i.test(s.raw))
    expect(onAuth.map((s) => /^create trigger\s+(\w+)/i.exec(s.raw)![1]).sort()).toEqual(['on_auth_user_created', 'on_auth_user_deleted', 'on_auth_user_email_changed'])
    for (const s of onAuth) expect(s.raw).toMatch(/execute function private\./i)
  })
})

describe('functions (static, per function)', () => {
  it('EVERY function pins search_path to the empty string', () => {
    for (const f of fns) expect(f.header, `${f.key} does not pin search_path`).toMatch(/set search_path\s*=\s*''/i)
  })

  it('every function is revoked from PUBLIC, anon AND authenticated by its OWN statement', () => {
    for (const f of fns) {
      const mine = fnRevokes.filter((r) => r.key === f.key)
      expect(mine.length, `${f.key} has no revoke statement`).toBe(1)
      for (const role of ['public', 'anon', 'authenticated']) expect(mine[0]!.from, `${f.key} not revoked from ${role}`).toContain(role)
    }
  })

  it('execute is granted ONLY to authenticated, and only on the nine functions that must be callable by logged-in users', () => {
    const exec = grants.filter((g) => g.privs === 'execute')
    for (const g of exec) expect(g.to, g.full).toEqual(['authenticated'])
    const names = exec.map((g) => g.target.replace(/^function\s+/, '').replace(/\(.*$/, '')).sort()
    expect(names).toEqual([
      'private.confirmation_problem', 'private.is_admin', 'private.is_staff_account', 'private.staff_expert_id', 'private.staff_role',
      'public.cancel_my_request', 'public.refund_payment', 'public.submit_payment_reference', 'public.verify_payment',
    ])
    // each grant must follow the matching revoke of the same function (order within the file)
    for (const g of exec) {
      const key = g.target.replace(/^function\s+/, '')
      const f = fns.find((x) => x.key.replace(/\s/g, '') === key.replace(/\s/g, ''))
      expect(f, `grant for unknown function ${key}`).toBeTruthy()
    }
  })

  it('internal helpers are NOT executable by API roles (mfa_session_ok, anonymise_customer, every trigger function)', () => {
    const granted = new Set(grants.filter((g) => g.privs === 'execute').map((g) => g.target))
    for (const f of fns) {
      if (/^private\.(tg_|handle_|sync_|anonymise_|mfa_session_ok)/.test(f.name)) {
        expect([...granted].some((t) => t.includes(f.name)), `${f.name} must not be granted`).toBe(false)
      }
    }
  })

  it('all privileged logic uses schema-qualified application objects (no unqualified table access)', () => {
    for (const f of fns) {
      const body = stripQuoted(f.raw.slice(f.header.length))
      const bad = [...body.matchAll(/\b(?:from|join|into|update|insert into)\s+(profiles|staff_members|services|service_prices|experts|expert_services|consent_versions|consultation_requests|request_notes|payments|app_settings|audit_log)\b/gi)]
      expect(bad.map((m) => m[0]), `${f.key} uses an unqualified table`).toEqual([])
    }
  })

  it('error messages are short machine codes: no customer data, no row echo', () => {
    for (const f of fns) {
      for (const m of f.raw.matchAll(/raise exception\s+'([^']*)'(?:\s*,\s*(\w+))?/gi)) {
        const msg = m[1]!
        if (msg === '%') {
          expect(m[2], `${f.key}: only a code variable may be formatted into a message`).toBe('v_problem')
        } else {
          expect(msg, `${f.key}: message is not a plain code`).toMatch(/^[a-z][a-z0-9_]*$/)
        }
      }
    }
    // the guard blocks may name OBJECTS (never data) and must say they changed nothing
    for (const s of allStmts.filter((x) => /^do \$guard\$/i.test(x.raw))) {
      expect(s.raw).toMatch(/Nothing was changed/)
      expect(s.raw).not.toMatch(/\b(new|old)\./i)
    }
  })
})

describe('authentication, MFA and roles (static)', () => {
  it('the MFA session check needs the aal2 claim AND a currently verified TOTP factor', () => {
    const f = fn('private.mfa_session_ok')
    expect(f.raw).toMatch(/'aal'/)
    expect(f.raw).toMatch(/'aal2'/)
    expect(f.raw).toMatch(/auth\.mfa_factors/)
    expect(f.raw).toMatch(/f\.status = 'verified'/)
    expect(f.raw).toMatch(/f\.factor_type = 'totp'/)
    expect(f.definer).toBe(true)
  })

  it('the role helpers read the staff table on every call and require the MFA check', () => {
    for (const name of ['private.staff_role', 'private.staff_expert_id']) {
      const f = fn(name)
      expect(f.raw, name).toMatch(/public\.staff_members/)
      expect(f.raw, name).toMatch(/\.active/)
      expect(f.raw, name).toMatch(/private\.mfa_session_ok\(/)
      expect(f.raw, name).toMatch(/auth\.uid\(\)/)
    }
    expect(fn('private.staff_expert_id').raw).toMatch(/s\.role = 'staff'/)
    expect(fn('private.is_admin').raw).toMatch(/coalesce\(/i)
  })

  it('role assignment requires a verified TOTP factor and protects the last admin', () => {
    const g = fn('private.tg_staff_members_guard')
    expect(g.raw).toMatch(/auth\.mfa_factors/)
    expect(g.raw).toMatch(/f\.status = 'verified'/)
    expect(g.raw).toMatch(/f\.factor_type = 'totp'/)
    expect(g.raw).toMatch(/mfa_factor_required/)
    expect(g.raw).toMatch(/last_admin/)
  })

  it('NO authorisation decision reads user_metadata / app_metadata; the only metadata read is the display name at signup', () => {
    expect(allCode).not.toMatch(/user_metadata|app_metadata|raw_app_meta_data/i)
    const reads = [...allCode.matchAll(/raw_user_meta_data[^\n;]*/gi)].map((m) => m[0])
    expect(reads.length).toBeGreaterThan(0)
    for (const r of reads) expect(r).toMatch(/'full_name'/)
    for (const p of policies) expect(p.text, p.name).not.toMatch(/meta_data|metadata|auth\.jwt/)
  })

  it('there is no way for the API to write staff_members, payments, audit_log or consent_versions', () => {
    for (const t of ['staff_members', 'payments', 'audit_log', 'consent_versions']) {
      const writes = grants.filter((g) => g.target.split(',').map((x) => x.trim()).includes(`public.${t}`) && /\b(insert|update|delete|all|truncate)\b/.test(g.privs))
      expect(writes.map((g) => g.full), `${t} must be write-locked`).toEqual([])
      expect(policies.filter((p) => p.table === t && p.cmd !== 'select').map((p) => p.name), `${t} has a write policy`).toEqual([])
    }
  })

  it('write guards use an OWNER ALLOW-LIST, not a deny-list of role names', () => {
    for (const name of ['private.tg_requests_before_update', 'private.tg_payments_guard']) {
      const f = fn(name)
      expect(f.definer, `${name} must run as the caller so current_user is meaningful`).toBe(false)
      expect(f.raw, name).toMatch(/pg_get_userbyid\(c\.relowner\)/)
      expect(f.raw, name).toMatch(/tg_relid/)
      expect(f.raw, name).not.toMatch(/in\s*\(\s*'authenticated'/i)
      expect(f.raw, name).not.toMatch(/'anon'/i)
    }
    expect(fn('private.tg_payments_guard').raw).toMatch(/if not v_owner then\s+raise exception 'forbidden'/)
    expect(fn('private.tg_requests_before_update').raw).toMatch(/if not v_owner then\s+v_role := private\.staff_role\(\);\s+if v_role is null then\s+raise exception 'forbidden'/)
  })

  it('a STAFF login may only add a meeting link and complete a confirmed request', () => {
    const f = fn('private.tg_requests_before_update').raw
    expect(f).toMatch(/if v_role = 'staff' then/)
    expect(f).toMatch(/old\.status = 'confirmed' and new\.status = 'completed'/)
  })
})

describe('row level security, grants and column exposure (static, per statement)', () => {
  it('give the anonymous role exactly two read grants, nothing else, and never anything to PUBLIC', () => {
    const toAnon = grants.filter((g) => g.to.includes('anon'))
    expect(toAnon.map((g) => g.full).sort()).toEqual([
      'grant select (service_slug, mode, amount_minor, currency, updated_at) on public.service_prices to anon, authenticated',
      'grant select on public.services, public.experts, public.expert_services to anon, authenticated',
    ])
    for (const g of grants) expect(g.to, g.full).not.toContain('public')
  })

  it('never grant ALL, TRUNCATE or REFERENCES; DELETE only on expert_services', () => {
    for (const g of grants.filter((x) => !x.privs.startsWith('usage') && x.privs !== 'execute')) {
      expect(g.privs, g.full).not.toMatch(/\ball\b|truncate|references|trigger/)
      if (/\bdelete\b/.test(g.privs)) expect(g.target, g.full).toBe('public.expert_services')
    }
  })

  it('staff/admin identifier columns can never be selected through the API', () => {
    const hidden = ['submitted_by', 'verified_by', 'refunded_by', 'updated_by', 'created_by', 'author_id']
    for (const t of ['payments', 'service_prices', 'app_settings', 'staff_members', 'request_notes']) {
      const sel = grants.filter((g) => g.target === `public.${t}` && /\bselect\b/.test(g.privs))
      expect(sel.length, `${t} has no select grant`).toBeGreaterThan(0)
      for (const g of sel) {
        const cols = /select\s*\(([^)]*)\)/.exec(g.privs)
        expect(cols, `${t}: select must be a COLUMN list (no table-level select)`).toBeTruthy()
        for (const h of hidden) expect(cols![1]!.split(',').map((c) => c.trim()), `${t}.${h} is selectable`).not.toContain(h)
      }
    }
  })

  it('customers can only INSERT the intended request columns, and cannot write state-controlling columns', () => {
    const ins = grants.find((g) => g.target === 'public.consultation_requests' && g.privs.startsWith('insert'))!
    const cols = /insert\s*\(([^)]*)\)/.exec(ins.privs)![1]!.split(',').map((c) => c.trim()).sort()
    expect(cols).toEqual(['concern', 'consent_version', 'date_of_birth', 'mode', 'preferred_language', 'service_slug'])
    const profileUpd = grants.find((g) => g.target === 'public.profiles' && g.privs.startsWith('update'))!
    expect(/update\s*\(([^)]*)\)/.exec(profileUpd.privs)![1]!.split(',').map((c) => c.trim()).sort()).toEqual(['date_of_birth', 'full_name', 'phone', 'preferred_language'])
  })

  it('every table has at least one policy; every policy targets only authenticated (writes) or anon/authenticated (reads)', () => {
    for (const t of TABLES) expect(policies.filter((p) => p.table === t).length, `${t} has no policy`).toBeGreaterThan(0)
    for (const p of policies) {
      expect(p.to.every((r) => r === 'authenticated' || r === 'anon'), p.name).toBe(true)
      if (p.cmd !== 'select') expect(p.to, `${p.name}: write policy must be authenticated only`).toEqual(['authenticated'])
      expect(p.text, `${p.name}: always-true write policy`).not.toMatch(p.cmd === 'select' ? /^$/ : /(using|with check)\s*\(\s*true\s*\)/)
    }
  })

  it('admin-only tables are written only by policies that call private.is_admin()', () => {
    const required: [string, string][] = [
      ['services', 'update'], ['service_prices', 'update'], ['experts', 'insert'], ['experts', 'update'],
      ['expert_services', 'insert'], ['expert_services', 'delete'], ['app_settings', 'insert'], ['app_settings', 'update'],
    ]
    for (const [t, cmd] of required) {
      const ps = policies.filter((p) => p.table === t && p.cmd === cmd)
      expect(ps.length, `${t}.${cmd}`).toBeGreaterThan(0)
      for (const p of ps) expect(p.text, p.name).toContain('private.is_admin()')
    }
  })

  it('staff privacy: the staff helper appears ONLY in policies on requests and notes, and staff never get payments, profiles or settings', () => {
    const withStaff = policies.filter((p) => p.text.includes('staff_expert_id'))
    expect([...new Set(withStaff.map((p) => p.table))].sort()).toEqual(['consultation_requests', 'request_notes'])
    for (const p of policies.filter((x) => ['profiles', 'payments', 'audit_log', 'app_settings', 'staff_members', 'consent_versions'].includes(x.table))) {
      expect(p.text, p.name).not.toContain('staff_expert_id')
    }
    // staff notes: only the general kind; payment notes stay admin-only
    const staffNotes = policies.find((p) => p.name === 'request_notes_select_staff_assigned')!
    expect(staffNotes.text).toContain("kind = 'general'")
    // no policy reads the staff table directly: they must go through the MFA-aware helpers
    for (const p of policies.filter((x) => x.table !== 'staff_members')) expect(p.text, p.name).not.toContain('staff_members')
  })

  it('staff accounts are excluded from the payment settings; the exclusion helper is used nowhere else', () => {
    const settings = policies.filter((p) => p.table === 'app_settings' && p.cmd === 'select')
    expect(settings.map((p) => p.name)).toEqual(['app_settings_select_non_staff'])
    expect(settings[0]!.text).toContain('not (select private.is_staff_account())')
    const users = policies.filter((p) => p.text.includes('is_staff_account'))
    expect(users.map((p) => p.name)).toEqual(['app_settings_select_non_staff'])
    const f = fn('private.is_staff_account').raw
    expect(f).toMatch(/s\.role = 'staff'/)
    expect(f).toMatch(/s\.active/)
    expect(f).not.toMatch(/mfa/i) // deliberately independent of the session level: it only ever REMOVES access
  })

  it('note authors are not selectable, and the note policies do not depend on the hidden author column', () => {
    for (const p of policies.filter((x) => x.table === 'request_notes')) expect(p.text, p.name).not.toContain('author_id')
  })

  it('customers have no UPDATE or DELETE policy on requests: only admin or the assigned staff login', () => {
    for (const p of policies.filter((x) => x.table === 'consultation_requests' && (x.cmd === 'update' || x.cmd === 'delete'))) {
      expect(p.text, p.name).toMatch(/private\.is_admin\(\)|private\.staff_expert_id\(\)/)
      expect(p.text, p.name).not.toMatch(/customer_id/)
    }
    expect(policies.filter((p) => p.table === 'consultation_requests' && p.cmd === 'delete')).toEqual([])
  })

  it('requests: customers insert only for themselves', () => {
    const p = policies.find((x) => x.name === 'requests_insert_own')!
    expect(p.text).toContain('customer_id = (select auth.uid())')
  })

  it('payments: customers read only payments of their own requests; nobody but the owner writes', () => {
    const own = policies.find((x) => x.name === 'payments_select_own')!
    expect(own.text).toMatch(/r\.customer_id = \(select auth\.uid\(\)\)/)
    expect(policies.filter((p) => p.table === 'payments').map((p) => p.cmd)).toEqual(['select', 'select'])
  })
})

describe('business rules enforced in the database (static)', () => {
  it('keep "refunded" out of the consultation request status', () => {
    const decl = allCode.match(/create type public\.request_status as enum \(([^)]*)\)/i)![1]!
    expect(decl).not.toMatch(/refunded/)
    expect(allCode.match(/create type public\.payment_status as enum \(([^)]*)\)/i)![1]).toMatch(/refunded/)
  })

  it('enforce the agreed anti-spam limits inside a trigger that runs for every row of every insert', () => {
    const f = fn('private.tg_requests_before_insert').raw
    expect(f).toMatch(/c_max_open\s+constant integer := 3/)
    expect(f).toMatch(/c_max_24h\s+constant integer := 10/)
    expect(f).toMatch(/pg_advisory_xact_lock/)
    expect(allStmts.some((s) => /^create trigger requests_before_insert\s+before insert on public\.consultation_requests\s+for each row/i.test(s.raw))).toBe(true)
  })

  it('validate input with generic codes BEFORE the table constraints can echo a row, and take the customer name from the profile', () => {
    const f = fn('private.tg_requests_before_insert').raw
    for (const code of ['invalid_mode', 'invalid_concern', 'invalid_date_of_birth', 'invalid_language', 'consent_version_invalid', 'profile_missing', 'account_closed']) {
      expect(f, code).toContain(code)
    }
    expect(f).toMatch(/new\.customer_name := v_name/)
    expect(f).toMatch(/consent_versions/)
    const pv = fn('private.tg_profiles_validate').raw
    for (const code of ['invalid_name', 'invalid_phone', 'invalid_date_of_birth']) expect(pv, code).toContain(code)
    expect(allStmts.some((s) => /^create trigger profiles_validate\s+before insert or update on public\.profiles/i.test(s.raw))).toBe(true)
  })

  it('no migration invents a consent version, price, expert or payment detail', () => {
    const seed = stmtsOf(byKey('seed')).join(';\n')
    expect(seed).not.toMatch(/insert into public\.experts/i)
    expect(seed).not.toMatch(/insert into public\.app_settings/i)
    expect(seed).not.toMatch(/insert into public\.consent_versions/i)
    expect(seed).not.toMatch(/amount_minor/i)
    expect(seed).not.toMatch(/astrolog|horoscope|zodiac|kundli/i)
    expect(allCode).not.toMatch(/insert into public\.consent_versions/i)
    expect([...seed.matchAll(/\('([a-z-]+)',\s*'/g)].map((m) => m[1]).sort()).toEqual(['color-therapy', 'gemstone-guidance', 'numerology', 'palmistry'])
  })

  it('confirmation needs an active expert who offers BOTH the service and the mode', () => {
    const c = fn('private.confirmation_problem').raw
    expect(c).toMatch(/e\.active/)
    expect(c).toMatch(/public\.expert_services/)
    expect(c).toMatch(/p_mode = any \(v_modes\)/)
    for (const code of ['expert_unavailable', 'expert_service_mismatch', 'expert_mode_mismatch']) expect(c).toContain(code)
    expect(fn('private.tg_requests_before_update').raw).toMatch(/private\.confirmation_problem\(new\.assigned_expert_id, new\.service_slug, new\.mode\)/)
  })

  it('payments: reference rules, payer details and separation of duties', () => {
    const idx = allStmts.find((s) => /create unique index if not exists payments_reference_active/i.test(s.raw))!
    expect(idx.n).toContain("where status in ('pending', 'succeeded', 'refunded')")
    const table = allStmts.find((s) => /^create table if not exists public\.payments\b/i.test(s.raw))!.raw
    expect(table).toMatch(/payer_name\s+text not null/)
    expect(table).toMatch(/paid_on\s+date not null/)
    expect(table).not.toMatch(/\b(note|notes|phone|vpa|upi_handle|card|account_number)\b\s+text/i)
    const submit = fn('public.submit_payment_reference').raw
    expect(submit).toMatch(/p\.submitted_by <> v_uid/)
    expect(submit).toMatch(/invalid_payer_name/)
    expect(submit).toMatch(/invalid_payment_date/)
    expect(submit).toMatch(/when check_violation then/)
    expect(fn('private.tg_payments_guard').raw).toMatch(/p\.submitted_by <> new\.submitted_by/)
    for (const name of ['public.verify_payment', 'public.refund_payment']) {
      const f = fn(name).raw
      expect(f, name).toContain('self_verification_forbidden')
      expect(f, name).toMatch(/v_pay\.submitted_by = v_uid or v_cust = v_uid/)
      expect(f, name).toMatch(/private\.is_admin\(\)/)
    }
    expect(fn('public.verify_payment').raw).toMatch(/p_received_amount_minor is distinct from v_pay\.amount_minor/)
    expect(fn('public.verify_payment').raw).toMatch(/'payment'\)/)
  })

  it('cancellation: blocked after a succeeded payment; a pending claim is left for the admin', () => {
    const c = fn('public.cancel_my_request').raw
    expect(c).toMatch(/p\.status = 'succeeded'/)
    expect(c).toContain('payment_received')
    expect(c).not.toMatch(/update public\.payments/i)
  })

  it('audit log: the allow-list holds no personal columns; only the two business payment settings are recorded by value', () => {
    const f = fn('private.tg_audit').raw
    const allow = /v_allow := case[\s\S]*?end;/i.exec(f)![0]
    for (const sensitive of ['concern', 'date_of_birth', 'phone', 'email', 'upi_reference', 'payer_name', 'paid_on', 'meeting_link', 'body', 'value', 'full_name', 'customer_name', 'bio', 'preferred_language']) {
      expect(allow, `audit allow-list includes ${sensitive}`).not.toMatch(new RegExp(`'${sensitive}'`))
    }
    expect(f).toMatch(/\(v_src ->> 'key'\) in \('upi_id', 'payee_name'\)/)
    expect(f).toMatch(/v_allow := v_allow \|\| array\['value'\]/)
    expect([...f.matchAll(/array\['value'\]/g)].length).toBe(1)
    expect(f).toMatch(/other_fields_changed/)
  })
})

describe('cancellation, payments and audit protection (static)', () => {
  it('a cancellation while a payment is pending or succeeded raises a fixed, data-free ATTENTION flag (never silent)', () => {
    const f = fn('private.tg_requests_cancel_flag')
    expect(f.definer).toBe(true)
    expect(f.raw).toMatch(/p\.status = 'succeeded'/)
    expect(f.raw).toMatch(/p\.status = 'pending'/)
    expect(f.raw).toMatch(/'system'\)/)
    expect(f.raw).not.toMatch(/update public\.payments|new\.concern|customer_name|date_of_birth/i)
    const trig = allStmts.find((s) => /^create trigger requests_cancel_flag\b/i.test(s.raw))!
    expect(trig.n).toContain('after update on public.consultation_requests')
    expect(trig.n).toContain("when (new.status = 'cancelled' and old.status is distinct from new.status)")
    const kind = allStmts.find((s) => /^create table if not exists public\.request_notes\b/i.test(s.raw))!.raw
    expect(kind).toMatch(/check \(kind in \('general', 'payment', 'system'\)\)/)
    expect(fn('public.verify_payment').raw).toMatch(/r\.status = 'cancelled'[\s\S]*'system'\)/)
  })

  it('the PIN/OTP-like rule exists both in the table and in the function', () => {
    const t = allStmts.find((s) => /^create table if not exists public\.payments\b/i.test(s.raw))!.raw
    expect(t).toMatch(/payer_name !~ '\[0-9\]\{4,\}'/)
    expect(fn('public.submit_payment_reference').raw).toMatch(/v_name ~ '\[0-9\]\{4,\}'/)
  })

  it('UPDATE, DELETE and TRUNCATE on audit_log are refused by triggers for every user, and nothing re-enables or bypasses them', () => {
    const f = fn('private.tg_audit_log_guard')
    expect(f.raw).toContain("raise exception 'audit_log_is_append_only' using errcode = 'AS403'")
    expect(f.raw).not.toMatch(/\bif\b|current_user|session_user|session_replication_role/i) // unconditional
    const change = allStmts.find((s) => /^create trigger audit_log_no_change\b/i.test(s.raw))!
    expect(change.n).toBe('create trigger audit_log_no_change before update or delete on public.audit_log for each row execute function private.tg_audit_log_guard()')
    const trunc = allStmts.find((s) => /^create trigger audit_log_no_truncate\b/i.test(s.raw))!
    expect(trunc.n).toBe('create trigger audit_log_no_truncate before truncate on public.audit_log for each statement execute function private.tg_audit_log_guard()')
    expect(allCode).not.toMatch(/disable trigger|session_replication_role/i)
    // the API roles are refused even earlier: no write grant and no write policy
    expect(grants.filter((g) => g.target === 'public.audit_log' && /\b(insert|update|delete)\b/.test(g.privs))).toEqual([])
    expect(policies.filter((p) => p.table === 'audit_log' && p.cmd !== 'select')).toEqual([])
  })

  it('no function in the migrations updates or deletes audit rows (so the protection cannot break a legitimate operation)', () => {
    for (const f of fns) expect(f.raw, f.key).not.toMatch(/(update|delete\s+from)\s+public\.audit_log/i)
  })
})

describe('data lifecycle (static)', () => {
  it('the anonymisation function is owner-only, scrubs personal fields and keeps financial records', () => {
    const f = fn('private.anonymise_customer')
    expect(f.definer).toBe(false)
    expect(f.raw).toMatch(/concern = '\[removed at customer request\]'/)
    expect(f.raw).toMatch(/payer_name = '\[removed\]'/)
    expect(f.raw).toMatch(/anonymised_at/)
    expect(f.raw).toMatch(/where n\.kind <> 'system'/)
    expect(f.raw).not.toMatch(/delete\s+from|upi_reference\s*=|amount_minor\s*=/i)
    expect(fn('private.handle_user_deleted').raw).toMatch(/private\.anonymise_customer\(old\.id, true\)/)
    // the personal-data exemption of the write guards only applies to the owner AND the transaction-local flag
    expect(fn('private.tg_requests_before_update').raw).toMatch(/v_anonymising := v_owner and/)
  })

  it('profiles and payments keep no foreign key to auth.users that would block deletion of a login', () => {
    const profiles = allStmts.find((s) => /^create table if not exists public\.profiles\b/i.test(s.raw))!.raw
    expect(profiles).not.toMatch(/references auth\.users/i)
    const payments = allStmts.find((s) => /^create table if not exists public\.payments\b/i.test(s.raw))!.raw
    expect(payments).toMatch(/submitted_by\s+uuid not null default auth\.uid\(\),/)
    expect(payments).not.toMatch(/submitted_by[^\n]*references/i)
  })
})

describe('script consistency (static)', () => {
  const privateFns = fns.filter((f) => f.name.startsWith('private.')).map((f) => f.name.replace('private.', '')).sort()
  const listFrom = (sql: string, re: RegExp) => [...sql.matchAll(re)].map((m) => m[1]!).sort()

  it('the function list in the foundation guard, the preflight and the teardown matches what the migrations create', () => {
    const foundationGuard = stmtsOf(byKey('foundation'))[0]!
    const known = /v_known\s+text\[\]\s*:=\s*array\[([\s\S]*?)\]/.exec(foundationGuard)![1]!
    expect([...known.matchAll(/'(\w+)'/g)].map((m) => m[1]!).sort()).toEqual(privateFns)

    const pre = read('scripts/00_preflight_READ_ONLY.sql')
    const preKnown = /known_private_fns\(fn\) as \(([\s\S]*?)\n\),/.exec(pre)![1]!
    expect([...preKnown.matchAll(/'(\w+)'/g)].map((m) => m[1]!).sort()).toEqual(privateFns)

    const td = read('scripts/99_teardown_DESTRUCTIVE.sql')
    expect(listFrom(td, /drop function if exists private\.(\w+)\(/g)).toEqual(privateFns)
  })

  it('every table is listed in the preflight, the post-check and the teardown', () => {
    for (const f of ['scripts/00_preflight_READ_ONLY.sql', 'scripts/90_post_migration_checks_READ_ONLY.sql', 'scripts/99_teardown_DESTRUCTIVE.sql']) {
      const t = read(f)
      for (const tb of TABLES) expect(t, `${f} does not mention ${tb}`).toContain(`'${tb}'`)
    }
  })
})

describe('helper scripts (static)', () => {
  it('the preflight and post-checks are one read-only SELECT each and end with a VERDICT row', () => {
    for (const f of ['scripts/00_preflight_READ_ONLY.sql', 'scripts/00b_preflight_AUTH_TABLES_READ_ONLY.sql', 'scripts/90_post_migration_checks_READ_ONLY.sql']) {
      const stmts = statements(read(f))
      expect(stmts.length, f).toBe(1)
      const c = stripQuoted(stmts[0]!)
      expect(c.trim().toLowerCase(), f).toMatch(/^(select|with)\b/)
      expect(c, f).not.toMatch(/\b(insert|update|delete|drop|create|alter|grant|revoke|truncate|set|execute|perform|call|do)\b/i)
      expect(stmts[0], f).toMatch(/'VERDICT'/)
    }
  })

  it('the preflight detects the conflicts the audit asked for', () => {
    const t = read('scripts/00_preflight_READ_ONLY.sql')
    for (const needle of ['private_foreign', 'trigger_conflicts', 'profile_trigger_suspects', 'handle_new_user', 'type_conflicts', 'rpc_conflicts', 'table_conflicts', "'STOP'", 'astrasoul:phase1', 'pgrst.db_schemas']) {
      expect(t, needle).toContain(needle)
    }
  })

  it('the teardown has three safeguards, no cascade, and never touches auth.users rows', () => {
    const raw = read('scripts/99_teardown_DESTRUCTIVE.sql')
    const code = statements(raw).join(';\n')
    expect(raw).toMatch(/NEVER RUN THIS DURING NORMAL SETUP/)
    expect(code).toMatch(/v_confirm\s+text := 'NO'/)
    expect(code).toMatch(/v_data_flag text := 'NO'/)
    expect(code).toMatch(/'DELETE ALL PHASE 1 DATA ' \|\| to_char\(current_date/)
    expect(code).toMatch(/I UNDERSTAND THAT DATA WILL BE PERMANENTLY LOST/)
    expect(code).toMatch(/raise exception 'Teardown refused/)
    expect(code).toMatch(/obj_description/)
    expect(code).not.toMatch(/\bcascade\b/i)
    expect(code).not.toMatch(/drop schema if exists private/i)
    expect(code).toMatch(/drop schema private;/)
    expect(code).not.toMatch(/delete\s+from|truncate|drop table auth|drop schema auth/i)
    // the confirmation check comes first
    expect(code.indexOf("Teardown refused: the confirmation phrase")).toBeLessThan(code.indexOf('drop trigger'))
  })

  it('the manual recipe files contain NO executable statement (everything is commented out)', () => {
    for (const f of ['scripts/51_account_lifecycle_MANUAL.sql', 'scripts/60_recovery_signup_trigger_MANUAL.sql']) {
      expect(statements(read(f)), f).toEqual([])
    }
    expect(read('scripts/60_recovery_signup_trigger_MANUAL.sql')).toMatch(/disable trigger on_auth_user_created/)
    expect(read('scripts/51_account_lifecycle_MANUAL.sql')).toMatch(/anonymise_customer/)
  })

  it('the staff-role template ships with a placeholder, so it cannot grant anything as shipped', () => {
    const c = read('scripts/50_grant_staff_role_TEMPLATE.sql')
    expect(c).toMatch(/PUT-THE-EXACT-EMAIL-HERE@example\.com/)
    expect(c).toMatch(/DO NOT RUN YET/)
    expect(statements(c).length).toBe(1)
  })

  it('no SQL or SQL-documentation file contains credentials, connection strings or tokens', () => {
    const files = [
      ...migrationFiles.map((m) => `migrations/${m}`),
      ...['scripts', 'tests'].flatMap((d) => readdirSync(join(ROOT, d)).map((f) => `${d}/${f}`)),
      'README.md',
    ]
    for (const f of files) {
      const t = read(f)
      expect(t, f).not.toMatch(/postgres(?:ql)?:\/\//i)
      expect(t, f).not.toMatch(/\beyJ[A-Za-z0-9_-]{15,}\./)
      expect(t, f).not.toMatch(/sb_(secret|publishable)_/)
      expect(t, f).not.toMatch(/service[_]role/i)
      expect(t, f).not.toMatch(/\bpassword\s*[:=]/i)
    }
  })
})

describe('the isolation test and its documentation (static)', () => {
  const t = read('tests/isolation_tests.sql')
  const code = statements(t).join(';\n')
  const checks = (t.match(/perform pg_temp\.ck\(/g) ?? []).length
  const readme = read('README.md')

  it('is ONE statement that ALWAYS ends in the intentional error and never commits', () => {
    expect(statements(t).length).toBe(1)
    expect((code.match(/\bdo \$test\$/gi) ?? []).length).toBe(1)
    expect(code).toMatch(/raise exception E'ISOLATION TESTS FINISHED/)
    expect(code).not.toMatch(/\bcommit\b/i)
    expect(code).not.toMatch(/\bbegin;\s*$/im)
    expect(code).not.toMatch(/create extension/i)
  })

  it('every check runs exactly once: none is inside a loop, so the stated number of checks is exact', () => {
    for (const m of t.matchAll(/\bfor\s+\w+\s+in\b[\s\S]*?\bend loop;/g)) expect(m[0]).not.toContain('pg_temp.ck(')
    expect(checks).toBeGreaterThan(250)
  })

  it('the README states the real number of checks, and no stale number remains anywhere', () => {
    expect(readme).toContain(`PASSED: ${checks}`)
    for (const stale of ['193', '172']) {
      expect(readme).not.toMatch(new RegExp(`PASSED: ${stale}`))
      expect(t).not.toMatch(new RegExp(`${stale} (checks|isolation)`))
    }
  })

  it('error checks name the intended layer (grant vs policy vs trigger), never a bare permission error', () => {
    expect(t).toMatch(/c_perm\s+constant text := '\^ERR:42501:permission denied'/)
    expect(t).toMatch(/c_rls\s+constant text := '\^ERR:42501:new row violates row-level security'/)
    expect(t).not.toMatch(/'\^ERR:42501'\)/)
    expect((t.match(/, c_perm\)/g) ?? []).length).toBeGreaterThan(40)
    expect((t.match(/, c_rls\)/g) ?? []).length).toBeGreaterThan(5)
  })

  it('covers the audit follow-ups: exact column privileges, other customers, notes, multi-row inserts, staff scoping', () => {
    for (const needle of ['priv_diff(', "'authenticated', array['insert','update']", "'anon', array['select','insert','update']", 'MULTI-ROW', 'cannot update customer B', 'nobody can EDIT a note', 'nobody can DELETE a note',
      'ONLY that one', 'self_verification_forbidden', 'expert_mode_mismatch', 'expert_service_mismatch', 'consent_version_invalid', 'payment_received', 'REMOVED', 'REDUCED']) {
      expect(t, needle).toContain(needle)
    }
  })

  it('uses only fake data', () => {
    const emails = [...t.matchAll(/[\w.+-]+@[\w.-]+\.[a-z]+/gi)].map((m) => m[0].toLowerCase())
    for (const e of emails) expect(e).toMatch(/example\.(invalid|com)$|okbank$/)
  })

  it('separates STATIC, SIMULATED and REAL-SESSION evidence in the test header, the README and the manual guide', () => {
    for (const doc of [t, readme]) {
      expect(doc).toMatch(/STATIC/i)
      expect(doc).toMatch(/SIMULATED/i)
      expect(doc).toMatch(/REAL[- ]SESSION/i)
    }
    const guide = read('tests/REAL_SESSION_VALIDATION.md')
    expect(guide).toMatch(/NOT DONE/)
    for (const needle of ['aal', 'Accept-Profile: private', 'Promise.all', 'Advisors']) expect(guide).toContain(needle)
  })

  it('documents the fixture limitation and the fallback for the managed auth tables', () => {
    expect(t).toMatch(/does not promise that this works on every Auth version/)
    expect(readme).toMatch(/REDUCED/)
    expect(readme).toMatch(/Direct inserts into `auth\.users` \/ `auth\.mfa_factors`/)
  })

  it('the README documents every operational procedure the audit asked for', () => {
    for (const heading of ['If signup', 'lost authenticator', 'Customer deletion', 'Cancellation and payments', 'Error handling', 'Consent versions', 'Owner decisions']) {
      expect(readme.toLowerCase(), heading).toContain(heading.toLowerCase())
    }
  })
})

describe('review documents and status (static)', () => {
  const readme = read('README.md')
  const consent = read('CONSENT_AND_PRIVACY_PREREQUISITES.md')
  const ready = read('PRODUCTION_READINESS.md')
  const status = readFileSync(join(process.cwd(), 'docs', 'STATUS.md'), 'utf8')
  const checks = (read('tests/isolation_tests.sql').match(/perform pg_temp\.ck\(/g) ?? []).length

  it('the consent wording is recorded as owner-approved (2026-10-v1), and ONLY the owner script - never a migration - registers it', () => {
    expect(consent).toMatch(/APPROVED BY THE OWNER on 2026-10-16/)
    expect(consent).toMatch(/2026-10-v1/)
    expect(consent).toMatch(/not legal advice/i)
    expect(consent).toMatch(/never by a migration/)
    expect(read('scripts/70_go_live_settings.sql')).toMatch(/insert into public\.consent_versions \(version\)\s+values \('2026-10-v1'\)/)
    for (const f of [...migrationFiles.map((m) => `migrations/${m}`), 'scripts/50_grant_staff_role_TEMPLATE.sql']) {
      expect(read(f), f).not.toMatch(/insert into public\.consent_versions/i)
    }
    // the README keeps the only insert statement as an instruction with a placeholder label
    expect(readme).toContain("values ('PUT-YOUR-VERSION-LABEL-HERE')")
    expect(ready).toMatch(/consent/i)
  })

  it('the production-readiness guide covers admins, MFA, retention, soft deletion, UPI safety and the unverified assumptions', () => {
    for (const needle of [
      'two independently authenticated administrator', 'verified authenticator', 'Do not create real administrator accounts',
      'RETENTION', 'TO BE DECIDED', 'soft', 'deleted_at', 'UPI PIN', 'OTP', 'no payment gateway', 'cannot be verified offline',
      'REAL_SESSION_VALIDATION.md',
    ]) expect(ready, needle).toContain(needle)
    expect(ready).not.toMatch(/\b\d+\s+(years?|months?)\b/i) // no invented retention period
    expect(consent).not.toMatch(/\b\d+\s+(years?|months?)\b/i)
  })

  it('the test count is stated accurately in the README and in docs/STATUS.md', () => {
    expect(checks).toBeGreaterThan(300)
    expect(readme).toContain(`PASSED: ${checks}`)
    expect(status).toContain(`${checks} checks`)
    for (const doc of [readme, status]) expect(doc).not.toMatch(/\b(290|193|172) checks/)
  })

  it('the README documents offline vs runtime validation, the permission matrix and the execution order without running anything', () => {
    for (const heading of ['Permission matrix', 'Offline validation', 'Runtime validation', 'Audit-log protection', 'Soft deletion']) {
      expect(readme.toLowerCase(), heading).toContain(heading.toLowerCase())
    }
  })
})

describe('six pre-migration corrections (static)', () => {
  const raw = (f: string) => read(f)
  const specOf = (text: string) => {
    const m = /-- INDEX-SPEC-BEGIN([\s\S]*?)-- INDEX-SPEC-END/.exec(text)
    expect(m, 'INDEX-SPEC block missing').toBeTruthy()
    return m![1]!.replace(/\s+/g, ' ').trim()
  }
  const tokens = (text: string) => [...text.matchAll(/'([a-z_]+\.[a-z_]+:(?:insert|update|select))'/g)].map((m) => m[1]!).sort()

  it('1. the 11 index definitions are IDENTICAL in the migration guard, the preflight and the post-check, and include the two critical payment indexes', () => {
    const a = specOf(raw('migrations/' + byKey('tables')))
    expect(specOf(raw('scripts/00_preflight_READ_ONLY.sql'))).toBe(a)
    expect(specOf(raw('scripts/90_post_migration_checks_READ_ONLY.sql'))).toBe(a)
    expect([...a.matchAll(/\('(\w+)', '(\w+)'/g)].length).toBe(11)
    expect(a).toContain("'payments_one_pending_per_request', 'payments', true")
    expect(a).toContain("'payments_reference_active', 'payments', true")
    expect(a).toContain("array['pending', 'succeeded', 'refunded'], array['failed']")
    // every index created in 0200 is in the list, and nothing else is created
    const created = stmtsOf(byKey('tables')).map((x) => /^create (?:unique )?index if not exists (\w+)/i.exec(x)?.[1]).filter(Boolean).sort()
    expect(created).toEqual([...a.matchAll(/\('(\w+)', '\w+', (?:true|false)/g)].map((m) => m[1]!).sort())
    // the guard treats a wrong kind/table/uniqueness/condition/invalid index as a conflict and stops
    const guard = stmtsOf(byKey('tables'))[1]!
    for (const needle of ['indisunique', 'indisvalid', 'indisready', 'pred_has', 'pred_not', 'pg_get_indexdef', 'raise exception']) expect(guard, needle).toContain(needle)
  })

  it('1b. the post-check verifies index DEFINITIONS and constraint DEFINITIONS, not just names', () => {
    const t = raw('scripts/90_post_migration_checks_READ_ONLY.sql')
    for (const needle of ['idx_ok', 'indisunique = s.uniq', 'pg_get_indexdef', 'pg_get_expr(ix.indpred', 'pg_get_constraintdef', 'convalidated', 'payments_paid_amount', 'payments_reference', 'payments_verified_flag']) expect(t, needle).toContain(needle)
  })

  it('2. the auth-table preflight (00b) needs REFERENCES and TRIGGER on auth.users, and the main preflight needs CREATE on the database; a missing one is a PROBLEM (never OK)', () => {
    const t = raw('scripts/00b_preflight_AUTH_TABLES_READ_ONLY.sql')
    expect(t).toMatch(/has_table_privilege\(current_user, 'auth\.users', 'references'\)/)
    expect(t).toMatch(/has_table_privilege\(current_user, 'auth\.users', 'trigger'\)/)
    expect(raw('scripts/00_preflight_READ_ONLY.sql')).toMatch(/has_database_privilege\(current_user, current_database\(\), 'create'\)/)
    for (const [file, label] of [['scripts/00b_preflight_AUTH_TABLES_READ_ONLY.sql', 'reference auth.users'], ['scripts/00_preflight_READ_ONLY.sql', 'create schemas in this database']] as const) {
      const src = raw(file)
      const row = new RegExp(`\\([0-9]+, +'[^']*${label.replace('.', '\\.')}[^']*',\\s+case[\\s\\S]*?end,`).exec(src)
      expect(row, label).toBeTruthy()
      expect(row![0], label).toContain("'PROBLEM'")
      expect(row![0], label).not.toContain("'INFO'")
    }
  })

  it('2a. the main preflight never opens auth.users or auth.mfa_factors by name (a real project refused with "must be owner of table users"); those checks live in 00b and are UNKNOWN, never OK, in the main script', () => {
    const main = raw('scripts/00_preflight_READ_ONLY.sql')
    const code = main.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
    expect(code).not.toMatch(/to_regclass\('auth\./)
    expect(code).not.toMatch(/has_table_privilege/)
    expect(code).not.toMatch(/pg_stat_all_tables/)
    expect(code).not.toMatch(/regclass|::regclass/)
    // rows 9-12 are UNKNOWN placeholders (so the main script alone can never say "OK to continue"); 13 and 28 are INFO pointers
    for (const n of [9, 10, 11, 12]) expect(code, `row ${n}`).toMatch(new RegExp(`\\(${n}, +'[^']+',\\s+'UNKNOWN', 'NOT checked by this script: run 00b_preflight_AUTH_TABLES_READ_ONLY\\.sql'\\)`))
    for (const n of [13, 28]) expect(code, `row ${n}`).toMatch(new RegExp(`\\(${n}, +'[^']+',\\s*'INFO', 'see 00b_preflight_AUTH_TABLES_READ_ONLY\\.sql'\\)`))
    // 00b is privilege inquiry + catalog metadata only: no function that reads rows or needs ownership
    const b = raw('scripts/00b_preflight_AUTH_TABLES_READ_ONLY.sql')
    const bcode = stripQuoted(b.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n'))
    expect(bcode).not.toMatch(/\bfrom\s+auth\./i)
    expect(bcode).not.toMatch(/\b(comment|analyze|vacuum|lock|reindex|cluster|refresh|notify|listen)\b/i)
    // every row that 00b owns is no longer a real check in the main script: the two files cover rows 9-13 and 28 exactly once
    for (const n of [9, 10, 11, 12, 13, 28]) expect(b, `00b row ${n}`).toMatch(new RegExp(`^ {4}\\(${n}, `, 'm'))
  })

  it('2b. preflight and post-check verdicts can never be OK when a check is missing, blank, unrecognised or UNKNOWN', () => {
    for (const [f, rows] of [['scripts/00_preflight_READ_ONLY.sql', 29], ['scripts/00b_preflight_AUTH_TABLES_READ_ONLY.sql', 6], ['scripts/90_post_migration_checks_READ_ONLY.sql', 20]] as const) {
      const t = raw(f)
      const tuples = [...t.matchAll(/^ {4}\((\d+), /gm)].length
      expect(tuples, `${f}: number of check rows`).toBe(rows)
      // the verdict value AND its explanation each carry the guard: exactly two occurrences, the first before the first 'STOP'
      const v0 = t.slice(t.indexOf("select 99, 'VERDICT'"))
      expect((v0.match(/result is null or result not in \('OK', 'INFO', 'UNKNOWN'\)/g) ?? []).length, `${f}: blank/unknown guard`).toBe(2)
      expect((v0.match(new RegExp(`\\(select count\\(\\*\\) from checks\\) <> ${rows}`, 'g')) ?? []).length, `${f}: row-count guard`).toBe(2)
      expect(v0.indexOf('result is null or'), f).toBeLessThan(v0.indexOf("then 'STOP'"))
      expect(v0.indexOf(`<> ${rows}`), f).toBeLessThan(v0.indexOf("then 'STOP'"))
      expect(t, f).toContain("then 'STOP'")
      expect(t, f).toContain("result = 'UNKNOWN'")
      expect(t, f).toContain("'MANUAL CHECK NEEDED'")
      // the plain-OK branch must be the LAST one
      const v = t.slice(t.indexOf("select 99, 'VERDICT'"))
      expect(v.indexOf("then 'STOP'")).toBeGreaterThan(0)
      expect(v.indexOf("then 'STOP'")).toBeLessThan(v.indexOf("then 'MANUAL CHECK NEEDED'"))
      expect(v.indexOf("then 'MANUAL CHECK NEEDED'")).toBeLessThan(v.search(/else '(OK to continue|OK)' end/))
    }
    // the data-API row is UNKNOWN (not INFO, not OK) when the setting cannot be read
    expect(raw('scripts/00_preflight_READ_ONLY.sql')).toMatch(/when not exists \(select 1 from api_schemas\) then 'UNKNOWN'/)
    expect(raw('scripts/90_post_migration_checks_READ_ONLY.sql')).toMatch(/when not exists \(select 1 from api_schemas\) then 'UNKNOWN'/)
  })

  it('3a. 0200: each table is locked down by the next two statements, before any index (see the adjacency test)', () => {
    const t = stmtsOf(byKey('tables')).map(norm)
    const firstIndex = t.findIndex((x) => /^create (unique )?index/.test(x))
    const lastRevoke = t.map((x, i) => (/^revoke all on table public\.\w+ from anon, authenticated$/.test(x) ? i : -1)).filter((i) => i >= 0)
    expect(lastRevoke.length).toBe(12)
    // the first index appears only after at least the table it belongs to (staff_members, 6th table) is locked down
    expect(firstIndex).toBeGreaterThan(lastRevoke[5]!)
  })

  it('3b. 0300: the auth.users triggers are created LAST, after private.anonymise_customer and every other function', () => {
    const st = stmtsOf(byKey('functions_and_triggers'))
    const idx = (re: RegExp) => st.findIndex((x) => re.test(x))
    const anon = idx(/^create or replace function private\.anonymise_customer\b/i)
    const lastFn = st.map((x, i) => (/^create or replace function\b/i.test(x) ? i : -1)).filter((i) => i >= 0).pop()!
    const trig = ['on_auth_user_created', 'on_auth_user_email_changed', 'on_auth_user_deleted'].map((n) => idx(new RegExp(`^create trigger ${n}\\b`, 'i')))
    for (const i of trig) {
      expect(i).toBeGreaterThan(anon)
      expect(i).toBeGreaterThan(lastFn)
    }
    expect(trig).toEqual([...trig].sort((a, b) => a - b))
    // nothing but the drop block and these triggers follows the last function
    const tail = st.slice(lastFn + 1).map((x) => x.slice(0, 22).toLowerCase())
    expect(tail.some((x) => x.startsWith('create trigger on_auth'))).toBe(true)
    expect(st.slice(lastFn + 1).filter((x) => /^create trigger (?!on_auth)/i.test(x))).toEqual([])
  })

  it('4. an ownership failure while replacing an auth.users trigger stops with a clear message and never widens permissions', () => {
    const blk = stmtsOf(byKey('functions_and_triggers')).find((x) => /^do \$\$/i.test(x) && x.includes('drop trigger'))!
    expect(blk).toContain('exception when insufficient_privilege then')
    expect(blk).toContain('MIGRATION STOPPED')
    expect(blk).toMatch(/Do not change roles or permissions/)
    expect(allCode).not.toMatch(/alter table auth\.users\s+owner|grant\s+[^;]*\bon\s+auth\.|set\s+role\b|security_definer|alter\s+default\s+privileges/i)
    const readme = raw('README.md')
    for (const needle of ['Re-running and partial execution', 'OWNERSHIP', 'DROP TRIGGER', 'MIGRATION STOPPED', 'do not run anything as another role']) expect(readme, needle).toContain(needle)
    const header = raw('migrations/' + byKey('functions_and_triggers')).slice(0, 1400)
    expect(header).toMatch(/ownership/i)
  })

  it('4b. 0400: every function is followed IMMEDIATELY by its revoke, grant and marker comment', () => {
    const st = stmtsOf(byKey('rpc_functions')).map(norm)
    for (const f of fns.filter((x) => x.name.startsWith('public.'))) {
      const i = st.findIndex((x) => x.startsWith(`create or replace function ${f.name}(`))
      expect(i, f.key).toBeGreaterThan(0)
      expect(st[i + 1], `${f.key}: revoke not next`).toMatch(new RegExp(`^revoke all on function ${f.name.replace('.', '\\.')}\\(.*\\) from public, anon, authenticated$`))
      expect(st[i + 2], `${f.key}: grant not next`).toMatch(new RegExp(`^grant execute on function ${f.name.replace('.', '\\.')}\\(.*\\) to authenticated$`))
      expect(st[i + 3], `${f.key}: comment not next`).toMatch(/^comment on function .* is 'astrasoul:phase1'$/)
    }
  })

  it('5. payment/cancellation locking: request row first (SHARE vs NO KEY UPDATE), re-check after the wait, then the advisory lock; verify locks only the payment row', () => {
    const submit = fn('public.submit_payment_reference').raw
    const cancel = fn('public.cancel_my_request').raw
    const verify = fn('public.verify_payment').raw
    const refund = fn('public.refund_payment').raw
    // submit: the request SELECT carries "status <> 'cancelled'" AND "for share", before the advisory lock
    const sel = /select r\.service_slug, r\.mode into v_service, v_mode[\s\S]*?for share;/.exec(submit)
    expect(sel, 'submit must lock the request row FOR SHARE').toBeTruthy()
    expect(sel![0]).toContain("r.status <> 'cancelled'")
    expect(submit.indexOf('for share')).toBeLessThan(submit.indexOf('pg_advisory_xact_lock'))
    expect(submit.indexOf('for share')).toBeLessThan(submit.indexOf('insert into public.payments'))
    // cancel: the conflicting lock mode on the same row, taken before reading payments or updating
    expect(cancel).toMatch(/for no key update;/)
    expect(cancel.indexOf('for no key update')).toBeLessThan(cancel.indexOf("p.status = 'succeeded'"))
    expect(cancel.indexOf('for no key update')).toBeLessThan(cancel.indexOf("set status = 'cancelled'"))
    // the flag trigger covers a claim that committed before the cancellation
    expect(fn('private.tg_requests_cancel_flag').raw).toMatch(/p\.status = 'pending'/)
    // no function takes the PAYMENT row lock and then the request row lock (deadlock order): verify/refund lock payments only
    for (const f of [verify, refund]) {
      expect(f).toMatch(/from public\.payments p where p\.id = p_payment_id for update;/)
      expect(f).not.toMatch(/from public\.consultation_requests[^;]*for (update|share|no key update)/)
    }
    // the only advisory locks, and each in exactly one place
    expect([...allCode.matchAll(/pg_advisory_xact_lock\(hashtextextended\('([a-z_]+):/g)].map((m) => m[1]).sort()).toEqual(['consultation_requests', 'payments'])
    // the design comment documents the ordering and its limits
    const head = raw('migrations/' + byKey('rpc_functions')).slice(0, 4200)
    for (const needle of ['LOCKING STRATEGY', 'Deadlock check', 'NOT tested', 'REAL_SESSION_VALIDATION.md section 5b']) expect(head, needle).toContain(needle)
  })

  it('5b. the isolation test covers the sequential invariants, and the manual guide holds the live two-session procedure', () => {
    const t = raw('tests/isolation_tests.sql')
    for (const needle of ['Y47', 'Y49', 'Y50', 'request_not_payable', 'single transaction cannot race itself']) expect(t, needle).toContain(needle)
    const guide = raw('tests/REAL_SESSION_VALIDATION.md')
    for (const needle of ['5b.', 'pg_sleep', '40P01', 'request_not_payable', 'Claim first', 'Cancel first']) expect(guide, needle).toContain(needle)
  })

  it('6. the post-check uses EFFECTIVE privilege functions and never the information_schema grant views', () => {
    const t = raw('scripts/90_post_migration_checks_READ_ONLY.sql')
    const code = statements(t).join('\n')
    expect(code).not.toMatch(/information_schema/i)
    for (const f of ['has_table_privilege', 'has_any_column_privilege', 'has_column_privilege', 'has_function_privilege', 'has_schema_privilege', 'has_sequence_privilege']) expect(code, f).toContain(f)
    for (const role of ["'anon'", "'authenticated'"]) expect(code).toContain(role)
    // the function matrix covers exactly the functions the migrations create, with the right executable subset
    const m = /fn_expected\(sig, auth_ok\) as \(([\s\S]*?)\n\),/.exec(code)!
    const rows = [...m[1]!.matchAll(/\('([^']+)', (true|false)\)/g)].map((x) => ({ sig: x[1]!.replace(/\s/g, ''), ok: x[2] === 'true' }))
    expect(rows.map((r) => r.sig).sort()).toEqual(fns.map((f) => f.key.replace(/\s/g, '')).sort())
    const granted = new Set(grants.filter((g) => g.privs === 'execute').map((g) => g.target.replace(/^function\s+/, '').replace(/\s/g, '')))
    for (const r of rows) expect(r.ok, r.sig).toBe(granted.has(r.sig))
    // the expected writable/readable column lists are the SAME ones the isolation test compares against
    expect(tokens(t)).toEqual(tokens(raw('tests/isolation_tests.sql')))
    // and they match the actual grants in 0500
    const gIns = grants.filter((g) => /\binsert\s*\(/.test(g.privs) && g.to.includes('authenticated'))
    for (const g of gIns) {
      const tbl = g.target.replace('public.', '')
      const cols = /insert\s*\(([^)]*)\)/.exec(g.privs)![1]!.split(',').map((c) => c.trim())
      for (const c of cols) expect(tokens(t), `${tbl}.${c}:insert`).toContain(`${tbl}.${c}:insert`)
    }
  })
})


describe('go-live scripts 70 and 71 (static)', () => {
  const site = readFileSync(join(process.cwd(), 'src/config/site.ts'), 'utf8')

  it('70 only adds the consent version and the three payment settings, with the same UPI details the website shows', () => {
    const sql = read('scripts/70_go_live_settings.sql')
    const stmts = statements(sql).map((x) => stripQuoted(x).replace(/\s+/g, ' ').trim().toLowerCase())
    expect(stmts).toHaveLength(2)
    expect(stmts[0]).toMatch(/^insert into public\.consent_versions \(version\) values \(.*\) on conflict \(version\) do nothing$/)
    expect(stmts[1]).toMatch(/^insert into public\.app_settings \(key, value\) values .* on conflict \(key\) do update set value = excluded\.value$/)
    for (const word of ['delete', 'drop', 'truncate', 'alter', 'grant', 'revoke', 'create']) expect(stmts.join(' '), word).not.toMatch(new RegExp(`\\b${word}\\b`))
    const upi = /upiId: '([^']+)'/.exec(site)![1]!
    const payee = /payeeName: '([^']+)'/.exec(site)![1]!
    expect(sql).toContain(`('upi_id',               '${upi}')`)
    expect(sql).toContain(`('payee_name',           '${payee}')`)
    expect(upi).toMatch(/^[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9.-]{1,63}$/) // the database's own format check
    expect(/'payment_instructions',\s+'([^']+)'/.exec(sql)![1]!.length).toBeLessThanOrEqual(500)
  })

  it('71 only grants the owner an admin role, through the database guard that demands a verified authenticator', () => {
    const sql = read('scripts/71_grant_first_admin_READY.sql')
    const stmts = statements(sql)
    expect(stmts).toHaveLength(1)
    expect(sql).toMatch(/insert into public\.staff_members \(user_id, role\)\s+select u\.id, 'admin'::public\.staff_role/)
    expect(sql).toMatch(/lower\(u\.email\) = lower\('abhayprabhakar1213@gmail\.com'\)/)
    expect(sql).toMatch(/refuses it unless that account already has a verified authenticator/)
    expect(sql).not.toMatch(/\b(delete|drop|truncate|alter)\b/i)
  })
})
