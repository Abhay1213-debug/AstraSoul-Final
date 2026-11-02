import type { BookingRequest, DetailErrors, ServiceSlug } from '../shared/booking'

/** The website's side of the booking endpoints in api/. */
export type SlotStatus = 'free' | 'booked' | 'closed'
export interface SlotDay { date: string; slots: { time: string; status: SlotStatus }[] }
export interface SlotsInfo {
  ready: boolean
  payments: 'live' | 'test' | 'mock' | 'off'
  testPrice: number | null
  days: SlotDay[]
}
export interface BookingView {
  id: string
  status: 'held' | 'paid' | 'cancelled' | 'expired' | 'conflict'
  date: string
  time: string
  services: ServiceSlug[]
  extension: boolean
  amount: number
  test: boolean
  firstName: string
  reference: string
}
export type CheckoutResult =
  | { ok: true; url: string; bookingId: string }
  | { ok: false; error: 'slot_taken' | 'invalid' | 'no_price' | 'unavailable' | 'already_paid' | 'not_found'; fields?: DetailErrors }

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}

export const fetchSlots = () => getJson<SlotsInfo>('/api/slots')

export function fetchBooking(id: string, paymentId?: string | null) {
  const q = new URLSearchParams({ id })
  if (paymentId) q.set('payment_id', paymentId)
  return getJson<BookingView>(`/api/booking?${q}`)
}

async function postCheckout(body: unknown): Promise<CheckoutResult> {
  try {
    const res = await fetch('/api/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const data = (await res.json().catch(() => ({}))) as { url?: string; bookingId?: string; error?: string; fields?: DetailErrors }
    if (res.ok && data.url && data.bookingId) return { ok: true, url: data.url, bookingId: data.bookingId }
    const known = ['slot_taken', 'invalid', 'no_price', 'already_paid', 'not_found'] as const
    const error = known.find((k) => k === data.error) ?? 'unavailable'
    return { ok: false, error, fields: data.fields }
  } catch {
    return { ok: false, error: 'unavailable' }
  }
}

/** Leaving for the payment page (one place, so tests can watch it). */
export const browser = { go: (url: string) => window.location.assign(url) }

export const startCheckout = (req: BookingRequest) => postCheckout(req)
export const retryCheckout = (bookingId: string) => postCheckout({ retry: bookingId })
