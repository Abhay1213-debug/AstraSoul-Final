import { formatPrice, getPrice } from '../config/pricing'
import type { ConsultationModeId, ServiceSlug } from '../types/domain'
import { useData } from '../lib/data'
import { formatMoney } from '../lib/format'
import { useLoad } from './useLoad'

/**
 * The price text for a service and mode. When the database is connected (accounts switched on) it shows the price an administrator
 * set; otherwise - or while loading, or if the read fails - it falls back to the website's own placeholder ("Price coming soon").
 * It never invents a price: an unset price is always shown as "Price coming soon".
 */
export function useLivePrices(): (slug: ServiceSlug, mode: ConsultationModeId) => string {
  const { service } = useData()
  const prices = useLoad(service ? () => service.listPrices() : null, [service])
  return (slug, mode) => {
    if (prices.state.status === 'done') {
      const row = prices.state.data.find((p) => p.serviceSlug === slug && p.mode === mode)
      return formatMoney(row?.amountMinor ?? null)
    }
    return formatPrice(getPrice(slug, mode))
  }
}
