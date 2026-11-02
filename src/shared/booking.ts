/**
 * Booking rules shared by the website and the server (api/). The server is the authority: it repeats every check here
 * before it holds a slot or asks for a payment, and it alone decides the price.
 *
 * This file must stay self-contained (no imports): the server functions load it directly.
 */

export const SERVICES = ['numerology', 'palmistry', 'gemstone-guidance', 'color-therapy'] as const
export type ServiceSlug = (typeof SERVICES)[number]
/**
 * Every consultation is a voice call. In a chat, typing back and forth uses up the session before the question is
 * answered; on a call the whole session goes to the question.
 */
export const SESSION_MODE = 'voice'
export const sessionName = 'Voice call'

export const serviceNames: Record<ServiceSlug, string> = {
  numerology: 'Numerology',
  palmistry: 'Palmistry',
  'gemstone-guidance': 'Gemstone Guidance',
  'color-therapy': 'Color Therapy',
}

/** The consultation hours, in Indian time. */
export const schedule = {
  timeZone: 'Asia/Kolkata',
  /** first and last start time, every `everyMinutes` (sessions are 10 minutes, the gap leaves room to extend) */
  first: '17:30',
  last: '20:30',
  everyMinutes: 20,
  sessionMinutes: 10,
  /** how many days ahead can be booked, counting today */
  daysAhead: 14,
  /** a slot can be booked until this many minutes before it starts */
  leadMinutes: 60,
  /** how long a chosen slot is held while the customer pays */
  holdMinutes: 30,
  /** days with no sessions, 0 = Sunday */
  closedWeekdays: [] as number[],
} as const

/**
 * Prices in rupees for a voice consultation, before GST (Dodo Payments adds the GST on its checkout). The key is the
 * services in the order of SERVICES joined by "+". A combination with no price here is a customised plan, arranged on
 * WhatsApp.
 */
export const prices: Partial<Record<string, number>> = {
  numerology: 499,
  palmistry: 899,
  'gemstone-guidance': 699,
  'color-therapy': 299,
  'numerology+palmistry': 1299,
  'numerology+gemstone-guidance': 1099,
  'palmistry+gemstone-guidance': 1499,
  'gemstone-guidance+color-therapy': 899,
  'numerology+palmistry+gemstone-guidance+color-therapy': 2099,
}

/** The combinations offered as packages, in the order they are shown. */
export const PACKAGES: { services: ServiceSlug[]; name: string; note?: string; recommended?: boolean; minutes?: number }[] = [
  { services: ['numerology', 'palmistry'], name: 'Palmistry + Numerology', recommended: true },
  { services: ['numerology', 'gemstone-guidance'], name: 'Numerology + Gemstone Guidance' },
  { services: ['palmistry', 'gemstone-guidance'], name: 'Palmistry + Gemstone Guidance' },
  { services: ['gemstone-guidance', 'color-therapy'], name: 'Gemstone Guidance + Color Therapy' },
  { services: [...SERVICES], name: 'Diamond package', note: 'All four services in one 25-minute call', minutes: 25 },
]

/** Dodo Payments refuses payments under US$0.50, so no price may go below this many rupees. */
export const MIN_PRICE_INR = 50

/** Optional extra time, added at checkout. `null` hides the option. */
export const extension: { minutes: number; price: number | null } = { minutes: 10, price: null }

// ---------- services and prices ----------

/** Valid, unique services in the canonical order, or null. */
export function normaliseServices(input: unknown): ServiceSlug[] | null {
  if (!Array.isArray(input) || input.length === 0) return null
  if (!input.every((s) => typeof s === 'string' && (SERVICES as readonly string[]).includes(s))) return null
  const set = new Set(input as ServiceSlug[])
  return SERVICES.filter((s) => set.has(s))
}

export const comboKey = (services: readonly ServiceSlug[]) => SERVICES.filter((s) => services.includes(s)).join('+')
export const comboName = (services: readonly ServiceSlug[]) =>
  PACKAGES.find((p) => comboKey(p.services) === comboKey(services))?.name ?? SERVICES.filter((s) => services.includes(s)).map((s) => serviceNames[s]).join(' + ')

/**
 * The price in rupees, or null when it is not set. `testPrice` is used only in test mode (no real money moves), so the
 * flow can be tried before the real prices are entered.
 */
export function priceFor(services: readonly ServiceSlug[], testPrice: number | null = null): number | null {
  const set = prices[comboKey(services)]
  if (typeof set === 'number' && set > 0) return set
  return testPrice && testPrice > 0 ? testPrice : null
}

export const extensionPrice = (): number | null => (extension.price && extension.price > 0 ? extension.price : null)

export const formatRupees = (n: number) => `₹${n.toLocaleString('en-IN')}`
/** A price as customers see it before the payment page adds the GST. */
export const withGst = (n: number) => `${formatRupees(n)} + GST`

// ---------- time ----------

const pad = (n: number) => String(n).padStart(2, '0')
const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
const fromMinutes = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`

/** Every start time of the day: 17:30, 17:50 … 20:30. */
export function slotTimes(): string[] {
  const out: string[] = []
  for (let m = toMinutes(schedule.first); m <= toMinutes(schedule.last); m += schedule.everyMinutes) out.push(fromMinutes(m))
  return out
}

/** How long a consultation is: 10 minutes, a package that says so (the Diamond package, 25), plus any extra time. */
export function sessionMinutesFor(services: readonly ServiceSlug[], extend = false): number {
  const base = PACKAGES.find((p) => comboKey(p.services) === comboKey(services))?.minutes ?? schedule.sessionMinutes
  return base + (extend ? extension.minutes : 0)
}

/**
 * The slots a session takes up: the one it starts in and any later slot it runs into. A 25-minute call at 5:30 pm
 * also takes the 5:50 pm slot, so nobody else can book that one.
 */
export function slotsCovered(time: string, minutes: number): string[] {
  const start = toMinutes(time)
  return slotTimes().filter((t) => toMinutes(t) >= start && toMinutes(t) < start + minutes)
}

/** "5:30 pm" */
export function formatTime(t: string): string {
  const m = toMinutes(t)
  const h = Math.floor(m / 60)
  return `${((h + 11) % 12) + 1}:${pad(m % 60)} ${h < 12 ? 'am' : 'pm'}`
}

/** Today's date and the minutes past midnight, in Indian time. */
export function indiaNow(now = new Date()): { date: string; minutes: number } {
  const ist = new Date(now.getTime() + 330 * 60_000) // India has no daylight saving: always UTC+5:30
  return { date: `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}`, minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes() }
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay()

/** The dates that can be booked, starting today (Indian time). */
export function bookableDates(now = new Date()): string[] {
  const today = indiaNow(now).date
  return Array.from({ length: schedule.daysAhead }, (_, i) => addDays(today, i)).filter((d) => !(schedule.closedWeekdays as readonly number[]).includes(weekday(d)))
}

/** True if this date and time is a real slot that is still far enough ahead to book. */
export function isBookable(date: string, time: string, now = new Date()): boolean {
  if (!bookableDates(now).includes(date) || !slotTimes().includes(time)) return false
  const { date: today, minutes } = indiaNow(now)
  return date > today || toMinutes(time) - minutes >= schedule.leadMinutes
}

/** The moment a slot starts, as a real Date (for calendars). */
export const slotStart = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`)

// ---------- details ----------

export interface BookingDetails {
  name: string
  email: string
  phone: string
  dateOfBirth: string
  language: string
  concern: string
}
export type DetailErrors = Partial<Record<keyof BookingDetails, string>>

export const CONCERN_MIN = 10
export const CONCERN_MAX = 1000
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const PHONE_RE = /^\+?[0-9][0-9\s-]{6,17}[0-9]$/
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function dobError(v: string, now: Date): string | undefined {
  const m = ISO_RE.exec(v)
  if (!m) return 'Please enter your date of birth.'
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(y, mo - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return 'That date does not exist.'
  if (y < 1900) return 'Please enter a year from 1900 onwards.'
  if (v > indiaNow(now).date) return 'Your date of birth cannot be in the future.'
  return undefined
}

export function validateDetails(d: BookingDetails, now = new Date()): DetailErrors {
  const e: DetailErrors = {}
  const name = d.name.trim()
  if (name.length < 2) e.name = 'Please enter your full name.'
  else if (name.length > 80) e.name = 'Name is too long (80 characters maximum).'
  if (!d.email.trim()) e.email = 'Please enter your email address.'
  else if (!EMAIL_RE.test(d.email.trim()) || d.email.length > 254) e.email = 'That email address does not look right.'
  if (!d.phone.trim()) e.phone = 'Please enter your phone or WhatsApp number.'
  else if (!PHONE_RE.test(d.phone.trim())) e.phone = 'That phone number does not look right.'
  const dob = dobError(d.dateOfBirth, now)
  if (dob) e.dateOfBirth = dob
  if (d.language.length > 40) e.language = 'Language is too long.'
  const concern = d.concern.trim()
  if (concern.length < CONCERN_MIN) e.concern = `Please describe what you would like guidance on (at least ${CONCERN_MIN} characters).`
  else if (concern.length > CONCERN_MAX) e.concern = `Please keep this under ${CONCERN_MAX} characters.`
  return e
}

// ---------- the request the website sends to the server ----------

export interface BookingRequest {
  details: BookingDetails
  services: ServiceSlug[]
  date: string
  time: string
  extend: boolean
  consent: true
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')

/** Checks everything the server needs; returns a clean copy or the reason it was refused. */
export function parseBookingRequest(raw: unknown, now = new Date()): { ok: true; value: BookingRequest } | { ok: false; error: 'invalid'; fields?: DetailErrors } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'invalid' }
  const r = raw as Record<string, unknown>
  const d = (r.details ?? {}) as Record<string, unknown>
  const details: BookingDetails = {
    name: str(d.name, 200).trim(),
    email: str(d.email, 300).trim(),
    phone: str(d.phone, 40).trim(),
    dateOfBirth: str(d.dateOfBirth, 10),
    language: str(d.language, 60).trim(),
    concern: str(d.concern, CONCERN_MAX + 200).trim(),
  }
  const fields = validateDetails(details, now)
  if (Object.keys(fields).length) return { ok: false, error: 'invalid', fields }
  const services = normaliseServices(r.services)
  const date = str(r.date, 10)
  const time = str(r.time, 5)
  if (!services || r.consent !== true || !isBookable(date, time, now)) return { ok: false, error: 'invalid' }
  return { ok: true, value: { details, services, date, time, extend: r.extend === true, consent: true } }
}
