import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { handleEvent, listSlots, retryCheckout, startCheckout, viewBooking, type Ctx } from './bookings.js'
import type { ServerConfig } from './config.js'
import { dodoPayments, toE164, verifyWebhook, type Payments, type PaymentInfo } from './dodo.js'
import { MemoryStore } from './store.js'

const NOW = new Date('2026-10-30T08:30:00Z') // 2 pm in India
const details = { name: 'Asha Rao', email: 'Asha@Example.com', phone: '98765 43210', dateOfBirth: '1990-03-29', language: 'Hindi', concern: 'Career direction this year.' }
const request = (over: Record<string, unknown> = {}) => ({ details, services: ['palmistry', 'numerology'], date: '2026-10-31', time: '17:30', extend: false, consent: true, ...over })

function setup(payments: ServerConfig['payments'] = 'test') {
  const sessions: { amountPaise: number; metadata: Record<string, string> }[] = []
  const paymentsById = new Map<string, PaymentInfo>()
  const pay: Payments = {
    async createCheckout(i) {
      sessions.push(i)
      return { sessionId: `cks_${sessions.length}`, url: `https://test.checkout.dodopayments.com/cks_${sessions.length}` }
    },
    async getPayment(id) { return paymentsById.get(id) ?? null },
    async getSessionPayment() { return null },
  }
  const cfg: ServerConfig = { dev: false, payments, dodo: null, store: 'memory', supabase: null, testPrice: payments === 'live' ? null : 1, siteUrl: null }
  const ctx: Ctx = { cfg, store: new MemoryStore(null), pay }
  // Palmistry + Numerology is ₹1,299; Dodo adds 18% GST on top, so the customer pays ₹1,532.82
  const paid = (id: string, bookingId: string, status = 'succeeded', total = 153282) => paymentsById.set(id, { id, status, totalPaise: total, metadata: { booking_id: bookingId } })
  return { ctx, sessions, paid }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const body = async (r: Response): Promise<Record<string, any>> => ({ status: r.status, ...((await r.json()) as Record<string, any>) })

describe('booking on the server', () => {
  it('holds the slot, charges the server’s price (not the browser’s), and blocks the slot for others', async () => {
    const { ctx, sessions } = setup()
    const first = await body(await startCheckout(ctx, { ...request(), amount: 1 }, 'http://localhost', NOW))
    expect(first.status).toBe(200)
    expect(first.url).toMatch(/^https:\/\/test\.checkout/)
    expect(sessions[0].amountPaise).toBe(129900) // the package price before GST, set on the server
    expect(sessions[0].metadata).toMatchObject({ booking_id: first.bookingId, slot: '2026-10-31 5:30 pm IST', consultation: 'Palmistry + Numerology', mode: 'Voice call' })
    const second = await body(await startCheckout(ctx, request({ details: { ...details, email: 'ravi@example.com' } }), 'http://localhost', NOW))
    expect(second).toMatchObject({ status: 409, error: 'slot_taken' })
    const slots = await listSlots(ctx, NOW)
    expect(slots.days.find((d) => d.date === '2026-10-31')!.slots[0]).toEqual({ time: '17:30', status: 'booked' })
    expect(slots.days[0].slots.every((s) => s.status !== 'free' || s.time >= '15:00')).toBe(true)
  })

  it('lets a 25-minute Diamond booking take the next slot too, so nobody can book into it', async () => {
    const { ctx, sessions } = setup()
    const diamond = request({ services: ['numerology', 'palmistry', 'gemstone-guidance', 'color-therapy'] })
    expect((await startCheckout(ctx, diamond, 'http://localhost', NOW)).status).toBe(200)
    expect(sessions[0].amountPaise).toBe(209900)
    expect(sessions[0].metadata).toMatchObject({ consultation: 'Diamond package', length: '25 minutes' })
    const day = (await listSlots(ctx, NOW)).days.find((d) => d.date === '2026-10-31')!
    expect(day.slots.slice(0, 3).map((s) => s.status)).toEqual(['booked', 'booked', 'free'])
    const ravi = { ...details, email: 'ravi@example.com' }
    expect((await startCheckout(ctx, request({ details: ravi, services: ['numerology'], time: '17:50' }), 'http://localhost', NOW)).status).toBe(409)
    expect((await startCheckout(ctx, request({ details: ravi, services: ['numerology'], time: '18:10' }), 'http://localhost', NOW)).status).toBe(200)
  })

  it('refuses a Diamond booking that would run into a slot someone else has', async () => {
    const { ctx } = setup()
    await startCheckout(ctx, request({ services: ['numerology'], time: '17:50' }), 'http://localhost', NOW)
    const diamond = request({ details: { ...details, email: 'ravi@example.com' }, services: ['numerology', 'palmistry', 'gemstone-guidance', 'color-therapy'] })
    expect((await body(await startCheckout(ctx, diamond, 'http://localhost', NOW)))).toMatchObject({ status: 409, error: 'slot_taken' })
  })

  it('frees a slot whose payment was never made once the hold lapses', async () => {
    const { ctx } = setup()
    await startCheckout(ctx, request(), 'http://localhost', NOW)
    const later = new Date(NOW.getTime() + 31 * 60_000)
    const other = await body(await startCheckout(ctx, request({ details: { ...details, email: 'ravi@example.com' } }), 'http://localhost', later))
    expect(other.status).toBe(200)
  })

  it('refuses a combination with no price (a customised plan) on the live site', async () => {
    const { ctx } = setup('live')
    expect((await startCheckout(ctx, request({ services: ['numerology', 'color-therapy'] }), 'http://localhost', NOW)).status).toBe(409)
    expect((await startCheckout(ctx, request(), 'http://localhost', NOW)).status).toBe(200)
  })

  it('does not accept a payment for less than the price', async () => {
    const { ctx, paid } = setup()
    const { bookingId } = await body(await startCheckout(ctx, request(), 'http://localhost', NOW))
    paid('pay_low', bookingId, 'succeeded', 100)
    expect((await body(await viewBooking(ctx, bookingId, 'pay_low', NOW))).status).toBe('held')
  })

  it('rejects incomplete details with the field messages', async () => {
    const { ctx } = setup()
    const r = await body(await startCheckout(ctx, request({ details: { ...details, phone: '' } }), 'http://localhost', NOW))
    expect(r).toMatchObject({ status: 400, error: 'invalid', fields: { phone: expect.any(String) } })
  })

  it('marks the booking paid only when Dodo confirms this payment for this booking', async () => {
    const { ctx, paid } = setup()
    const { bookingId } = await body(await startCheckout(ctx, request(), 'http://localhost', NOW))
    paid('pay_other', 'some-other-booking')
    expect((await body(await viewBooking(ctx, bookingId, 'pay_other', NOW))).status).toBe('held')
    paid('pay_1', bookingId)
    const v = await body(await viewBooking(ctx, bookingId, 'pay_1', NOW))
    expect(v).toMatchObject({ status: 'paid', date: '2026-10-31', time: '17:30', firstName: 'Asha', amount: 1299, test: true })
    expect(v).not.toHaveProperty('email')
    expect(v).not.toHaveProperty('phone')
  })

  it('releases the slot when the payment fails, and "try again" holds it again', async () => {
    const { ctx, paid } = setup()
    const { bookingId } = await body(await startCheckout(ctx, request(), 'http://localhost', NOW))
    paid('pay_f', bookingId, 'failed')
    expect((await body(await viewBooking(ctx, bookingId, 'pay_f', NOW))).status).toBe('cancelled')
    expect((await listSlots(ctx, NOW)).days.find((d) => d.date === '2026-10-31')!.slots[0].status).toBe('free')
    const again = await body(await retryCheckout(ctx, bookingId, 'http://localhost', NOW))
    expect(again.status).toBe(200)
    expect((await listSlots(ctx, NOW)).days.find((d) => d.date === '2026-10-31')!.slots[0].status).toBe('booked')
  })

  it('keeps a late payment but flags it when someone else took the slot meanwhile', async () => {
    const { ctx, paid } = setup()
    const { bookingId } = await body(await startCheckout(ctx, request(), 'http://localhost', NOW))
    const later = new Date(NOW.getTime() + 40 * 60_000)
    await startCheckout(ctx, request({ details: { ...details, email: 'ravi@example.com' } }), 'http://localhost', later)
    paid('pay_late', bookingId)
    expect((await body(await viewBooking(ctx, bookingId, 'pay_late', later))).status).toBe('conflict')
  })

  it('confirms a booking from Dodo’s webhook even if the customer never comes back', async () => {
    const { ctx, paid } = setup()
    const { bookingId } = await body(await startCheckout(ctx, request(), 'http://localhost', NOW))
    paid('pay_w', bookingId)
    await handleEvent(ctx, { type: 'payment.succeeded', data: { payment_id: 'pay_w', metadata: { booking_id: bookingId } } }, NOW)
    expect((await body(await viewBooking(ctx, bookingId, null, NOW))).status).toBe('paid')
  })

  it('says booking is closed when payments or storage are not set up', async () => {
    const { ctx } = setup()
    const closed = { ...ctx, pay: null }
    expect((await listSlots(closed, NOW)).ready).toBe(false)
    expect((await startCheckout(closed, request(), 'http://localhost', NOW)).status).toBe(503)
  })
})

describe('Dodo Payments', () => {
  it('sends the checkout Dodo expects', async () => {
    let sent: { url: string; init: RequestInit } | null = null
    const fake = (async (url: string, init: RequestInit) => {
      sent = { url, init }
      return new Response(JSON.stringify({ session_id: 'cks_1', checkout_url: 'https://checkout/x' }), { status: 200 })
    }) as unknown as typeof fetch
    const dodo = dodoPayments({ apiKey: 'test_key', base: 'https://test.dodopayments.com', productId: 'pdt_1' }, fake)
    await dodo.createCheckout({ amountPaise: 49900, customer: { name: 'Asha', email: 'a@b.co', phone: '98765 43210' }, returnUrl: 'https://ankiro.in/booking/x', metadata: { booking_id: 'x' } })
    expect(sent!.url).toBe('https://test.dodopayments.com/checkouts')
    expect((sent!.init.headers as Record<string, string>).Authorization).toBe('Bearer test_key')
    expect(JSON.parse(sent!.init.body as string)).toEqual({
      product_cart: [{ product_id: 'pdt_1', quantity: 1, amount: 49900 }],
      customer: { email: 'a@b.co', name: 'Asha', phone_number: '+919876543210' },
      billing_address: { country: 'IN' },
      minimal_address: true,
      feature_flags: { allow_customer_editing_country: true, redirect_immediately: true },
      return_url: 'https://ankiro.in/booking/x',
      cancel_url: 'https://ankiro.in/booking/x?status=cancelled',
      metadata: { booking_id: 'x' },
    })
  })

  it('normalises Indian phone numbers', () => {
    expect(toE164('98765 43210')).toBe('+919876543210')
    expect(toE164('098765-43210')).toBe('+919876543210')
    expect(toE164('+44 7700 900123')).toBe('+447700900123')
    expect(toE164('123')).toBeUndefined()
  })

  it('accepts only correctly signed, recent webhooks', () => {
    const secret = `whsec_${Buffer.from('a-very-secret-key').toString('base64')}`
    const body = '{"type":"payment.succeeded"}'
    const ts = String(Math.floor(Date.now() / 1000))
    const sig = createHmac('sha256', Buffer.from('a-very-secret-key')).update(`msg_1.${ts}.${body}`).digest('base64')
    const h = (s: string, t = ts) => new Headers({ 'webhook-id': 'msg_1', 'webhook-timestamp': t, 'webhook-signature': s })
    expect(verifyWebhook(h(`v1,${sig}`), body, secret)).toBe(true)
    expect(verifyWebhook(h(`v1,bad v1,${sig}`), body, secret)).toBe(true)
    expect(verifyWebhook(h(`v1,${sig}`), `${body} `, secret)).toBe(false)
    expect(verifyWebhook(h('v1,AAAA'), body, secret)).toBe(false)
    expect(verifyWebhook(h(`v1,${sig}`, String(Number(ts) - 600)), body, secret)).toBe(false)
    expect(verifyWebhook(h(`v1,${sig}`), body, '')).toBe(false)
  })
})
