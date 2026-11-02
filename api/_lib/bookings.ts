import {
  SESSION_MODE, bookableDates, comboName, extensionPrice, formatTime, isBookable, parseBookingRequest, priceFor, prices,
  schedule, sessionMinutesFor, sessionName, slotTimes, slotsCovered, type ServiceSlug,
} from '../../src/shared/booking.js'
import { isTestConfig, readConfig, type ServerConfig } from './config.js'
import { dodoPayments, type Payments } from './dodo.js'
import { mockPayments } from './mock.js'
import { isBookingId, storeFor, type BookingRow, type Store } from './store.js'

/**
 * The booking rules on the server: which slots are free, holding a slot while the customer pays, and marking the
 * booking paid only after Dodo confirms the payment (on the customer's return and again by webhook, whichever comes
 * first; both are safe to repeat).
 */
export interface Ctx { cfg: ServerConfig; store: Store | null; pay: Payments | null }

export function context(cfg = readConfig()): Ctx {
  const pay = cfg.payments === 'mock' ? mockPayments : cfg.dodo ? dodoPayments(cfg.dodo) : null
  return { cfg, store: storeFor(cfg), pay }
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

const ready = (ctx: Ctx): ctx is Ctx & { store: Store; pay: Payments } => Boolean(ctx.store && ctx.pay)

// ---------- free slots ----------

export async function listSlots(ctx: Ctx, now = new Date()) {
  const dates = bookableDates(now)
  const base = { payments: ctx.cfg.payments, testPrice: ctx.cfg.testPrice, prices, extensionPrice: extensionPrice() }
  if (!ready(ctx) || !dates.length) return { ...base, ready: false, days: [] }
  const taken = await ctx.store.taken(dates[0], dates[dates.length - 1], isTestConfig(ctx.cfg))
  // a booking takes up every slot its session runs into (the 25-minute Diamond package takes two)
  const busy = new Set(taken.filter((t) => t.status === 'paid' || t.hold_expires_at > now.toISOString())
    .flatMap((t) => slotsCovered(t.slot_time, t.session_minutes).map((slot) => `${t.slot_date} ${slot}`)))
  const days = dates.map((date) => ({
    date,
    slots: slotTimes().map((time) => ({ time, status: busy.has(`${date} ${time}`) ? 'booked' : isBookable(date, time, now) ? 'free' : 'closed' })),
  }))
  return { ...base, ready: true, days }
}

// ---------- start paying ----------

function returnUrl(ctx: Ctx, origin: string, id: string) {
  return `${ctx.cfg.siteUrl ?? origin}/booking/${id}`
}

/** Indian wall-clock time as YYYY-MM-DDTHH:MM:SS, `plus` minutes after the given date and time. */
const wallClock = (date: string, time: string, plus = 0) => new Date(Date.parse(`${date}T${time}:00Z`) + plus * 60_000).toISOString().slice(0, 19)

async function openCheckout(ctx: Ctx & { pay: Payments }, row: Pick<BookingRow, 'id' | 'amount_paise' | 'name' | 'email' | 'phone' | 'slot_date' | 'slot_time' | 'session_minutes' | 'services' | 'extension'>, origin: string) {
  return ctx.pay.createCheckout({
    amountPaise: row.amount_paise,
    customer: { name: row.name, email: row.email, phone: row.phone },
    returnUrl: returnUrl(ctx, origin, row.id),
    metadata: {
      booking_id: row.id,
      slot: `${row.slot_date} ${formatTime(row.slot_time)} IST`,
      mode: sessionName,
      length: `${row.session_minutes} minutes`,
      consultation: comboName(row.services as ServiceSlug[]),
      extra_time: row.extension ? 'yes' : 'no',
    },
  })
}

export async function startCheckout(ctx: Ctx, raw: unknown, origin: string, now = new Date()) {
  if (!ready(ctx)) return json({ error: 'unavailable' }, 503)
  const parsed = parseBookingRequest(raw, now)
  if (!parsed.ok) return json({ error: 'invalid', fields: parsed.fields }, 400)
  const r = parsed.value
  const base = priceFor(r.services, ctx.cfg.testPrice)
  const extra = r.extend ? extensionPrice() : 0
  if (!base || extra === null) return json({ error: 'no_price' }, 409)
  const test = isTestConfig(ctx.cfg)
  const minutes = sessionMinutesFor(r.services, r.extend)
  await ctx.store.releaseHoldsOf(r.details.email.toLowerCase(), test)
  const row = {
    status: 'held' as const,
    hold_expires_at: new Date(now.getTime() + schedule.holdMinutes * 60_000).toISOString(),
    slot_date: r.date, slot_time: r.time, session_minutes: minutes, starts_at: wallClock(r.date, r.time), ends_at: wallClock(r.date, r.time, minutes),
    mode: SESSION_MODE, services: r.services, extension: r.extend,
    amount_paise: (base + (extra ?? 0)) * 100, currency: 'INR' as const, test,
    name: r.details.name, email: r.details.email.toLowerCase(), phone: r.details.phone, date_of_birth: r.details.dateOfBirth,
    language: r.details.language, concern: r.details.concern,
  }
  const held = await ctx.store.hold(row, now)
  if (!held.ok) return json({ error: 'slot_taken' }, 409)
  try {
    const session = await openCheckout(ctx, { ...row, id: held.id }, origin)
    await ctx.store.update(held.id, { dodo_session_id: session.sessionId }, ['held'])
    return json({ bookingId: held.id, url: session.url })
  } catch (e) {
    await ctx.store.update(held.id, { status: 'cancelled' }, ['held'])
    console.error(e)
    return json({ error: 'payment_unavailable' }, 502)
  }
}

/** "Try again" after a payment that did not go through: the same booking, the same slot if it is still free. */
export async function retryCheckout(ctx: Ctx, id: unknown, origin: string, now = new Date()) {
  if (!ready(ctx)) return json({ error: 'unavailable' }, 503)
  const b = isBookingId(id) ? await ctx.store.get(id) : null
  if (!b) return json({ error: 'not_found' }, 404)
  if (b.status === 'paid' || b.status === 'conflict') return json({ error: 'already_paid' }, 409)
  if (!isBookable(b.slot_date, b.slot_time, now)) return json({ error: 'slot_taken' }, 409)
  const patch = { status: 'held' as const, hold_expires_at: new Date(now.getTime() + schedule.holdMinutes * 60_000).toISOString() }
  if (b.status === 'held') {
    if (b.hold_expires_at < now.toISOString()) await ctx.store.update(b.id, { hold_expires_at: patch.hold_expires_at }, ['held'])
  } else {
    await ctx.store.releaseHoldsOf(b.email, b.test)
    const r = await ctx.store.update(b.id, patch, ['cancelled', 'expired'])
    if (r !== 'updated') return json({ error: 'slot_taken' }, 409)
  }
  try {
    const session = await openCheckout(ctx, b, origin)
    await ctx.store.update(b.id, { dodo_session_id: session.sessionId }, ['held'])
    return json({ bookingId: b.id, url: session.url })
  } catch (e) {
    console.error(e)
    return json({ error: 'payment_unavailable' }, 502)
  }
}

// ---------- after paying ----------

const FAILED = new Set(['failed', 'cancelled', 'requires_payment_method'])

/** Marks a booking paid if Dodo says this payment for this booking succeeded. Safe to call any number of times. */
export async function settle(ctx: Ctx, b: BookingRow, paymentId: string | null, now = new Date()): Promise<BookingRow> {
  if (!ready(ctx) || b.status === 'paid' || b.status === 'conflict') return b
  let id = paymentId
  if (!id && b.dodo_session_id) id = (await ctx.pay.getSessionPayment(b.dodo_session_id))?.paymentId ?? null
  if (!id) return b
  const p = await ctx.pay.getPayment(id)
  if (!p || p.metadata.booking_id !== b.id) return b
  if (p.status === 'succeeded' && p.totalPaise >= b.amount_paise) {
    const paid = { status: 'paid' as const, dodo_payment_id: p.id, paid_at: now.toISOString() }
    const r = await ctx.store.update(b.id, paid, ['held', 'expired', 'cancelled'])
    // the hold lapsed and someone else took the slot before this payment arrived: keep the payment, flag it for the team
    if (r === 'conflict') await ctx.store.update(b.id, { ...paid, status: 'conflict' }, ['held', 'expired', 'cancelled'])
    return (await ctx.store.get(b.id)) ?? b
  }
  if (p.status && FAILED.has(p.status) && b.status === 'held') {
    await ctx.store.update(b.id, { status: 'cancelled' }, ['held'])
    return (await ctx.store.get(b.id)) ?? b
  }
  return b
}

/** What the booking page may show: enough to recognise the booking, nothing private beyond the first name. */
export function publicView(b: BookingRow, now = new Date()) {
  const status = b.status === 'held' && b.hold_expires_at < now.toISOString() ? 'expired' : b.status
  return {
    id: b.id,
    status,
    date: b.slot_date,
    time: b.slot_time,
    services: b.services,
    extension: b.extension,
    amount: b.amount_paise / 100,
    test: b.test,
    firstName: b.name.split(/\s+/)[0],
    reference: b.id.slice(0, 8).toUpperCase(),
  }
}

export async function viewBooking(ctx: Ctx, id: string | null, paymentId: string | null, now = new Date()) {
  if (!ready(ctx)) return json({ error: 'unavailable' }, 503)
  const b = isBookingId(id) ? await ctx.store.get(id) : null
  if (!b) return json({ error: 'not_found' }, 404)
  const settled = await settle(ctx, b, paymentId, now)
  return json(publicView(settled, now))
}

/** Dodo webhook events: the source of truth if the customer closes the tab before coming back. */
export async function handleEvent(ctx: Ctx, event: { type?: string; data?: { payment_id?: string; metadata?: Record<string, unknown> } }, now = new Date()) {
  if (!ready(ctx)) return
  const id = event.data?.metadata?.booking_id
  const paymentId = event.data?.payment_id
  if (!event.type?.startsWith('payment.') || !isBookingId(id) || !paymentId) return
  const b = await ctx.store.get(id)
  if (b) await settle(ctx, b, paymentId, now)
}
