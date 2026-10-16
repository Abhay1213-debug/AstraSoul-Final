/**
 * Central site configuration. Everything that is a business decision still pending
 * (brand name, contact channel, prices, feature availability) lives here or in
 * `pricing.ts` so it can be changed in one place.
 */

const env = import.meta.env

export const siteConfig = {
  /**
   * WORKING NAME ONLY. Taken from the visual reference site; the brief says the brand is
   * undecided. Override with VITE_BRAND_NAME in .env.local without touching code.
   */
  brandName: (env.VITE_BRAND_NAME as string | undefined)?.trim() || 'AstraSoul',
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
  business: 'AstraSoul',
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

/**
 * Honest availability flags. UI badges and the docs/STATUS.md file are derived from the
 * same vocabulary. Flip a flag only when the capability is genuinely implemented and tested.
 */
export type FeatureStatus = 'live' | 'manual' | 'demo' | 'planned'

export const featureStatus = {
  moolankCalculator: 'live',
  consultationRequestForm: 'live', // builds a request; delivery is by WhatsApp/email/copy, NOT stored online unless accounts are switched on
  onlineBookingSubmission: 'planned',
  chatConsultation: 'planned',
  voiceConsultation: 'manual', // pilot: coordinated manually (e.g. Google Meet)
  videoConsultation: 'manual',
  payments: 'manual', // pay with your own UPI app; the team verifies manually
  accounts: 'planned',
  dashboard: 'planned',
  pdfReports: 'planned',
  expertDirectory: 'manual', // experts are connected by the team; no public directory
  adminArea: 'planned',
} as const satisfies Record<string, FeatureStatus>

export const statusLabels: Record<FeatureStatus, string> = {
  live: 'Available',
  manual: 'Manual during pilot',
  demo: 'Demonstration',
  planned: 'Coming soon',
}
