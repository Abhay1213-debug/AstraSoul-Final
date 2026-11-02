import { context, handleEvent, json } from './_lib/bookings.js'
import { verifyWebhook } from './_lib/dodo.js'

/** POST /api/dodo-webhook: Dodo tells the site about payments. Only signed messages are accepted. */
export async function POST(request: Request): Promise<Response> {
  const body = await request.text()
  const ctx = context()
  if (!ctx.cfg.dodo?.webhookKey || !verifyWebhook(request.headers, body, ctx.cfg.dodo.webhookKey)) return json({ error: 'bad_signature' }, 401)
  try {
    await handleEvent(ctx, JSON.parse(body))
    return json({ ok: true })
  } catch (e) {
    console.error(e)
    return json({ error: 'retry' }, 500) // Dodo retries failed deliveries
  }
}
