import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** Static checks on supabase/bookings/0700_bookings.sql (reads the text; it does not run it). */
const sql = readFileSync(join(process.cwd(), 'supabase/bookings/0700_bookings.sql'), 'utf8')
const code = sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase()

describe('bookings table SQL', () => {
  it('stops before changing anything if the table already exists', () => {
    expect(code.trimStart().startsWith('do $guard$')).toBe(true)
    expect(sql).toMatch(/MIGRATION STOPPED/)
  })
  it('locks the table down straight after creating it: RLS on, no access for visitors or logged-in users', () => {
    const create = code.indexOf('create table public.bookings')
    const rls = code.indexOf('alter table public.bookings enable row level security')
    const revoke = code.indexOf('revoke all on table public.bookings from anon, authenticated')
    expect(create).toBeGreaterThan(0)
    expect(rls).toBeGreaterThan(create)
    expect(revoke).toBeGreaterThan(rls)
    expect(code.indexOf('exclude using gist')).toBeGreaterThan(revoke)
    expect(code).not.toMatch(/grant [^;]* to (anon|authenticated|public)\b/)
    expect(code).not.toMatch(/create policy/)
  })
  it("lets the website's server (service_role) read, add and update bookings, and nothing more", () => {
    expect(code).toContain('grant select, insert, update on table public.bookings to service_role')
    expect(code).not.toMatch(/grant [^;]*delete[^;]* to service_role/)
  })
  it('refuses overlapping held or paid bookings, so a 25-minute session also blocks the next slot (test bookings never block real ones)', () => {
    expect(code).toContain("exclude using gist (tsrange(starts_at, ends_at) with &&) where (status in ('held', 'paid') and not test)")
    expect(code).toContain("exclude using gist (tsrange(starts_at, ends_at) with &&) where (status in ('held', 'paid') and test)")
    expect(code).toContain('check (ends_at > starts_at)')
  })
  it('keeps the team view private too', () => {
    expect(code).toContain('with (security_invoker = true)')
    expect(code).toContain('revoke all on table public.upcoming_sessions from anon, authenticated')
  })
})
