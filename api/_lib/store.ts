import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ServerConfig } from './config.js'

/**
 * Where bookings are kept: the Supabase table public.bookings (supabase/bookings/0700_bookings.sql), reachable only
 * with the server's secret key. A held or paid booking blocks its time, from starts_at to ends_at: the database refuses
 * any other held or paid booking that overlaps it (same test flag), so two sessions can never clash, even when a longer
 * one (the 25-minute Diamond package) runs into the next slot.
 */
export type BookingStatus = 'held' | 'paid' | 'cancelled' | 'expired' | 'conflict'

export interface BookingRow {
  id: string
  created_at: string
  status: BookingStatus
  hold_expires_at: string
  slot_date: string
  slot_time: string
  /** the session's length, and its start and end in Indian wall-clock time (YYYY-MM-DDTHH:MM:SS) */
  session_minutes: number
  starts_at: string
  ends_at: string
  mode: string
  services: string[]
  extension: boolean
  amount_paise: number
  currency: 'INR'
  test: boolean
  name: string
  email: string
  phone: string
  date_of_birth: string
  language: string
  concern: string
  dodo_session_id: string | null
  dodo_payment_id: string | null
  paid_at: string | null
}
export type NewBooking = Omit<BookingRow, 'id' | 'created_at' | 'dodo_session_id' | 'dodo_payment_id' | 'paid_at'>
export type TakenSlot = Pick<BookingRow, 'slot_date' | 'slot_time' | 'session_minutes' | 'status' | 'hold_expires_at'>

export interface Store {
  /** Held and paid bookings between two dates (inclusive) */
  taken(from: string, to: string, test: boolean): Promise<TakenSlot[]>
  /** Holds the booking's time. False when it overlaps one already held or paid. Lapsed holds that day are expired first. */
  hold(b: NewBooking, now: Date): Promise<{ ok: true; id: string } | { ok: false }>
  get(id: string): Promise<BookingRow | null>
  /** Changes a booking only if it is in one of `from`. 'conflict' = its time overlaps one held or paid by someone else. */
  update(id: string, patch: Partial<BookingRow>, from: BookingStatus[]): Promise<'updated' | 'unchanged' | 'conflict'>
  /** Releases this customer's other unpaid holds, so one person never ties up several slots. */
  releaseHoldsOf(email: string, test: boolean): Promise<void>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isBookingId = (id: unknown): id is string => typeof id === 'string' && UUID.test(id)
const ACTIVE: BookingStatus[] = ['held', 'paid']
/** Postgres refusing an overlapping booking: the exclusion constraint (23P01), or a unique index (23505). */
const CLASH = new Set(['23P01', '23505'])

// ---------- Supabase ----------

class SupabaseStore implements Store {
  private db: SupabaseClient
  constructor(url: string, key: string) {
    this.db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  }
  async taken(from: string, to: string, test: boolean) {
    const { data, error } = await this.db.from('bookings').select('slot_date, slot_time, session_minutes, status, hold_expires_at')
      .in('status', ACTIVE).eq('test', test).gte('slot_date', from).lte('slot_date', to)
    if (error) throw new Error(`bookings read failed: ${error.message}`)
    return data as TakenSlot[]
  }
  async hold(b: NewBooking, now: Date) {
    await this.db.from('bookings').update({ status: 'expired' })
      .eq('slot_date', b.slot_date).eq('test', b.test).eq('status', 'held').lt('hold_expires_at', now.toISOString())
    const { data, error } = await this.db.from('bookings').insert(b).select('id').single()
    if (error && CLASH.has(error.code)) return { ok: false as const }
    if (error) throw new Error(`booking hold failed: ${error.message}`)
    return { ok: true as const, id: (data as { id: string }).id }
  }
  async get(id: string) {
    if (!isBookingId(id)) return null
    const { data, error } = await this.db.from('bookings').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(`booking read failed: ${error.message}`)
    return (data as BookingRow | null) ?? null
  }
  async update(id: string, patch: Partial<BookingRow>, from: BookingStatus[]) {
    const { data, error } = await this.db.from('bookings').update(patch).eq('id', id).in('status', from).select('id')
    if (error && CLASH.has(error.code)) return 'conflict' as const
    if (error) throw new Error(`booking update failed: ${error.message}`)
    return data && data.length ? ('updated' as const) : ('unchanged' as const)
  }
  async releaseHoldsOf(email: string, test: boolean) {
    await this.db.from('bookings').update({ status: 'cancelled' }).eq('email', email).eq('test', test).eq('status', 'held')
  }
}

// ---------- local file (this computer only) ----------

export class MemoryStore implements Store {
  constructor(private file: string | null = null) {}
  private rows: BookingRow[] | null = null
  private load(): BookingRow[] {
    if (!this.rows) this.rows = this.file && existsSync(this.file) ? (JSON.parse(readFileSync(this.file, 'utf8')) as BookingRow[]) : []
    return this.rows
  }
  private save() {
    if (!this.file) return
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, JSON.stringify(this.rows, null, 2))
  }
  private clash(r: Pick<BookingRow, 'starts_at' | 'ends_at' | 'test'>, except?: string) {
    return this.load().some((o) => o.id !== except && ACTIVE.includes(o.status) && o.test === r.test && o.starts_at < r.ends_at && r.starts_at < o.ends_at)
  }
  async taken(from: string, to: string, test: boolean) {
    return this.load().filter((r) => ACTIVE.includes(r.status) && r.test === test && r.slot_date >= from && r.slot_date <= to)
      .map(({ slot_date, slot_time, session_minutes, status, hold_expires_at }) => ({ slot_date, slot_time, session_minutes, status, hold_expires_at }))
  }
  async hold(b: NewBooking, now: Date) {
    for (const r of this.load()) {
      if (r.status === 'held' && r.slot_date === b.slot_date && r.test === b.test && r.hold_expires_at < now.toISOString()) r.status = 'expired'
    }
    if (this.clash(b)) return { ok: false as const }
    const row: BookingRow = { ...b, id: randomUUID(), created_at: now.toISOString(), dodo_session_id: null, dodo_payment_id: null, paid_at: null }
    this.load().push(row)
    this.save()
    return { ok: true as const, id: row.id }
  }
  async get(id: string) {
    return this.load().find((r) => r.id === id) ?? null
  }
  async update(id: string, patch: Partial<BookingRow>, from: BookingStatus[]) {
    const row = this.load().find((r) => r.id === id)
    if (!row || !from.includes(row.status)) return 'unchanged' as const
    const next = { ...row, ...patch }
    if (ACTIVE.includes(next.status) && this.clash(next, id)) return 'conflict' as const
    Object.assign(row, patch)
    this.save()
    return 'updated' as const
  }
  async releaseHoldsOf(email: string, test: boolean) {
    for (const r of this.load()) if (r.email === email && r.test === test && r.status === 'held') r.status = 'cancelled'
    this.save()
  }
}

let cached: { key: string; store: Store } | null = null

export function storeFor(cfg: ServerConfig): Store | null {
  const key = cfg.store === 'supabase' ? `s:${cfg.supabase!.url}` : cfg.store
  if (cached?.key === key) return cached.store
  const store = cfg.store === 'supabase' ? new SupabaseStore(cfg.supabase!.url, cfg.supabase!.serviceKey)
    : cfg.store === 'memory' ? new MemoryStore(join(process.cwd(), '.data', 'dev-bookings.json'))
    : null
  cached = store ? { key, store } : null
  return store
}
