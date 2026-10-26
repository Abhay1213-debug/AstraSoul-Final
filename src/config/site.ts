/**
 * Central site configuration: brand, contact channels, operator, session facts, payment details and the refund rule.
 * Prices live in `pricing.ts`.
 */

const env = import.meta.env

export const siteConfig = {
  /** The brand name. VITE_BRAND_NAME overrides it without touching code. */
  brandName: (env.VITE_BRAND_NAME as string | undefined)?.trim() || 'Ankiro',
  tagline: (env.VITE_BRAND_TAGLINE as string | undefined)?.trim() || 'Guidance for a brighter you',
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

/** Who operates the site, as given by the owner (used on the legal pages). */
export const operator = {
  business: 'Ankiro',
  name: 'Abhay Prabhakar',
  role: 'founder',
  place: 'Gurugram, India',
} as const

/** Session facts supplied by the owner. Sessions are arranged by the team (usually on Google Meet). */
export const consultationInfo = {
  minutes: 20,
  line: 'Each consultation is about 20 minutes and is arranged by our team, usually on Google Meet.',
} as const

/** Owner's UPI details (shown on the payment page and the payment step). The QR image is only shown when it matches the UPI ID in use. */
export const paymentConfig = {
  upiId: 'abhayprabhakar1213@okhdfcbank',
  payeeName: 'Abhay Prabhakar',
  qrImage: '/images/upi-qr.jpg',
} as const

/** Refund rule supplied by the owner. */
export const refundRule = {
  beforeConfirmedPercent: 80,
  line: '80% of the amount is refunded if you cancel before an expert is confirmed. No refund is given once an expert has been confirmed.',
} as const
