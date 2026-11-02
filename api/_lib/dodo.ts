import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * The few Dodo Payments calls the site needs: open a checkout for one booking, and read a payment back to check it.
 * Payment details (UPI, cards) are entered on Dodo's own checkout page; this site never sees them.
 */
export interface CheckoutInput {
  amountPaise: number
  customer: { name: string; email: string; phone: string }
  returnUrl: string
  metadata: Record<string, string>
}
export interface PaymentInfo {
  id: string
  status: string | null
  totalPaise: number
  metadata: Record<string, unknown>
}
export interface Payments {
  createCheckout(input: CheckoutInput): Promise<{ sessionId: string; url: string }>
  getPayment(id: string): Promise<PaymentInfo | null>
  /** The payment made through a checkout session, if any. */
  getSessionPayment(sessionId: string): Promise<{ paymentId: string | null; status: string | null } | null>
}

/** +91 is assumed for a 10-digit Indian number; anything that is not then a clean international number is left out. */
export function toE164(phone: string): string | undefined {
  const digits = phone.replace(/[\s-]/g, '')
  const n = /^\d{10}$/.test(digits) ? `+91${digits}` : /^0\d{10}$/.test(digits) ? `+91${digits.slice(1)}` : digits.startsWith('+') ? digits : `+${digits}`
  return /^\+\d{10,15}$/.test(n) ? n : undefined
}

export function dodoPayments(cfg: { apiKey: string; base: string; productId: string }, fetcher: typeof fetch = fetch): Payments {
  const call = async (path: string, init?: RequestInit) => {
    const res = await fetcher(`${cfg.base}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Dodo ${path.split('/')[1]} failed: ${res.status} ${(await res.text()).slice(0, 300)}`)
    return res.json() as Promise<Record<string, unknown>>
  }
  return {
    async createCheckout(i) {
      const phone = toE164(i.customer.phone)
      const cancel = new URL(i.returnUrl)
      cancel.searchParams.set('status', 'cancelled')
      const body = {
        product_cart: [{ product_id: cfg.productId, quantity: 1, amount: i.amountPaise }],
        customer: { email: i.customer.email, name: i.customer.name, ...(phone ? { phone_number: phone } : {}) },
        // India first, and only the PIN code asked for; the customer can still change the country
        billing_address: { country: 'IN' },
        minimal_address: true,
        feature_flags: { allow_customer_editing_country: true, redirect_immediately: true },
        return_url: i.returnUrl,
        // Dodo's back button: the booking page then offers to try the payment again
        cancel_url: cancel.toString(),
        metadata: i.metadata,
      }
      const r = await call('/checkouts', { method: 'POST', body: JSON.stringify(body) })
      if (!r || typeof r.checkout_url !== 'string' || typeof r.session_id !== 'string') throw new Error('Dodo did not return a checkout link')
      return { sessionId: r.session_id, url: r.checkout_url }
    },
    async getPayment(id) {
      if (!/^[\w-]{4,80}$/.test(id)) return null
      const r = await call(`/payments/${encodeURIComponent(id)}`)
      if (!r) return null
      return { id: String(r.payment_id), status: (r.status as string | null) ?? null, totalPaise: Number(r.total_amount ?? 0), metadata: (r.metadata as Record<string, unknown>) ?? {} }
    },
    async getSessionPayment(sessionId) {
      const r = await call(`/checkouts/${encodeURIComponent(sessionId)}`)
      if (!r) return null
      return { paymentId: (r.payment_id as string | null) ?? null, status: (r.payment_status as string | null) ?? null }
    },
  }
}

/**
 * Checks a webhook's signature (Standard Webhooks, as Dodo uses): HMAC-SHA256 of "id.timestamp.body" with the
 * secret after "whsec_", base64. Rejects anything older or newer than five minutes.
 */
export function verifyWebhook(headers: Headers, body: string, secret: string, now = Date.now()): boolean {
  const id = headers.get('webhook-id')
  const ts = headers.get('webhook-timestamp')
  const sigs = headers.get('webhook-signature')
  if (!id || !ts || !sigs || !secret) return false
  if (!/^\d+$/.test(ts) || Math.abs(now / 1000 - Number(ts)) > 300) return false
  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64')
  const expected = createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest()
  return sigs.split(' ').some((part) => {
    const [version, sig] = part.split(',')
    if (version !== 'v1' || !sig) return false
    const given = Buffer.from(sig, 'base64')
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
}
