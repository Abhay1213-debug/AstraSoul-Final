import { context, json, viewBooking } from './_lib/bookings.js'

/** GET /api/booking?id=…&payment_id=…: the booking's status, confirming the payment with Dodo first if needed. */
export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams
  try {
    return await viewBooking(context(), q.get('id'), q.get('payment_id'))
  } catch (e) {
    console.error(e)
    return json({ error: 'unavailable' }, 503)
  }
}
