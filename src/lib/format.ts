import { serviceBySlug } from '../data/services'
import { modeById, isModeId } from '../data/consultationModes'

/** Amounts are held in paise. null = no price set. */
export function formatMoney(amountMinor: number | null): string {
  if (amountMinor === null) return 'Confirmed before you pay'
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amountMinor / 100)
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(d)
}

export function formatDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(d)
}

/** Display names come from the site's own service list; an unknown slug (a service added later) is shown as written. */
export const serviceLabel = (slug: string): string => (serviceBySlug(slug)?.name ?? slug)
export const modeLabel = (mode: string): string => (isModeId(mode) ? modeById(mode)?.name ?? mode : mode)

/** A date-time-local input value ('yyyy-mm-ddThh:mm', in the viewer's time zone) -> an ISO instant, or null. */
export function localInputToIso(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function isoToLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const todayIso = (): string => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
