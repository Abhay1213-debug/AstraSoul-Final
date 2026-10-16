import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { createSupabaseDataService, mapDataError } from './supabaseData'

/** A chainable stand-in for the Supabase query builder: records the calls and resolves to a prepared answer. No network, no real project. */
function stubClient(answers: Array<{ data?: unknown; error?: unknown }> = [], userId: string | null = 'u-1') {
  const log: Array<{ table?: string; op: string; args: unknown[] }> = []
  let i = 0
  const next = () => answers[Math.min(i++, answers.length - 1)] ?? { data: [], error: null }
  const builder = (table: string): unknown => {
    const b: Record<string, unknown> = {}
    for (const op of ['select', 'insert', 'update', 'delete', 'eq', 'in', 'order', 'limit', 'single', 'maybeSingle']) {
      b[op] = (...args: unknown[]) => {
        log.push({ table, op, args })
        return b
      }
    }
    b.then = (resolve: (v: unknown) => unknown) => resolve({ error: null, data: null, ...next() })
    return b
  }
  const client = {
    from: (t: string) => builder(t),
    rpc: vi.fn(async (name: string, args: unknown) => {
      log.push({ op: `rpc:${name}`, args: [args] })
      return { error: null, ...(answers[i++] ?? {}) }
    }),
    auth: { getSession: async () => ({ data: { session: userId ? { user: { id: userId } } : null } }) },
  } as unknown as SupabaseClient
  return { client, log }
}

describe('mapDataError', () => {
  it.each([
    [{ code: 'AS409', message: 'cannot_cancel' }, 'cannot_cancel'],
    [{ code: 'AS403', message: 'self_verification_forbidden' }, 'self_verification_forbidden'],
    [{ code: 'AS429', message: 'too_many_open_requests' }, 'too_many_open_requests'],
    [{ code: 'AS422', message: 'consent_version_invalid' }, 'consent_unavailable'],
    [{ code: 'AS422', message: 'amount_mismatch' }, 'amount_mismatch'],
    [{ code: '42501', message: 'new row violates row-level security policy for table "x"' }, 'forbidden'],
    [{ code: 'PGRST301', message: 'JWT expired' }, 'not_signed_in'],
    [{ code: '23514', message: 'check constraint' }, 'invalid_input'],
    [{ status: 429 }, 'rate_limited'],
    [new TypeError('Failed to fetch'), 'network'],
    [{ code: 'XX000', message: 'secret internal detail' }, 'unknown'],
    [null, 'unknown'],
  ])('maps %j to %s', (err, code) => expect(mapDataError(err)).toBe(code))
})

describe('the data adapter (stand-in client; NOT a real Supabase project)', () => {
  it('never asks for a column the logged-in role is not granted (who submitted/verified/updated, author ids)', () => {
    const src = readFileSync(join(__dirname, 'supabaseData.ts'), 'utf8')
    // these columns exist in the tables but are deliberately NOT readable through the API (supabase/migrations/..0500)
    for (const col of ['submitted_by', 'verified_by', 'refunded_by', 'updated_by', 'created_by', 'author_id', 'anonymised_at']) {
      expect(src, col).not.toMatch(new RegExp(`['"\`][^'"\`]*\\b${col}\\b`))
    }
  })

  it('never writes payments directly: payment changes go only through the three database functions', () => {
    const src = readFileSync(join(__dirname, 'supabaseData.ts'), 'utf8')
    expect(src).not.toMatch(/from\('payments'\)\s*\.\s*(insert|update|delete)/)
    expect(src).not.toMatch(/from\('audit_log'\)\s*\.\s*(insert|update|delete)/)
    expect(src).not.toMatch(/from\('staff_members'\)\s*\.\s*(insert|update|delete)/)
    for (const fn of ['cancel_my_request', 'submit_payment_reference', 'verify_payment', 'refund_payment']) expect(src).toContain(`'${fn}'`)
  })

  it('creates a request with only the columns a customer may insert (no customer id, status or expert)', async () => {
    const { client, log } = stubClient([{ data: { id: 'r1' } }])
    const r = await createSupabaseDataService(client).createRequest({
      serviceSlug: 'numerology', mode: 'chat', concern: '  A long enough concern  ', dateOfBirth: '', preferredLanguage: '', consentVersion: 'v1',
    })
    expect(r).toEqual({ ok: true, data: { id: 'r1' } })
    const insert = log.find((l) => l.op === 'insert')!
    expect(insert.table).toBe('consultation_requests')
    expect(insert.args[0]).toEqual({ service_slug: 'numerology', mode: 'chat', concern: 'A long enough concern', date_of_birth: null, preferred_language: null, consent_version: 'v1' })
  })

  it('submits a payment through the database function and returns only a fixed code on refusal', async () => {
    const { client } = stubClient()
    ;(client.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ error: { code: 'AS409', message: 'reference_unavailable', details: 'SECRET DETAIL' } })
    const r = await createSupabaseDataService(client).submitPaymentReference({ requestId: 'r1', upiReference: ' ab12cd34ef ', payerName: ' Asha ', paidOn: '2026-10-01' })
    expect(r).toEqual({ ok: false, code: 'reference_unavailable' })
    expect(JSON.stringify(r)).not.toContain('SECRET')
    expect(client.rpc).toHaveBeenCalledWith('submit_payment_reference', { p_request_id: 'r1', p_upi_reference: 'ab12cd34ef', p_payer_name: 'Asha', p_paid_on: '2026-10-01' })
  })

  it('verify and refund call their database functions with the documented arguments', async () => {
    const { client } = stubClient()
    const svc = createSupabaseDataService(client)
    await svc.verifyPayment('p1', 'succeeded', 50000, ' ok ')
    await svc.verifyPayment('p1', 'failed', null, '')
    await svc.refundPayment('p1', 'returned')
    expect(client.rpc).toHaveBeenNthCalledWith(1, 'verify_payment', { p_payment_id: 'p1', p_decision: 'succeeded', p_received_amount_minor: 50000, p_note: 'ok' })
    expect(client.rpc).toHaveBeenNthCalledWith(2, 'verify_payment', { p_payment_id: 'p1', p_decision: 'failed', p_received_amount_minor: null, p_note: null })
    expect(client.rpc).toHaveBeenNthCalledWith(3, 'refund_payment', { p_payment_id: 'p1', p_note: 'returned' })
  })

  it('treats "0 rows changed" (what Row Level Security does to an update it refuses) as forbidden, not success', async () => {
    const { client } = stubClient([{ data: [] }])
    expect(await createSupabaseDataService(client).updateRequest('r1', { status: 'confirmed' })).toEqual({ ok: false, code: 'forbidden' })
    const ok = stubClient([{ data: [{ id: 'r1' }] }])
    expect(await createSupabaseDataService(ok.client).updateRequest('r1', { status: 'confirmed' })).toEqual({ ok: true, data: undefined })
  })

  it('saves a setting by updating first (only "value" is updatable) and inserting only when it does not exist', async () => {
    const { client, log } = stubClient([{ data: [] }, { data: null }])
    expect(await createSupabaseDataService(client).saveSetting('upi_id', ' shop@bank ')).toEqual({ ok: true, data: undefined })
    const ops = log.filter((l) => l.table === 'app_settings').map((l) => l.op)
    expect(ops.indexOf('update')).toBeLessThan(ops.indexOf('insert'))
    expect(log.find((l) => l.op === 'update')!.args[0]).toEqual({ value: 'shop@bank' })
  })

  it('a signed-out session gets not_signed_in for the customer calls (nothing is queried)', async () => {
    const { client, log } = stubClient([], null)
    const svc = createSupabaseDataService(client)
    expect(await svc.listMyRequests()).toEqual({ ok: false, code: 'not_signed_in' })
    expect(await svc.getMyProfile()).toEqual({ ok: false, code: 'not_signed_in' })
    expect(log).toHaveLength(0)
  })

  it('reads the staff role from the account’s own row, and reports null for a customer', async () => {
    const admin = stubClient([{ data: { role: 'admin', active: true, expert_id: null } }])
    expect(await createSupabaseDataService(admin.client).getMyStaffRole()).toEqual({ ok: true, data: { role: 'admin', active: true, expertId: null } })
    expect(admin.log.find((l) => l.op === 'eq')!.args).toEqual(['user_id', 'u-1'])
    const none = stubClient([{ data: null }])
    expect(await createSupabaseDataService(none.client).getMyStaffRole()).toEqual({ ok: true, data: null })
  })

  it('turns a thrown network failure into the fixed "network" code', async () => {
    const { client } = stubClient()
    ;(client.rpc as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect(await createSupabaseDataService(client).cancelMyRequest('r1')).toEqual({ ok: false, code: 'network' })
  })
})
