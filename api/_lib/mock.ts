import { randomUUID } from 'node:crypto'
import type { Payments, PaymentInfo } from './dodo.js'

/**
 * Simulated payments, for this computer only, before a Dodo key is added. The "checkout" is a small page served by the
 * dev server (/api/dev/mock-pay) with two buttons: pay or cancel. It is never deployed: Vercel does not serve files in
 * folders starting with "_" as endpoints, and readConfig never chooses it on the live site.
 */
const sessions = new Map<string, { amountPaise: number; returnUrl: string; metadata: Record<string, string>; paymentId: string | null; status: string | null }>()
const payments = new Map<string, PaymentInfo>()

export const mockPayments: Payments = {
  async createCheckout(i) {
    const sessionId = `mock_cks_${randomUUID().slice(0, 8)}`
    sessions.set(sessionId, { amountPaise: i.amountPaise, returnUrl: i.returnUrl, metadata: i.metadata, paymentId: null, status: null })
    const origin = new URL(i.returnUrl).origin
    return { sessionId, url: `${origin}/api/dev/mock-pay?session=${sessionId}` }
  },
  async getPayment(id) {
    return payments.get(id) ?? null
  },
  async getSessionPayment(sessionId) {
    const s = sessions.get(sessionId)
    return s ? { paymentId: s.paymentId, status: s.status } : null
  },
}

const page = (body: string) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Test checkout</title>
<style>body{font:16px/1.5 system-ui;background:#0c1030;color:#f6f4ec;display:grid;place-items:center;min-height:100vh;margin:0}main{background:#fffdf7;color:#151a45;border-radius:18px;padding:32px;max-width:380px;width:calc(100% - 32px)}h1{margin:0 0 4px;font-size:22px}p{margin:0 0 20px;color:#555}button{display:block;width:100%;padding:14px;border-radius:999px;border:0;font:600 16px system-ui;margin-top:10px;cursor:pointer}.pay{background:#f2b03e;color:#151a45}.no{background:#eee;color:#151a45}</style><main>${body}</main>`, { headers: { 'content-type': 'text/html; charset=utf-8' } })

export async function GET(request: Request): Promise<Response> {
  const id = new URL(request.url).searchParams.get('session') ?? ''
  const s = sessions.get(id)
  if (!s) return page('<h1>Test checkout</h1><p>This test checkout has expired. Go back to the site and try again.</p>')
  return page(`<h1>Test checkout</h1><p>No real money moves here. This page stands in for Dodo Payments until the Dodo key is added.</p>
<p><strong>Amount: ₹${(s.amountPaise / 100).toLocaleString('en-IN')}</strong><br>Slot: ${s.metadata.slot ?? ''}</p>
<form method="post"><input type="hidden" name="session" value="${id}"><button class="pay" name="result" value="succeeded">Pay (test)</button><button class="no" name="result" value="failed">Payment fails</button></form>`)
}

export async function POST(request: Request): Promise<Response> {
  const form = new URLSearchParams(await request.text())
  const id = form.get('session') ?? ''
  const s = sessions.get(id)
  if (!s) return GET(request)
  const status = form.get('result') === 'succeeded' ? 'succeeded' : 'failed'
  const paymentId = `mock_pay_${randomUUID().slice(0, 8)}`
  payments.set(paymentId, { id: paymentId, status, totalPaise: s.amountPaise, metadata: s.metadata })
  s.paymentId = paymentId
  s.status = status
  const back = new URL(s.returnUrl)
  back.searchParams.set('payment_id', paymentId)
  back.searchParams.set('status', status)
  return Response.redirect(back.toString(), 303)
}
