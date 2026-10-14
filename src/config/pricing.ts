import type { ConsultationModeId, ServiceSlug } from '../types/domain'

/**
 * PRICING PLACEHOLDERS. No real prices have been provided yet.
 * `null` means "not set" and the UI shows "Price to be confirmed".
 * Amounts are in the smallest currency unit (paise for INR) to avoid float errors.
 */
export interface PriceEntry {
  amountMinor: number | null
  currency: 'INR'
}

export const pricing: Record<ServiceSlug, Record<ConsultationModeId, PriceEntry>> = {
  numerology: unset(),
  palmistry: unset(),
  'gemstone-guidance': unset(),
  'color-therapy': unset(),
}

function unset(): Record<ConsultationModeId, PriceEntry> {
  const empty: PriceEntry = { amountMinor: null, currency: 'INR' }
  return { chat: { ...empty }, voice: { ...empty }, video: { ...empty } }
}

export function formatPrice(entry: PriceEntry): string {
  if (entry.amountMinor === null) return 'Price to be confirmed'
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: entry.currency }).format(
    entry.amountMinor / 100,
  )
}

export function getPrice(service: ServiceSlug, mode: ConsultationModeId): PriceEntry {
  return pricing[service][mode]
}
