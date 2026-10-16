import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The website and the database must agree. These tests read the website's data adapter and the migration files (text only - nothing
 * is run against a database) and check that every column and function the adapter uses really exists and is really granted.
 * This catches typos and drift; it does NOT prove the database behaves correctly (see supabase/tests/isolation_tests.sql for that).
 */
const root = process.cwd()
const adapter = readFileSync(join(root, 'src/lib/data/supabaseData.ts'), 'utf8')
const tables = readFileSync(join(root, 'supabase/migrations/20261014000200_tables.sql'), 'utf8')
const rls = readFileSync(join(root, 'supabase/migrations/20261014000500_rls_and_grants.sql'), 'utf8')
const rpcs = readFileSync(join(root, 'supabase/migrations/20261014000400_rpc_functions.sql'), 'utf8')

const list = (s: string) => s.split(',').map((x) => x.trim().replace(/\s+/g, ' ')).filter(Boolean)
const constant = (name: string) => {
  const m = new RegExp(`const ${name}\\s*=\\s*\\n?\\s*'([^']+)'`).exec(adapter)
  if (!m) throw new Error(`constant ${name} not found`)
  return m[1]!
}

function tableColumns(table: string): string[] {
  const m = new RegExp(`create table if not exists public\\.${table} \\(([\\s\\S]*?)\\n\\);`).exec(tables)
  if (!m) throw new Error(`table ${table} not found`)
  return m[1]!.split('\n').map((l) => /^\s{2}([a-z_]+)\s+[a-z]/.exec(l)?.[1]).filter((c): c is string => !!c && !['constraint', 'primary'].includes(c))
}

/** columns named in `grant <kind> (a, b, c) on public.<table>[, public.<other>] to authenticated` (handles multi-line and combined grants) */
function granted(kind: 'select' | 'insert' | 'update', table: string): string[] | 'all' {
  const flat = rls.replace(/--[^\n]*/g, '')
  const out = new Set<string>()
  let all = false
  for (const g of flat.match(/grant[\s\S]*?;/g) ?? []) {
    const split = /\bon public\./i.exec(g)
    if (!split) continue
    const privs = g.slice('grant'.length, split.index)
    const targets = g.slice(split.index)
    if (!new RegExp(`public\\.${table}\\b`).test(targets) || !/\bauthenticated\b/.test(targets)) continue
    for (const m of privs.matchAll(new RegExp(`\\b${kind}\\b\\s*(\\(([^)]*)\\))?`, 'gi'))) {
      if (m[2]) list(m[2]).forEach((c) => out.add(c))
      else all = true
    }
  }
  return all ? 'all' : [...out]
}

const covers = (g: string[] | 'all', cols: string[]) => g === 'all' || cols.every((c) => g.includes(c))

describe('the website and the database agree', () => {
  it('every column the adapter reads from consultation_requests exists and is readable', () => {
    const cols = list(constant('REQUEST_COLUMNS'))
    for (const c of cols) expect(tableColumns('consultation_requests'), c).toContain(c)
    expect(covers(granted('select', 'consultation_requests'), cols)).toBe(true)
  })

  it('every payment column the adapter reads exists and is granted (and no "who" columns are read)', () => {
    const cols = list(constant('PAYMENT_COLUMNS'))
    for (const c of cols) expect(tableColumns('payments'), c).toContain(c)
    expect(covers(granted('select', 'payments'), cols)).toBe(true)
    for (const hidden of ['submitted_by', 'verified_by', 'refunded_by']) expect(cols).not.toContain(hidden)
  })

  it('service, expert, price, profile, note, staff, settings and audit reads use only existing, granted columns', () => {
    const checks: Array<[string, string[]]> = [
      ['services', list(constant('SERVICE_COLUMNS'))],
      ['experts', list(constant('EXPERT_COLUMNS').replace(/, expert_services\([^)]*\)/, ''))],
      ['service_prices', ['service_slug', 'mode', 'amount_minor']],
      ['profiles', ['id', 'email', 'full_name', 'phone', 'date_of_birth', 'preferred_language']],
      ['request_notes', ['id', 'request_id', 'body', 'kind', 'created_at']],
      ['staff_members', ['role', 'active', 'expert_id', 'user_id']],
      ['app_settings', ['key', 'value']],
      ['audit_log', ['id', 'at', 'actor_kind', 'action', 'entity', 'entity_id']],
      ['consent_versions', ['version', 'approved_at']],
    ]
    for (const [t, cols] of checks) {
      for (const c of cols) expect(tableColumns(t), `${t}.${c}`).toContain(c)
      expect(covers(granted('select', t), cols), `select on ${t}`).toBe(true)
    }
  })

  it('every column the adapter writes is granted for that write', () => {
    const writes: Array<['insert' | 'update', string, string[]]> = [
      ['insert', 'consultation_requests', ['service_slug', 'mode', 'concern', 'date_of_birth', 'preferred_language', 'consent_version']],
      ['update', 'consultation_requests', ['status', 'assigned_expert_id', 'scheduled_at', 'meeting_link']],
      ['update', 'profiles', ['full_name', 'phone', 'date_of_birth', 'preferred_language']],
      ['insert', 'request_notes', ['request_id', 'body']],
      ['update', 'services', ['name', 'active', 'display_order']],
      ['update', 'service_prices', ['amount_minor']],
      ['insert', 'experts', ['display_name', 'bio', 'languages', 'modes', 'availability_note', 'active']],
      ['update', 'experts', ['display_name', 'bio', 'languages', 'modes', 'availability_note', 'active']],
      ['insert', 'app_settings', ['key', 'value']],
      ['update', 'app_settings', ['value']],
      ['insert', 'expert_services', ['expert_id', 'service_slug']],
    ]
    for (const [kind, t, cols] of writes) {
      for (const c of cols) expect(tableColumns(t), `${t}.${c}`).toContain(c)
      expect(covers(granted(kind, t), cols), `${kind} on ${t}`).toBe(true)
      // and every one of those columns really appears in the adapter
      for (const c of cols) expect(adapter, `${t}.${c}`).toContain(c)
    }
    // expert_services rows may also be deleted by an administrator
    expect(rls).toMatch(/grant insert, delete\s+on public\.expert_services to authenticated/)
  })

  it('the database functions the adapter calls exist with exactly the argument names it sends', () => {
    const fns: Record<string, string[]> = {
      cancel_my_request: ['p_request_id'],
      submit_payment_reference: ['p_request_id', 'p_upi_reference', 'p_payer_name', 'p_paid_on'],
      verify_payment: ['p_payment_id', 'p_decision', 'p_received_amount_minor', 'p_note'],
      refund_payment: ['p_payment_id', 'p_note'],
    }
    for (const [fn, args] of Object.entries(fns)) {
      const m = new RegExp(`create or replace function public\\.${fn}\\(([\\s\\S]*?)\\)\\s*returns`).exec(rpcs)
      expect(m, fn).toBeTruthy()
      const declared = m![1]!.split(',').map((x) => x.trim().split(/\s+/)[0]!)
      expect(declared, fn).toEqual(args)
      for (const a of args) expect(adapter, `${fn}.${a}`).toContain(a)
    }
  })

  it('the statuses, modes and payment states in the website match the database enums', () => {
    const foundation = readFileSync(join(root, 'supabase/migrations/20261014000100_foundation.sql'), 'utf8')
    const enumValues = (name: string) => [...(new RegExp(`create type public\\.${name} as enum \\(([^)]*)\\)`).exec(foundation)?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    const types = readFileSync(join(root, 'src/lib/data/types.ts'), 'utf8')
    const union = (name: string) => [...(new RegExp(`export type ${name} =([^\\n]*(?:\\n\\s*\\|[^\\n]*)*)`).exec(types)?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    expect(union('RequestStatus')).toEqual(enumValues('request_status'))
    expect(union('PaymentStatus')).toEqual(enumValues('payment_status'))
    expect(union('Mode')).toEqual(enumValues('consultation_mode'))
    expect(union('DobRequirement')).toEqual(enumValues('dob_requirement'))
  })

  it('the website’s own service list and the seeded services have the same four slugs', () => {
    const seed = readFileSync(join(root, 'supabase/migrations/20261014000600_seed_reference_data.sql'), 'utf8')
    const site = readFileSync(join(root, 'src/data/services.ts'), 'utf8')
    const seeded = [...seed.matchAll(/\('([a-z-]+)',\s*'[^']+',\s*'(?:required|optional|none)'/g)].map((m) => m[1]).sort()
    const slugs = [...site.matchAll(/slug: '([a-z-]+)'/g)].map((m) => m[1]).sort()
    expect(seeded).toEqual(slugs)
    expect(slugs).toHaveLength(4)
  })
})
