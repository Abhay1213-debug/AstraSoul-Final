import { context, json, listSlots } from './_lib/bookings.js'

/** GET /api/slots: the next two weeks of slots (free, booked or closed) and whether online booking is open. */
export async function GET(): Promise<Response> {
  try {
    return json(await listSlots(context()))
  } catch (e) {
    console.error(e)
    return json({ error: 'unavailable' }, 503)
  }
}
