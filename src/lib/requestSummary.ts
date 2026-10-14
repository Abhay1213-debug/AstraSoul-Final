import type { ConsultationRequestDraft, Service, ConsultationMode } from '../types/domain'
import { formatPrice, getPrice } from '../config/pricing'

/** Plain-text summary of a request. Used for "Copy summary" and the email body. */
export function buildRequestSummary(
  draft: ConsultationRequestDraft,
  service: Service,
  mode: ConsultationMode,
  brandName: string,
): string {
  const price = formatPrice(getPrice(service.slug, mode.id))
  const lines = [
    `Consultation request — ${brandName}`,
    `(Draft prepared on the website. Not a confirmed booking and no payment has been taken.)`,
    '',
    `Service: ${service.name}`,
    `Consultation mode: ${mode.name}`,
    `Price: ${price}`,
    '',
    `Name: ${draft.fullName.trim()}`,
    `Email: ${draft.email.trim()}`,
  ]
  if (draft.phone.trim()) lines.push(`Phone / WhatsApp: ${draft.phone.trim()}`)
  if (draft.dateOfBirth) lines.push(`Date of birth: ${draft.dateOfBirth}`)
  if (draft.preferredLanguage.trim()) lines.push(`Preferred language: ${draft.preferredLanguage.trim()}`)
  if (service.needsPalmPhotos) lines.push('Palm photographs: to be shared securely once the request is confirmed')
  lines.push('', 'What I would like guidance on:', draft.concern.trim())
  return lines.join('\n')
}

/**
 * Builds a mailto: link. Returns null when no contact email is configured, so callers can
 * show an honest "not configured" state instead of a link that goes nowhere.
 */
export function buildMailto(to: string, subject: string, body: string): string | null {
  const address = to.trim()
  if (!address) return null
  return `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
