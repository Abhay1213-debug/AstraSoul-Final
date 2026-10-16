// A LOCAL preview harness with FAKE DATA. It is NOT part of the website: the site never imports anything from here.
//   Run:  npx vite --config tools/mock-preview/vite.mock.config.mjs     then open http://localhost:5198/__as/customer
// (It was first written as a throwaway; kept so the owner can look at every screen without Supabase.) It serves the real website but replaces the account and data
// services with the in-memory stand-ins from src/test, seeded with FAKE data, so every screen can be looked at in a browser.
// Persona: visit /__as/<anon|customer|admin|admin-nomfa|staff> (sets a cookie), then browse normally. State resets on reload.
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const react = (await import(pathToFileURL(resolve(root, 'node_modules/@vitejs/plugin-react/dist/index.js')).href)).default

const ENTRY = `
import '@fontsource-variable/manrope'
import '@fontsource-variable/fraunces/opsz.css'
import '@fontsource-variable/fraunces/opsz-italic.css'
import '/src/styles/tokens.css'
import '/src/styles/base.css'
import '/src/styles/layout.css'
import '/src/styles/components.css'
import '/src/styles/sections.css'
import { StrictMode, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { routes } from '/src/App'
import { AuthProvider } from '/src/lib/auth'
import { DataProvider } from '/src/lib/data'
import { createFakeAuth } from '/src/test/fakeAuth'
import { createFakeData } from '/src/test/fakeData'

const persona = (document.cookie.match(/mockas=([a-z-]+)/) || [])[1] || 'anon'
const U = {
  customer: { id: 'u-asha', email: 'asha.test@example.com', fullName: 'Asha Test' },
  other: { id: 'u-ravi', email: 'ravi.test@example.com', fullName: 'Ravi Test' },
  admin: { id: 'u-admin1', email: 'admin.one@example.com', fullName: 'Admin One' },
  admin2: { id: 'u-admin2', email: 'admin.two@example.com', fullName: 'Admin Two' },
  staff: { id: 'u-staff', email: 'expert.one@example.com', fullName: 'Expert One' },
}
const data = createFakeData()
for (const u of Object.values(U)) data.addProfile({ id: u.id, email: u.email, fullName: u.fullName })
data.setConsent('v1')
const iso = (d) => new Date(Date.now() + d * 86400000).toISOString()

async function seed() {
  const admin = { id: U.admin.id, staff: { role: 'admin' }, aal2: true }
  data.actAs(admin)
  const e1 = await data.saveExpert({ displayName: 'Test Expert One', bio: 'Fake test profile for the preview only.', languages: ['English', 'Hindi'], modes: ['chat', 'voice', 'video'], availabilityNote: 'Weekday evenings (test)', active: true, serviceSlugs: ['numerology', 'palmistry'] })
  await data.saveExpert({ displayName: 'Test Expert Two', bio: '', languages: ['English'], modes: ['chat'], availabilityNote: '', active: true, serviceSlugs: ['gemstone-guidance', 'color-therapy'] })
  for (const [s, m, a] of [['numerology','chat',49900],['numerology','voice',79900],['palmistry','chat',59900],['gemstone-guidance','chat',39900]]) await data.setPrice(s, m, a)
  await data.saveSetting('upi_id', 'test.shop@examplebank')
  await data.saveSetting('payee_name', 'Test Payee (fake)')
  await data.saveSetting('payment_instructions', 'This is fake preview data. Do not pay anyone.')
  // Asha's requests in different states
  data.actAs({ id: U.customer.id })
  const r1 = await data.createRequest({ serviceSlug: 'numerology', mode: 'chat', concern: 'Guidance about my career direction, please.', dateOfBirth: '1990-05-17', preferredLanguage: 'English', consentVersion: 'v1' })
  const r2 = await data.createRequest({ serviceSlug: 'palmistry', mode: 'chat', concern: 'I would like a palm reading about relationships.', dateOfBirth: '', preferredLanguage: '', consentVersion: 'v1' })
  const r3 = await data.createRequest({ serviceSlug: 'gemstone-guidance', mode: 'chat', concern: 'Which gemstone might suit a new business?', dateOfBirth: '', preferredLanguage: '', consentVersion: 'v1' })
  await data.submitPaymentReference({ requestId: r2.data.id, upiReference: 'AB12CD34EF56', payerName: 'Asha Test', paidOn: new Date().toISOString().slice(0, 10) })
  await data.submitPaymentReference({ requestId: r3.data.id, upiReference: 'ZZ99YY88XX77', payerName: 'Asha Test', paidOn: new Date().toISOString().slice(0, 10) })
  data.actAs({ id: U.other.id })
  await data.createRequest({ serviceSlug: 'color-therapy', mode: 'chat', concern: 'Ravi test: colours for my home office.', dateOfBirth: '', preferredLanguage: '', consentVersion: 'v1' })
  data.actAs(admin2())
  const pay = data.tables.requests.find((r) => r.id === r3.data.id).payments[0]
  await data.verifyPayment(pay.id, 'succeeded', pay.amountMinor, '')
  data.actAs(admin)
  await data.updateRequest(r3.data.id, { status: 'awaiting_confirmation' })
  await data.updateRequest(r3.data.id, { assignedExpertId: e1.data.id })
}
const admin2 = () => ({ id: U.admin2.id, staff: { role: 'admin' }, aal2: true })
await seed()

const actors = {
  anon: [null, { id: null }],
  customer: [U.customer, { id: U.customer.id }],
  admin: [U.admin, { id: U.admin.id, staff: { role: 'admin' }, aal2: true }],
  'admin-nomfa': [U.admin, { id: U.admin.id, staff: { role: 'admin' }, aal2: false }],
  staff: [U.staff, { id: U.staff.id, staff: { role: 'staff', expertId: data.tables.experts[0].id }, aal2: true }],
}
const [who, actor] = actors[persona] || actors.anon
data.actAs(actor)
const auth = createFakeAuth({ user: who })
auth.setMfa(persona === 'admin-nomfa' ? { level: 'aal1', verifiedFactorId: null } : { level: 'aal2', verifiedFactorId: 'f1' })
window.__mock = { persona, data, auth }

const ribbon = document.createElement('div')
ribbon.setAttribute('style', 'position:fixed;z-index:99999;left:0;bottom:0;right:0;background:#7a1f1f;color:#fff;font:12px/1.4 system-ui;padding:4px 8px;display:flex;gap:10px;flex-wrap:wrap;align-items:center')
ribbon.innerHTML = '<strong>MOCK PREVIEW - fake data, nothing is saved, no Supabase.</strong> Viewing as: ' + persona + ' &nbsp; Switch: ' + ['anon','customer','admin','admin-nomfa','staff'].map(function (p) { return '<a style="color:#ffd" href="/__as/' + p + '">' + p + '</a>' }).join(' · ')
document.body.appendChild(ribbon)
const h = createElement
createRoot(document.getElementById('root')).render(
  h(StrictMode, null,
    h(AuthProvider, { service: auth },
      h(DataProvider, { service: data },
        h(RouterProvider, { router: createBrowserRouter(routes) })))),
)
`

const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>MOCK PREVIEW</title></head><body><div id="root"></div><script type="module" src="/@id/__x00__mock-entry"></script></body></html>`

export default {
  root,
  plugins: [
    react(),
    {
      name: 'mock-preview',
      resolveId(id) { if (id === 'mock-entry') return '\0mock-entry.jsx' },
      load(id) { if (id === '\0mock-entry.jsx') return ENTRY },
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = req.url || '/'
          const m = /^\/__as\/([a-z-]+)/.exec(url)
          if (m) { res.statusCode = 302; res.setHeader('Set-Cookie', `mockas=${m[1]}; Path=/`); res.setHeader('Location', '/'); return res.end() }
          const accept = req.headers.accept || ''
          if (accept.includes('text/html') && !/\.[a-z0-9]+(\?|$)/i.test(url.split('?')[0]) && !url.startsWith('/@') && !url.startsWith('/src') && !url.startsWith('/node_modules')) {
            const out = await server.transformIndexHtml(url, html.replace('/@id/__x00__mock-entry', '/@id/__x00__mock-entry.jsx'))
            res.setHeader('Content-Type', 'text/html'); return res.end(out)
          }
          next()
        })
      },
    },
  ],
  server: { port: 5198, strictPort: true, fs: { strict: false } },
}
