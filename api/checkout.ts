import { context, json, retryCheckout, startCheckout } from './_lib/bookings.js'

/**
 * POST /api/checkout: holds the chosen slot and returns the Dodo checkout link. With { retry: bookingId } it reopens
 * payment for a booking whose payment did not go through.
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid' }, 400)
  }
  const origin = new URL(request.url).origin
  try {
    const ctx = context()
    const retry = (body as { retry?: unknown } | null)?.retry
    return retry ? await retryCheckout(ctx, retry, origin) : await startCheckout(ctx, body, origin)
  } catch (e) {
    console.error(e)
    return json({ error: 'unavailable' }, 503)
  }
}
