// One-time Dodo Payments setup: creates the "Ankiro consultation" product the site charges against, and saves its ID
// in .env.local. Run with: npm run dodo:setup
// Uses DODO_PAYMENTS_API_KEY and DODO_PAYMENTS_ENVIRONMENT from .env.local. The key is never printed.
import { readFileSync, writeFileSync } from 'node:fs'

const file = new URL('../.env.local', import.meta.url)
const text = readFileSync(file, 'utf8')
const env = Object.fromEntries(text.split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const key = env.DODO_PAYMENTS_API_KEY
const live = env.DODO_PAYMENTS_ENVIRONMENT === 'live_mode'
if (!key) { console.error('Add DODO_PAYMENTS_API_KEY to .env.local first.'); process.exit(1) }
if (env.DODO_PRODUCT_ID) { console.log(`Already set up: DODO_PRODUCT_ID=${env.DODO_PRODUCT_ID}`); process.exit(0) }

const res = await fetch(`https://${live ? 'live' : 'test'}.dodopayments.com/products`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Ankiro consultation',
    description: 'A voice call consultation with an Ankiro expert, at the time booked on ankiro.in.',
    tax_category: 'digital_products',
    // pay-what-you-want with a ₹1 minimum: the website sets the exact amount for each booking; GST is added on top
    price: { type: 'one_time_price', currency: 'INR', price: 100, discount: 0, purchasing_power_parity: false, pay_what_you_want: true, tax_inclusive: false },
  }),
})
if (!res.ok) { console.error(`Dodo refused (${res.status}): ${(await res.text()).slice(0, 400)}`); process.exit(1) }
const { product_id } = await res.json()
writeFileSync(file, `${text.replace(/\n?$/, '\n')}DODO_PRODUCT_ID=${product_id}\n`)
console.log(`Created the product in ${live ? 'LIVE' : 'test'} mode and saved DODO_PRODUCT_ID=${product_id} to .env.local`)
