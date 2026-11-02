/**
 * Central site configuration: brand, contact channels, operator, session facts, payment details and the refund rule.
 * Prices live in `pricing.ts`.
 */

const env = import.meta.env

export const siteConfig = {
  /** The brand name. VITE_BRAND_NAME overrides it without touching code. */
  brandName: (env.VITE_BRAND_NAME as string | undefined)?.trim() || 'Ankiro',
  tagline: (env.VITE_BRAND_TAGLINE as string | undefined)?.trim() || 'Where your numbers find their voice',
  /** Public contact email (the owner's mailbox until a branded address exists). VITE_CONTACT_EMAIL overrides it; set it to "none" to switch email contact off. */
  contactEmail: (() => {
    const v = ((env.VITE_CONTACT_EMAIL as string | undefined) ?? '').trim()
    return v.toLowerCase() === 'none' ? '' : v || 'abhayprabhakar1213@gmail.com'
  })(),
} as const

/** The channels the "Get in touch" button and the contact page offer. Supplied by the owner. */
export const contactChannels = {
  /** WhatsApp number in international format without "+" or spaces (India +91). */
  whatsappDigits: '918795272576',
  whatsappDisplay: '+91 87952 72576',
} as const

/**
 * The one public number, supplied by the owner (October 2026): how many people Ankiro's experts have guided so far,
 * counted before Ankiro existed. There are no written testimonials, so nothing beyond this line is claimed.
 */
export const proof = { figure: '2,000+', short: 'people guided by our experts', line: 'Our experts have guided more than 2,000 people.' } as const

/** Who operates the site, as given by the owner (used on the legal pages). */
export const operator = {
  business: 'Ankiro',
  name: 'Abhay Prabhakar',
  role: 'founder',
  place: 'Gurugram, India',
} as const

/** Session facts supplied by the owner. Every consultation is a voice call. */
export const consultationInfo = {
  minutes: 10,
  line: 'Each consultation is a 10-minute voice call at the time you book. The Diamond package is a 25-minute call.',
} as const

/** Why consultations are voice only, as the owner explains it: in a chat, typing uses up the session before the answer comes. */
export const voiceOnly = {
  why: 'On many apps you consult an expert by chat. Typing back and forth uses up the time, and people often run out of it before they get their answer. That’s why every Ankiro consultation is a voice call.',
  short: 'Talking gets to the point faster than typing, so your whole session goes to your question.',
} as const

/** Owner's UPI details (shown on the payment page and the payment step). The QR image is only shown when it matches the UPI ID in use. */
export const paymentConfig = {
  upiId: 'abhayprabhakar1213@okhdfcbank',
  payeeName: 'Abhay Prabhakar',
  qrImage: '/images/upi-qr.jpg',
} as const

/** Refund rule supplied by the owner. */
export const refundRule = {
  percent: 80,
  hoursBefore: 12,
  line: '80% of what you paid is refunded if you cancel at least 12 hours before your booked time. If you cancel later than that, no refund is given.',
  short: 'Cancel at least 12 hours before your time for an 80% refund.',
} as const
