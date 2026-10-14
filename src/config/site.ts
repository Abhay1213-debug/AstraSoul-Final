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
  /** Public contact email. Empty → the UI states that online contact is not configured yet. */
  contactEmail: ((env.VITE_CONTACT_EMAIL as string | undefined) ?? '').trim(),
} as const

/**
 * Honest availability flags. UI badges and the docs/STATUS.md file are derived from the
 * same vocabulary. Flip a flag only when the capability is genuinely implemented and tested.
 */
export type FeatureStatus = 'live' | 'manual' | 'demo' | 'planned'

export const featureStatus = {
  moolankCalculator: 'live',
  consultationRequestForm: 'live', // builds a request; delivery is by email/copy, NOT stored online
  onlineBookingSubmission: 'planned',
  chatConsultation: 'planned',
  voiceConsultation: 'manual', // pilot: coordinated manually (e.g. Google Meet)
  videoConsultation: 'manual',
  payments: 'planned',
  accounts: 'planned',
  dashboard: 'planned',
  pdfReports: 'planned',
  expertDirectory: 'demo',
  adminArea: 'planned',
} as const satisfies Record<string, FeatureStatus>

export const statusLabels: Record<FeatureStatus, string> = {
  live: 'Available',
  manual: 'Manual during pilot',
  demo: 'Demonstration',
  planned: 'Planned',
}
