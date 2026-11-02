import { MIN_PRICE_INR } from '../../src/shared/booking.js'

/**
 * Server settings, read from environment variables (Vercel project settings in production, .env.local on this
 * computer). Secrets live only here, never in a VITE_ variable, so they never reach the browser.
 *
 *   DODO_PAYMENTS_API_KEY        secret API key from the Dodo dashboard (Developer > API keys)
 *   DODO_PAYMENTS_ENVIRONMENT    test_mode (default) or live_mode
 *   DODO_PRODUCT_ID              the "Ankiro consultation" product (npm run dodo:setup creates it)
 *   DODO_PAYMENTS_WEBHOOK_KEY    signing secret of the webhook endpoint (whsec_...)
 *   SUPABASE_SECRET_KEY          Supabase secret key (Vercel settings only, never in this folder); with VITE_SUPABASE_URL
 *   BOOKING_TEST_PRICE_INR       price used in test mode for consultations with no price yet (default and minimum 50)
 *   SITE_URL                     public address, e.g. https://ankiro.in (used for the return link after paying)
 *
 * On this computer only (ANKIRO_DEV=1, set by the dev server): with no Dodo key, payments are simulated, and bookings
 * are kept in a local file (.data/), because the Supabase secret key is never stored in this folder. Neither fallback
 * can run on the live site.
 */
export type PaymentsMode = 'live' | 'test' | 'mock' | 'off'

export interface ServerConfig {
  dev: boolean
  payments: PaymentsMode
  dodo: { apiKey: string; base: string; productId: string; webhookKey: string } | null
  store: 'supabase' | 'memory' | 'off'
  supabase: { url: string; serviceKey: string } | null
  testPrice: number | null
  siteUrl: string | null
}

export function readConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const dev = env.ANKIRO_DEV === '1'
  const apiKey = env.DODO_PAYMENTS_API_KEY?.trim() ?? ''
  const productId = env.DODO_PRODUCT_ID?.trim() ?? ''
  const live = env.DODO_PAYMENTS_ENVIRONMENT?.trim() === 'live_mode'
  const dodo = apiKey && productId
    ? { apiKey, productId, base: live ? 'https://live.dodopayments.com' : 'https://test.dodopayments.com', webhookKey: env.DODO_PAYMENTS_WEBHOOK_KEY?.trim() ?? '' }
    : null
  const payments: PaymentsMode = dodo ? (live ? 'live' : 'test') : dev ? 'mock' : 'off'

  const url = (env.SUPABASE_URL ?? env.VITE_SUPABASE_URL)?.trim() ?? ''
  const serviceKey = env.SUPABASE_SECRET_KEY?.trim() ?? ''
  const supabase = url && serviceKey ? { url, serviceKey } : null
  const store = supabase ? 'supabase' : dev ? 'memory' : 'off'

  const raw = Number(env.BOOKING_TEST_PRICE_INR || MIN_PRICE_INR)
  const testPrice = payments === 'live' || payments === 'off' ? null : Number.isFinite(raw) && raw >= MIN_PRICE_INR ? Math.round(raw) : MIN_PRICE_INR
  return { dev, payments, dodo, store, supabase, testPrice, siteUrl: env.SITE_URL?.trim().replace(/\/$/, '') || null }
}

/** Test bookings (test mode or simulated) never block a real customer's slot, and the reverse. */
export const isTestConfig = (c: ServerConfig) => c.payments !== 'live'
