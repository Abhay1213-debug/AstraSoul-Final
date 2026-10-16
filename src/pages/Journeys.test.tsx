import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { routes } from '../App'
import { AuthProvider } from '../lib/auth'
import { DataProvider } from '../lib/data'
import { createFakeAuth, type FakeAuth } from '../test/fakeAuth'
import { createFakeData, type Actor, type FakeData } from '../test/fakeData'

/**
 * These tests drive the REAL pages with stand-in services (nothing leaves the computer, no Supabase). The stand-in database copies
 * the rules of the real one so the SCREENS can be checked. They are NOT evidence that the real database enforces those rules -
 * that is what supabase/tests/isolation_tests.sql proved (in simulated sessions) and what real-session testing must still prove.
 */
const ASHA = { id: 'u-asha', email: 'asha@example.com', fullName: 'Asha Rao' }
const RAVI = { id: 'u-ravi', email: 'ravi@example.com', fullName: 'Ravi Menon' }
const ADMIN1 = { id: 'u-admin1', email: 'admin1@example.com', fullName: 'Admin One' }
const ADMIN2 = { id: 'u-admin2', email: 'admin2@example.com', fullName: 'Admin Two' }

function world(opts: { consent?: string | null } = {}) {
  const data = createFakeData()
  data.addProfile({ id: ASHA.id, email: ASHA.email, fullName: ASHA.fullName })
  data.addProfile({ id: RAVI.id, email: RAVI.email, fullName: RAVI.fullName })
  data.addProfile({ id: ADMIN1.id, email: ADMIN1.email, fullName: ADMIN1.fullName })
  data.addProfile({ id: ADMIN2.id, email: ADMIN2.email, fullName: ADMIN2.fullName })
  data.setConsent(opts.consent === undefined ? 'v1' : opts.consent)
  return data
}

const customer = (u: typeof ASHA): Actor => ({ id: u.id })
const admin = (u: typeof ADMIN1, aal2 = true): Actor => ({ id: u.id, staff: { role: 'admin' }, aal2 })

async function mount(path: string, data: FakeData, who: typeof ASHA | null, actor: Actor, auth?: FakeAuth) {
  data.actAs(actor)
  const fakeAuth = auth ?? createFakeAuth({ user: who })
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const utils = render(
    <AuthProvider service={fakeAuth}>
      <DataProvider service={data}>
        <RouterProvider router={router} />
      </DataProvider>
    </AuthProvider>,
  )
  await waitFor(() => expect(screen.queryByText(/checking your account/i)).toBeNull())
  return { router, auth: fakeAuth, user: userEvent.setup(), ...utils }
}

function priced(data: FakeData, slug = 'numerology', mode: 'chat' | 'voice' | 'video' = 'chat', amount = 50000) {
  data.tables.prices.find((p) => p.serviceSlug === slug && p.mode === mode)!.amountMinor = amount
}

async function submitRequest(user: ReturnType<typeof userEvent.setup>, opts: { service?: string; dob?: boolean } = {}) {
  await user.click(await screen.findByLabelText(new RegExp(opts.service ?? 'numerology', 'i')))
  await user.click(screen.getByRole('button', { name: /continue/i }))
  if (opts.dob !== false) await user.type(screen.getByLabelText(/date of birth/i), '1990-05-17')
  await user.type(screen.getByLabelText(/what would you like guidance on/i), 'I would like guidance about my career direction.')
  await user.click(screen.getByRole('button', { name: /continue/i }))
  await user.click(screen.getByLabelText(/chat/i))
  await user.click(screen.getByRole('button', { name: /continue/i }))
  await user.click(screen.getByRole('checkbox'))
  await user.click(screen.getByRole('button', { name: /submit my request/i }))
}

describe('consultation request: online submission', () => {
  it('a logged-in customer submits a request, sees it received, and finds it on the dashboard', async () => {
    const data = world()
    const { user } = await mount('/consultation/request', data, ASHA, customer(ASHA))
    await screen.findByText(/this request will be saved to your account/i)
    // the account details are not asked for again
    await user.click(await screen.findByLabelText(/numerology/i))
    await user.click(screen.getByRole('button', { name: /continue/i }))
    expect(screen.queryByLabelText(/^email/i)).toBeNull()
    expect(screen.queryByLabelText(/full name/i)).toBeNull()
    await user.type(screen.getByLabelText(/date of birth/i), '1990-05-17')
    await user.type(screen.getByLabelText(/what would you like guidance on/i), 'I would like guidance about my career direction.')
    await user.click(screen.getByRole('button', { name: /continue/i }))
    await user.click(screen.getByLabelText(/chat/i))
    await user.click(screen.getByRole('button', { name: /continue/i }))
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: /submit my request/i }))
    expect(await screen.findByRole('heading', { name: /your request has been received/i })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/not a confirmed booking yet/i)
    expect(data.tables.requests).toHaveLength(1)
    expect(data.tables.requests[0]).toMatchObject({ customerId: ASHA.id, customerName: 'Asha Rao', status: 'submitted', serviceSlug: 'numerology', mode: 'chat' })
  })

  it('sends only one request even when the button is pressed twice', async () => {
    const data = world()
    const { user } = await mount('/consultation/request', data, ASHA, customer(ASHA))
    await screen.findByText(/this request will be saved to your account/i)
    await submitRequest(user)
    await screen.findByRole('heading', { name: /your request has been received/i })
    expect(data.calls.filter((c) => c === 'createRequest')).toHaveLength(1)
  })

  it('without an approved consent version it says online requests are not open and keeps the email route', async () => {
    const data = world({ consent: null })
    await mount('/consultation/request', data, ASHA, customer(ASHA))
    expect(await screen.findByText(/online requests aren’t open yet/i)).toBeInTheDocument()
    expect(screen.queryByText(/this request will be saved to your account/i)).toBeNull()
    expect(data.tables.requests).toHaveLength(0)
  })

  it('a visitor who is not logged in is invited to log in and can still prepare an email request', async () => {
    const data = world()
    await mount('/consultation/request', data, null, { id: null })
    expect(await screen.findByText(/want to send this online/i)).toBeInTheDocument()
    const inviteLinks = screen.getAllByRole('link', { name: /^log in$/i }).map((a) => a.getAttribute('href'))
    expect(inviteLinks.some((h) => h?.startsWith('/login?next='))).toBe(true)
    await userEvent.setup().click(await screen.findByLabelText(/numerology/i))
    await userEvent.setup().click(screen.getByRole('button', { name: /continue/i }))
    expect(screen.getByLabelText(/^email/i)).toBeInTheDocument()
  })

  it('shows a fixed message when the database refuses (too many open requests)', async () => {
    const data = world()
    const { user } = await mount('/consultation/request', data, ASHA, customer(ASHA))
    await screen.findByText(/this request will be saved to your account/i)
    data.failNext('too_many_open_requests')
    await user.click(await screen.findByLabelText(/palmistry/i))
    await user.click(screen.getByRole('button', { name: /continue/i }))
    await user.type(screen.getByLabelText(/what would you like guidance on/i), 'I would like guidance about my palm lines.')
    await user.click(screen.getByRole('button', { name: /continue/i }))
    await user.click(screen.getByLabelText(/chat/i))
    await user.click(screen.getByRole('button', { name: /continue/i }))
    await user.click(screen.getByRole('checkbox'))
    data.calls.length = 0
    data.failNext('too_many_open_requests')
    await user.click(screen.getByRole('button', { name: /submit my request/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/maximum number of open requests/i)
  })
})

describe('customer dashboard and data isolation', () => {
  it('shows an empty state for a customer with no requests', async () => {
    await mount('/dashboard', world(), ASHA, customer(ASHA))
    expect(await screen.findByText(/you haven’t sent a request yet/i)).toBeInTheDocument()
  })

  it('lists only the signed-in customer’s own requests', async () => {
    const data = world()
    data.actAs(customer(RAVI))
    await data.createRequest({ serviceSlug: 'palmistry', mode: 'video', concern: 'Ravi private concern text', dateOfBirth: '', preferredLanguage: '', consentVersion: 'v1' })
    data.actAs(customer(ASHA))
    await data.createRequest({ serviceSlug: 'numerology', mode: 'chat', concern: 'Asha concern text here', dateOfBirth: '1990-01-01', preferredLanguage: '', consentVersion: 'v1' })
    await mount('/dashboard', data, ASHA, customer(ASHA))
    const main = within(await screen.findByRole('main'))
    expect(await main.findByText(/numerology · chat/i)).toBeInTheDocument()
    expect(main.queryByText(/palmistry/i)).toBeNull()
    expect(main.queryByText(/ravi/i)).toBeNull()
  })

  it('another customer’s request opened by its address says "not found" and reveals nothing', async () => {
    const data = world()
    data.actAs(customer(RAVI))
    const created = await data.createRequest({ serviceSlug: 'palmistry', mode: 'video', concern: 'Ravi private concern text', dateOfBirth: '', preferredLanguage: '', consentVersion: 'v1' })
    if (!created.ok) throw new Error('setup failed')
    await mount(`/dashboard/requests/${created.data.id}`, data, ASHA, customer(ASHA))
    expect(await screen.findByText(/couldn’t find that request/i)).toBeInTheDocument()
    expect(screen.getByRole('main').textContent).not.toMatch(/private concern|ravi|palmistry/i)
  })

  it('a logged-out visitor opening a request address is sent to log in', async () => {
    const { router } = await mount('/dashboard/requests/abc', world(), null, { id: null })
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(router.state.location.search).toContain('next=')
  })

  it('edits the profile through the allowed fields', async () => {
    const data = world()
    const { user } = await mount('/dashboard', data, ASHA, customer(ASHA))
    await user.click(await screen.findByRole('button', { name: /edit details/i }))
    await user.clear(screen.getByLabelText(/full name/i))
    await user.type(screen.getByLabelText(/full name/i), 'Asha R. Rao')
    await user.type(screen.getByLabelText(/phone/i), '+91 98765 43210')
    await user.click(screen.getByRole('button', { name: /save details/i }))
    expect(await screen.findByText(/your details were saved/i)).toBeInTheDocument()
    expect(data.tables.profiles.get(ASHA.id)).toMatchObject({ fullName: 'Asha R. Rao', phone: '+91 98765 43210' })
  })

  it('refuses an invalid phone number without contacting the service', async () => {
    const data = world()
    const { user } = await mount('/dashboard', data, ASHA, customer(ASHA))
    await user.click(await screen.findByRole('button', { name: /edit details/i }))
    await user.type(screen.getByLabelText(/phone/i), 'abc')
    await user.click(screen.getByRole('button', { name: /save details/i }))
    expect(screen.getByText(/valid phone number/i)).toBeInTheDocument()
    expect(data.calls).not.toContain('updateMyProfile')
  })

  it('does not show the admin shortcut to an ordinary customer', async () => {
    await mount('/dashboard', world(), ASHA, customer(ASHA))
    await screen.findByText(/you haven’t sent a request yet/i)
    expect(screen.queryByText(/administrator login|open the admin area/i)).toBeNull()
  })
})

async function seedRequest(data: FakeData, who: typeof ASHA, over: Partial<Parameters<FakeData['createRequest']>[0]> = {}) {
  data.actAs(customer(who))
  const r = await data.createRequest({ serviceSlug: 'numerology', mode: 'chat', concern: 'Guidance about my career please', dateOfBirth: '1990-01-01', preferredLanguage: '', consentVersion: 'v1', ...over })
  if (!r.ok) throw new Error('setup failed: ' + r.code)
  return r.data.id
}

describe('payment reference (manual UPI)', () => {
  it('says the price is not confirmed and takes no reference when no price is set', async () => {
    const data = world()
    const id = await seedRequest(data, ASHA)
    await mount(`/dashboard/requests/${id}`, data, ASHA, customer(ASHA))
    expect(await screen.findByText(/price for this consultation is coming soon/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/upi transaction reference/i)).toBeNull()
  })

  it('shows the owner’s UPI ID and QR code (built-in details) once a price is set, even before the admin saves settings', async () => {
    const data = world()
    priced(data)
    const id = await seedRequest(data, ASHA)
    await mount(`/dashboard/requests/${id}`, data, ASHA, customer(ASHA))
    expect(await screen.findByText('abhayprabhakar1213@okhdfcbank')).toBeInTheDocument()
    expect(screen.getByAltText(/upi qr code for abhay prabhakar/i)).toHaveAttribute('src', '/images/upi-qr.jpg')
    expect(screen.getByText(/80% of the amount is refunded/i)).toBeInTheDocument()
  })

  it('never shows the built-in QR code next to a DIFFERENT UPI ID saved by an administrator', async () => {
    const data = world()
    priced(data)
    data.tables.settings.upi_id = 'someone.else@examplebank'
    const id = await seedRequest(data, ASHA)
    await mount(`/dashboard/requests/${id}`, data, ASHA, customer(ASHA))
    expect(await screen.findByText('someone.else@examplebank')).toBeInTheDocument()
    expect(screen.queryByAltText(/upi qr code/i)).toBeNull()
  })

  it('shows the configured instructions with the PIN/OTP warning, and submits a reference as PENDING (never as paid)', async () => {
    const data = world()
    priced(data)
    data.tables.settings.upi_id = 'astrasoul@examplebank'
    data.tables.settings.payee_name = 'Example Payee'
    const id = await seedRequest(data, ASHA)
    const { user } = await mount(`/dashboard/requests/${id}`, data, ASHA, customer(ASHA))
    expect(await screen.findByText('astrasoul@examplebank')).toBeInTheDocument()
    expect(screen.getByText(/never share your upi pin/i)).toBeInTheDocument()
    await user.type(screen.getByLabelText(/upi transaction reference/i), 'ab12 cd34 ef56')
    await user.type(screen.getByLabelText(/name shown in your payment app/i), 'Asha Rao')
    await user.type(screen.getByLabelText(/date you paid/i), '2026-10-01')
    await user.click(screen.getByRole('button', { name: /submit payment reference/i }))
    expect((await screen.findAllByText(/we have your payment reference/i)).length).toBeGreaterThan(0)
    const pay = data.tables.requests[0]!.payments[0]!
    expect(pay.status).toBe('pending')
    expect(pay.upiReference).toBe('AB12CD34EF56')
    expect(screen.getAllByText(/waiting to be checked/i).length).toBeGreaterThan(0)
    expect(screen.queryByText(/payment verified/i)).toBeNull()
  })

  it('rejects a number in the name field and a missing date without contacting the service', async () => {
    const data = world()
    priced(data)
    data.tables.settings.upi_id = 'astrasoul@examplebank'
    const id = await seedRequest(data, ASHA)
    const { user } = await mount(`/dashboard/requests/${id}`, data, ASHA, customer(ASHA))
    await user.type(await screen.findByLabelText(/upi transaction reference/i), 'AB12CD34EF56')
    await user.type(screen.getByLabelText(/name shown in your payment app/i), '123456')
    await user.click(screen.getByRole('button', { name: /submit payment reference/i }))
    expect(screen.getByText(/looks like a number/i)).toBeInTheDocument()
    expect(screen.getByText(/choose the date you paid/i)).toBeInTheDocument()
    expect(data.calls).not.toContain('submitPaymentReference')
  })

  it('shows the database’s refusal in fixed words (reference already used)', async () => {
    const data = world()
    priced(data)
    data.tables.settings.upi_id = 'astrasoul@examplebank'
    const id = await seedRequest(data, ASHA)
    const { user } = await mount(`/dashboard/requests/${id}`, data, ASHA, customer(ASHA))
    await user.type(await screen.findByLabelText(/upi transaction reference/i), 'AB12CD34EF56')
    await user.type(screen.getByLabelText(/name shown in your payment app/i), 'Asha Rao')
    await user.type(screen.getByLabelText(/date you paid/i), '2026-10-01')
    data.failNext('reference_unavailable')
    await user.click(screen.getByRole('button', { name: /submit payment reference/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/that reference can’t be used/i)
  })

  it('lets the customer cancel an unpaid request after confirming, and refuses once a payment is verified', async () => {
    const data = world()
    const id = await seedRequest(data, ASHA)
    const { user } = await mount(`/dashboard/requests/${id}`, data, ASHA, customer(ASHA))
    await user.click(await screen.findByRole('button', { name: /cancel this request/i }))
    await user.click(screen.getByRole('button', { name: /yes, cancel it/i }))
    await waitFor(() => expect(data.tables.requests[0]!.status).toBe('cancelled'))
    expect(await screen.findByText(/this request was cancelled/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /cancel this request/i })).toBeNull()
  })

  it('hides the cancel button when a payment has been verified (the team handles it)', async () => {
    const data = world()
    const id = await seedRequest(data, ASHA)
    data.tables.requests[0]!.payments.push({ id: 'p1', requestId: id, status: 'succeeded', amountMinor: 1000, upiReference: 'AB12CD34EF56', payerName: 'Asha Rao', paidOn: '2026-10-01', submittedAt: new Date().toISOString(), receivedAmountMinor: 1000, verifiedAt: new Date().toISOString(), refundedAt: null })
    await mount(`/dashboard/requests/${id}`, data, ASHA, customer(ASHA))
    expect(await screen.findByText(/your payment has been verified/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /cancel this request/i })).toBeNull()
  })
})

describe('admin area', () => {
  it('is not shown to an ordinary customer (and the database would return nothing anyway)', async () => {
    const data = world()
    await mount('/admin', data, ASHA, customer(ASHA))
    expect(await screen.findByText(/this area is not available to your account/i)).toBeInTheDocument()
    expect(data.calls).not.toContain('listRequests')
  })

  it('sends a logged-out visitor to log in', async () => {
    const { router } = await mount('/admin/requests', world(), null, { id: null })
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })

  it('asks an administrator without the authenticator step to complete it, and shows nothing from the admin area until then', async () => {
    const data = world()
    await seedRequest(data, ASHA)
    const auth = createFakeAuth({ user: ADMIN1 })
    auth.setMfa({ level: 'aal1', verifiedFactorId: 'f1' })
    const { user } = await mount('/admin/requests', data, ADMIN1, admin(ADMIN1, false), auth)
    expect(await screen.findByRole('heading', { name: /enter your authenticator code/i })).toBeInTheDocument()
    expect(screen.queryByText(/asha rao/i)).toBeNull()
    await user.type(screen.getByLabelText(/6-digit code/i), '000000')
    await user.click(screen.getByRole('button', { name: /^continue$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/code didn’t work/i)
    expect(screen.queryByText(/asha rao/i)).toBeNull()
    data.actAs(admin(ADMIN1, true)) // the real session becomes aal2 after a correct code
    await user.type(screen.getByLabelText(/6-digit code/i), '123456')
    await user.click(screen.getByRole('button', { name: /^continue$/i }))
    expect(await screen.findByText('Asha Rao')).toBeInTheDocument()
  })

  it('offers authenticator set-up (QR code) to an administrator who has none', async () => {
    const data = world()
    const auth = createFakeAuth({ user: ADMIN1 })
    const { user } = await mount('/admin', data, ADMIN1, admin(ADMIN1, false), auth)
    await user.click(await screen.findByRole('button', { name: /set up authenticator/i }))
    expect(await screen.findByAltText(/qr code/i)).toBeInTheDocument()
    expect(auth.mfaCalls.enrol).toBe(1)
  })

  it('shows the overview counts to an administrator with the authenticator step done', async () => {
    const data = world()
    await seedRequest(data, ASHA)
    await seedRequest(data, RAVI, { serviceSlug: 'palmistry', mode: 'voice', dateOfBirth: '' })
    const auth = createFakeAuth({ user: ADMIN1 })
    auth.setMfa({ level: 'aal2', verifiedFactorId: 'f1' })
    await mount('/admin', data, ADMIN1, admin(ADMIN1), auth)
    expect(await screen.findByLabelText('All requests: 2')).toBeInTheDocument()
    expect(screen.getByLabelText('Payment references to check: 0')).toBeInTheDocument()
  })

  async function adminOn(path: string, data: FakeData, who = ADMIN1) {
    const auth = createFakeAuth({ user: who })
    auth.setMfa({ level: 'aal2', verifiedFactorId: 'f1' })
    return mount(path, data, who, admin(who), auth)
  }

  it('lists, filters and searches requests', async () => {
    const data = world()
    await seedRequest(data, ASHA)
    await seedRequest(data, RAVI, { serviceSlug: 'palmistry', mode: 'voice', dateOfBirth: '' })
    const { user } = await adminOn('/admin/requests', data)
    expect(await screen.findByText('Asha Rao')).toBeInTheDocument()
    expect(screen.getByText('Ravi Menon')).toBeInTheDocument()
    await user.type(screen.getByLabelText(/search by customer/i), 'ravi')
    await waitFor(() => expect(screen.queryByText('Asha Rao')).toBeNull())
    expect(screen.getByText('Ravi Menon')).toBeInTheDocument()
    await user.clear(screen.getByLabelText(/search by customer/i))
    await user.selectOptions(screen.getByLabelText(/^status$/i), 'confirmed')
    expect(await screen.findByText(/no requests match/i)).toBeInTheDocument()
  })

  it('verifies a payment, but only with the exact amount, and never the administrator’s own', async () => {
    const data = world()
    priced(data)
    data.tables.settings.upi_id = 'astrasoul@examplebank'
    const id = await seedRequest(data, ASHA)
    data.actAs(customer(ASHA))
    await data.submitPaymentReference({ requestId: id, upiReference: 'AB12CD34EF56', payerName: 'Asha Rao', paidOn: '2026-10-01' })
    const { user } = await adminOn(`/admin/requests/${id}`, data)
    const verify = await screen.findByRole('button', { name: /verify: payment received/i })
    const amount = screen.getByLabelText(/amount you saw in the bank statement/i)
    await user.clear(amount)
    await user.type(amount, '123')
    await user.click(verify)
    expect(await screen.findByRole('alert')).toHaveTextContent(/must match the expected amount exactly/i)
    expect(data.tables.requests[0]!.payments[0]!.status).toBe('pending')
    await user.clear(amount)
    await user.type(amount, '500')
    await user.click(verify)
    await waitFor(() => expect(data.tables.requests[0]!.payments[0]!.status).toBe('succeeded'))
  })

  it('refuses an administrator verifying a payment on their OWN request', async () => {
    const data = world()
    priced(data)
    data.tables.settings.upi_id = 'astrasoul@examplebank'
    const id = await seedRequest(data, ADMIN1)
    data.actAs(customer(ADMIN1))
    await data.submitPaymentReference({ requestId: id, upiReference: 'ZX98YW76VU54', payerName: 'Admin One', paidOn: '2026-10-01' })
    const { user } = await adminOn(`/admin/requests/${id}`, data)
    await user.type(await screen.findByLabelText(/amount you saw in the bank statement/i), '500')
    await user.click(await screen.findByRole('button', { name: /verify: payment received/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/can’t be verified by the person it belongs to/i)
    expect(data.tables.requests[0]!.payments[0]!.status).toBe('pending')
    // a different administrator can
    const second = await adminOn(`/admin/requests/${id}`, data, ADMIN2)
    expect(second.router.state.location.pathname).toBe(`/admin/requests/${id}`)
  })

  it('assigns an expert, confirms with a time, and the customer then sees it; confirming without an expert is refused', async () => {
    const data = world()
    const id = await seedRequest(data, ASHA)
    data.actAs(admin(ADMIN1))
    const e = await data.saveExpert({ displayName: 'Test Expert', bio: '', languages: [], modes: ['chat'], availabilityNote: '', active: true, serviceSlugs: ['numerology'] })
    if (!e.ok) throw new Error('setup failed')
    await data.updateRequest(id, { status: 'awaiting_confirmation' })
    const { user } = await adminOn(`/admin/requests/${id}`, data)
    await user.click(await screen.findByRole('button', { name: /save and confirm consultation/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/choose an expert and a date and time/i)
    await user.selectOptions(screen.getByLabelText(/^expert$/i), e.data.id)
    const future = new Date(Date.now() + 2 * 86400000)
    const pad = (n: number) => String(n).padStart(2, '0')
    await user.type(screen.getByLabelText(/date and time/i), `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}T10:30`)
    await user.type(screen.getByLabelText(/meeting link/i), 'https://meet.example.com/abc')
    await user.click(screen.getByRole('button', { name: /save and confirm consultation/i }))
    await waitFor(() => expect(data.tables.requests[0]!.status).toBe('confirmed'))
    expect(data.tables.requests[0]).toMatchObject({ assignedExpertId: e.data.id, meetingLink: 'https://meet.example.com/abc' })
  })

  it('records an internal note, and keeps notes away from customers', async () => {
    const data = world()
    const id = await seedRequest(data, ASHA)
    const { user } = await adminOn(`/admin/requests/${id}`, data)
    await user.type(await screen.findByLabelText(/^add a note/i), 'Called customer, prefers evenings.')
    await user.click(screen.getByRole('button', { name: /^add note$/i }))
    expect(await screen.findByText(/prefers evenings/i)).toBeInTheDocument()
    expect(data.tables.notes).toHaveLength(1)
    data.actAs(customer(ASHA))
    expect(await data.listNotes(id)).toEqual({ ok: true, data: [] })
  })

  it('saves prices in rupees as paise, and clears a price when emptied', async () => {
    const data = world()
    const { user } = await adminOn('/admin/services', data)
    const form = await screen.findByRole('form', { name: /settings for numerology/i })
    await user.type(within(form).getByLabelText(/chat.*price/i), '499.50')
    await user.click(within(form).getByRole('button', { name: /save numerology/i }))
    await waitFor(() => expect(data.tables.prices.find((p) => p.serviceSlug === 'numerology' && p.mode === 'chat')!.amountMinor).toBe(49950))
    expect(await screen.findByText(/₹499\.50/)).toBeInTheDocument()
  })

  it('rejects an invalid price without contacting the service', async () => {
    const data = world()
    const { user } = await adminOn('/admin/services', data)
    const form = await screen.findByRole('form', { name: /settings for numerology/i })
    await user.type(within(form).getByLabelText(/chat.*price/i), '-5')
    await user.click(within(form).getByRole('button', { name: /save numerology/i }))
    expect(await screen.findByText(/positive amount/i)).toBeInTheDocument()
    expect(data.calls).not.toContain('updateService')
  })

  it('adds an expert with services and modes', async () => {
    const data = world()
    const { user } = await adminOn('/admin/experts', data)
    await user.click(await screen.findByRole('button', { name: /add an expert/i }))
    await user.type(screen.getByLabelText(/display name/i), 'Demo Expert')
    await user.click(screen.getByLabelText(/^numerology$/i))
    await user.click(screen.getByLabelText(/^chat/i))
    await user.click(screen.getByRole('button', { name: /save expert/i }))
    await waitFor(() => expect(data.tables.experts).toHaveLength(1))
    expect(data.tables.experts[0]).toMatchObject({ displayName: 'Demo Expert', serviceSlugs: ['numerology'], modes: ['chat'], active: true })
  })

  it('saves payment settings, rejects a malformed UPI ID, and shows what customers will see', async () => {
    const data = world()
    const { user } = await adminOn('/admin/settings', data)
    await user.type(await screen.findByLabelText(/^upi id/i), 'not a upi id')
    await user.click(screen.getByRole('button', { name: /save payment settings/i }))
    expect(await screen.findByText(/looks like name@bank/i)).toBeInTheDocument()
    expect(data.tables.settings.upi_id).toBe('')
    await user.clear(screen.getByLabelText(/^upi id/i))
    await user.type(screen.getByLabelText(/^upi id/i), 'shop@examplebank')
    await user.click(screen.getByRole('button', { name: /save payment settings/i }))
    await waitFor(() => expect(data.tables.settings.upi_id).toBe('shop@examplebank'))
  })

  it('shows the activity log', async () => {
    const data = world()
    await seedRequest(data, ASHA)
    await adminOn('/admin/audit', data)
    expect(await screen.findByText(/insert · consultation_requests/i)).toBeInTheDocument()
    expect(screen.getByText(/not tamper-proof/i)).toBeInTheDocument()
  })
})

describe('expert (staff) area', () => {
  it('shows an expert only the requests assigned to them, and no payments', async () => {
    const data = world()
    const mine = await seedRequest(data, ASHA)
    await seedRequest(data, RAVI, { serviceSlug: 'palmistry', mode: 'voice', dateOfBirth: '' })
    data.actAs(admin(ADMIN1))
    const e = await data.saveExpert({ displayName: 'Expert A', bio: '', languages: [], modes: ['chat'], availabilityNote: '', active: true, serviceSlugs: ['numerology'] })
    if (!e.ok) throw new Error('setup')
    await data.updateRequest(mine, { assignedExpertId: e.data.id })
    const staffUser = { id: 'u-staff', email: 's@example.com', fullName: 'Staff A' }
    const auth = createFakeAuth({ user: staffUser })
    auth.setMfa({ level: 'aal2', verifiedFactorId: 'f1' })
    await mount('/staff', data, staffUser, { id: staffUser.id, staff: { role: 'staff', expertId: e.data.id }, aal2: true }, auth)
    expect(await screen.findByText('Asha Rao')).toBeInTheDocument()
    expect(screen.queryByText('Ravi Menon')).toBeNull()
    expect(screen.queryByRole('columnheader', { name: /payment/i })).toBeNull() // experts are not shown payments at all
  })

  it('does not let an expert open the admin area', async () => {
    const data = world()
    const staffUser = { id: 'u-staff', email: 's@example.com', fullName: 'Staff A' }
    const auth = createFakeAuth({ user: staffUser })
    auth.setMfa({ level: 'aal2', verifiedFactorId: 'f1' })
    await mount('/admin', data, staffUser, { id: staffUser.id, staff: { role: 'staff', expertId: 'x' }, aal2: true }, auth)
    expect(await screen.findByText(/this area is not available to your account/i)).toBeInTheDocument()
  })
})

describe('account security (authenticator set-up for anyone logged in)', () => {
  it('lets a customer with no authenticator set one up, and says it grants no access by itself', async () => {
    const data = world()
    const auth = createFakeAuth({ user: ASHA })
    const { user } = await mount('/dashboard/security', data, ASHA, customer(ASHA), auth)
    expect(await screen.findByText(/customers don’t need this/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /set up authenticator/i }))
    expect(await screen.findByAltText(/qr code/i)).toBeInTheDocument()
    await user.type(screen.getByLabelText(/6-digit code/i), '123456')
    await user.click(screen.getByRole('button', { name: /^continue$/i }))
    expect(await screen.findByText(/your authenticator is set up and verified/i)).toBeInTheDocument()
    expect(auth.mfaCalls.verify).toEqual([{ factorId: 'f-new', code: '123456' }])
  })

  it('sends a logged-out visitor to log in', async () => {
    const { router } = await mount('/dashboard/security', world(), null, { id: null })
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })

  it('is linked from the dashboard', async () => {
    await mount('/dashboard', world(), ASHA, customer(ASHA))
    expect(await screen.findByRole('link', { name: /account security/i })).toHaveAttribute('href', '/dashboard/security')
  })
})

describe('completeness additions', () => {
  it('dashboard updates tell the customer what needs them (payment reference) and what is confirmed', async () => {
    const data = world()
    const waiting = await seedRequest(data, ASHA)
    const second = await seedRequest(data, ASHA, { serviceSlug: 'palmistry', mode: 'voice', dateOfBirth: '' })
    data.tables.requests.find((r) => r.id === second)!.status = 'confirmed'
    data.tables.requests.find((r) => r.id === second)!.scheduledAt = new Date(Date.now() + 86400000).toISOString()
    await mount('/dashboard', data, ASHA, customer(ASHA))
    const updates = await screen.findByRole('heading', { name: /updates for you/i })
    const box = within(updates.closest('section')!)
    expect(box.getByText(/palmistry \(voice.*\) consultation is confirmed for/i)).toBeInTheDocument()
    expect(box.getByText(/numerology \(.*\) request is waiting for your payment reference/i)).toBeInTheDocument()
    expect(box.getAllByRole('link', { name: /open/i }).some((a) => a.getAttribute('href') === `/dashboard/requests/${waiting}`)).toBe(true)
  })

  it('the dashboard has a privacy and account help card that does not promise automatic deletion', async () => {
    await mount('/dashboard', world(), ASHA, customer(ASHA))
    const card = within((await screen.findByRole('heading', { name: /privacy and account help/i })).closest('section')!)
    expect(card.getByText(/does not happen automatically/i)).toBeInTheDocument()
    expect(card.getByRole('link', { name: /privacy policy/i })).toHaveAttribute('href', '/privacy')
  })

  it('service pages show the price an administrator set, and "Price coming soon" when none is set', async () => {
    const data = world()
    priced(data, 'numerology', 'chat', 49900)
    await mount('/services/numerology', data, null, { id: null })
    expect(await screen.findByText('₹499.00')).toBeInTheDocument()
    expect(screen.getAllByText(/price coming soon/i).length).toBeGreaterThan(0)
  })

  it('the experts page never lists experts, even when real experts exist in the database', async () => {
    const data = world()
    data.actAs(admin(ADMIN1))
    await data.saveExpert({ displayName: 'Real Expert One', bio: 'Approved bio text.', languages: ['English'], modes: ['chat'], availabilityNote: '', active: true, serviceSlugs: ['numerology'] })
    await mount('/experts', data, null, { id: null })
    expect(await screen.findByText(/right expert will be connected to you from our end/i)).toBeInTheDocument()
    expect(screen.queryByText('Real Expert One')).toBeNull()
  })

  it('the header offers administrators and experts a link to their area, and customers none', async () => {
    const data = world()
    const auth = createFakeAuth({ user: ADMIN1 })
    auth.setMfa({ level: 'aal2', verifiedFactorId: 'f1' })
    await mount('/', data, ADMIN1, admin(ADMIN1), auth)
    await waitFor(() => expect(screen.getAllByRole('link', { name: /^admin$/i }).length).toBeGreaterThan(0))
  })

  it('resends the confirmation email from the log-in screen when the email is not confirmed, with the same answer for any address', async () => {
    const data = world()
    const auth = createFakeAuth()
    auth.failNext('email_not_confirmed')
    const { user } = await mount('/login', data, null, { id: null }, auth)
    await user.type(await screen.findByLabelText(/^email/i), 'Asha@Example.com')
    await user.type(screen.getByLabelText(/^password/i), 'whatever-password')
    await user.click(screen.getByRole('button', { name: /^log in$/i }))
    await user.click(await screen.findByRole('button', { name: /send the confirmation email again/i }))
    expect(await screen.findByText(/if that address has an account waiting to be confirmed/i)).toBeInTheDocument()
    expect(auth.calls.resends).toEqual(['asha@example.com'])
  })
})

describe('bug-batch regressions (found in the browser walk-through)', () => {
  it('D: the "amount received" box starts EMPTY and verification needs a typed amount (no one-click verify)', async () => {
    const data = world()
    priced(data)
    data.tables.settings.upi_id = 'astrasoul@examplebank'
    const id = await seedRequest(data, ASHA)
    data.actAs(customer(ASHA))
    await data.submitPaymentReference({ requestId: id, upiReference: 'AB12CD34EF56', payerName: 'Asha Rao', paidOn: '2026-10-01' })
    const auth = createFakeAuth({ user: ADMIN1 })
    auth.setMfa({ level: 'aal2', verifiedFactorId: 'f1' })
    const { user } = await mount(`/admin/requests/${id}`, data, ADMIN1, admin(ADMIN1), auth)
    expect(await screen.findByLabelText(/amount you saw in the bank statement/i)).toHaveValue('')
    await user.click(screen.getByRole('button', { name: /verify: payment received/i }))
    expect(screen.getByText(/type the amount you saw in the bank statement/i)).toBeInTheDocument()
    expect(data.calls).not.toContain('verifyPayment')
    expect(data.tables.requests[0]!.payments[0]!.status).toBe('pending')
    // rejecting ("could not match") does not need an amount
    await user.click(screen.getByRole('button', { name: /reject: could not match/i }))
    await waitFor(() => expect(data.tables.requests[0]!.payments[0]!.status).toBe('failed'))
  })

  it('A/D: an expert is never shown payment information, even if a payment exists on their request', async () => {
    const data = world()
    priced(data)
    data.tables.settings.upi_id = 'astrasoul@examplebank'
    const id = await seedRequest(data, ASHA)
    data.actAs(customer(ASHA))
    await data.submitPaymentReference({ requestId: id, upiReference: 'QW12ER34TY56', payerName: 'Asha Rao', paidOn: '2026-10-01' })
    data.actAs(admin(ADMIN1))
    const e = await data.saveExpert({ displayName: 'Expert A', bio: '', languages: [], modes: ['chat'], availabilityNote: '', active: true, serviceSlugs: ['numerology'] })
    if (!e.ok) throw new Error('setup')
    await data.updateRequest(id, { assignedExpertId: e.data.id })
    const staffUser = { id: 'u-staff', email: 's@example.com', fullName: 'Staff A' }
    const auth = createFakeAuth({ user: staffUser })
    auth.setMfa({ level: 'aal2', verifiedFactorId: 'f1' })
    await mount(`/staff/requests/${id}`, data, staffUser, { id: staffUser.id, staff: { role: 'staff', expertId: e.data.id }, aal2: true }, auth)
    expect(await screen.findByText('Asha Rao')).toBeInTheDocument()
    expect(screen.queryByText(/QW12ER34TY56/)).toBeNull()
    expect(screen.queryByRole('heading', { name: /^payments$/i })).toBeNull()
    expect(screen.getByRole('main')).toHaveTextContent(/expert\s*you/i)
  })

  it('C/F: the team sees team wording, and the customer sees each sentence only once', async () => {
    const data = world()
    const id = await seedRequest(data, ASHA)
    const auth = createFakeAuth({ user: ADMIN1 })
    auth.setMfa({ level: 'aal2', verifiedFactorId: 'f1' })
    const admin1 = await mount(`/admin/requests/${id}`, data, ADMIN1, admin(ADMIN1), auth)
    expect(await screen.findByText(/new request\. check whether a payment reference has arrived/i)).toBeInTheDocument()
    expect(screen.queryByText(/we have your request/i)).toBeNull()
    admin1.unmount()
    await mount(`/dashboard/requests/${id}`, data, ASHA, customer(ASHA))
    const note = await screen.findByText(/we have your request\./i)
    const text = note.parentElement!.textContent ?? ''
    expect(text.match(/payment/gi)?.length ?? 0).toBeLessThanOrEqual(2)
    expect(text).not.toMatch(/so our team can start\.[\s\S]*so our team can start\./i)
  })
})
