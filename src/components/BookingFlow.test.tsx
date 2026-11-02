import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { browser } from '../lib/bookingApi'
import BookingStatus from '../pages/BookingStatus'
import { BookingFlow } from './BookingFlow'

const slots = (over: Record<string, unknown> = {}) => ({
  ready: true, payments: 'test', testPrice: 1, prices: {}, extensionPrice: null,
  days: [
    { date: '2026-11-02', slots: [{ time: '17:30', status: 'booked' }, { time: '17:50', status: 'free' }, { time: '18:10', status: 'free' }] },
    { date: '2026-11-03', slots: [{ time: '17:30', status: 'booked' }, { time: '17:50', status: 'booked' }, { time: '18:10', status: 'booked' }] },
  ],
  ...over,
})

function serve(routes: Record<string, (init?: RequestInit) => { status?: number; body: unknown }>) {
  const calls: { url: string; init?: RequestInit }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    const key = Object.keys(routes).find((k) => url.startsWith(k))!
    const r = routes[key](init)
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 })
  }))
  return calls
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

async function fillDetails(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/full name/i), 'Asha Rao')
  await user.type(screen.getByLabelText(/^email/i), 'asha@example.com')
  await user.type(screen.getByLabelText(/phone/i), '98765 43210')
  await user.type(screen.getByLabelText(/date of birth/i), '1990-03-29')
  await user.type(screen.getByLabelText(/guidance on/i), 'Career direction this year.')
  await user.click(screen.getByRole('button', { name: /continue/i }))
}

describe('<BookingFlow />', () => {
  it('goes details → consultation or package → time → pay, and sends exactly what was chosen', async () => {
    const calls = serve({ '/api/slots': () => ({ body: slots() }), '/api/checkout': () => ({ body: { url: 'https://test.checkout.dodopayments.com/x', bookingId: 'b1' } }) })
    const go = vi.spyOn(browser, 'go').mockImplementation(() => {})
    render(<MemoryRouter initialEntries={['/consultation/request?service=numerology']}><BookingFlow /></MemoryRouter>)
    const user = userEvent.setup()

    expect(screen.getByRole('heading', { name: /tell us a little about you/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /continue/i }))
    expect(screen.getByText('Please enter your phone or WhatsApp number.')).toBeInTheDocument()
    await fillDetails(user)

    expect(screen.getByRole('heading', { name: /what type of consultation/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /^numerology.*₹499 \+ GST$/i })).toBeChecked()
    expect(screen.getByRole('radio', { name: /^highly recommended.*palmistry \+ numerology.*₹1,299 \+ GST$/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /^diamond package.*₹2,099 \+ GST$/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /customised plan/i }).getAttribute('href')).toMatch(/^https:\/\/wa\.me\/.*customised/)
    await user.click(screen.getByRole('radio', { name: /^palmistry \+ gemstone guidance/i }))
    expect(screen.getByText(/how to share photos of your palms/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(await screen.findByText(/palmistry \+ gemstone guidance · 10-minute voice call/i)).toBeInTheDocument()
    expect(screen.getByText('₹1,499 + GST')).toBeInTheDocument() // the real price, not the test price
    expect(screen.queryByRole('radio', { name: /chat|video/i })).toBeNull() // voice calls only
    expect(screen.getByRole('radio', { name: /5:30 pm.*booked/i })).toBeDisabled()
    expect(screen.getByRole('radio', { name: /full/i })).toBeDisabled() // a fully booked day
    await user.click(screen.getByRole('radio', { name: /5:50 pm/i }))
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(screen.getByRole('heading', { name: /review and pay/i })).toBeInTheDocument()
    const summary = document.querySelector('dl.summary') as HTMLElement
    expect(within(summary).getByText('Palmistry + Gemstone Guidance')).toBeInTheDocument()
    expect(within(summary).getByText('Voice call')).toBeInTheDocument()
    expect(within(summary).getByText(/test mode/i)).toBeInTheDocument()
    expect(within(summary).getByText(/gst is added on the payment page/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /pay ₹1,499 \+ GST and book/i }))
    expect(screen.getByText(/agree to the terms/i)).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: /pay ₹1,499 \+ GST and book/i }))

    await waitFor(() => expect(go).toHaveBeenCalledWith('https://test.checkout.dodopayments.com/x'))
    const sent = JSON.parse(calls.find((c) => c.url === '/api/checkout')!.init!.body as string)
    expect(sent).toMatchObject({ services: ['palmistry', 'gemstone-guidance'], date: '2026-11-02', time: '17:50', consent: true })
    expect(sent).not.toHaveProperty('mode')
    expect(sent.details).toMatchObject({ name: 'Asha Rao', phone: '98765 43210', dateOfBirth: '1990-03-29' })
    expect(localStorage.length + sessionStorage.length).toBe(0)
  })

  it('sends the customer back to choose another time when someone takes the slot first', async () => {
    serve({ '/api/slots': () => ({ body: slots() }), '/api/checkout': () => ({ status: 409, body: { error: 'slot_taken' } }) })
    render(<MemoryRouter initialEntries={['/consultation/request?service=numerology']}><BookingFlow /></MemoryRouter>)
    const user = userEvent.setup()
    await fillDetails(user)
    await user.click(screen.getByRole('button', { name: /continue/i }))
    await user.click(await screen.findByRole('radio', { name: /6:10 pm/i }))
    await user.click(screen.getByRole('button', { name: /continue/i }))
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: /and book/i }))
    expect(await screen.findByText(/someone has just booked 6:10 pm/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /choose your time/i })).toBeInTheDocument()
  })

  it('lets the 25-minute Diamond package start only where the next slot is free too', async () => {
    const day = { date: '2026-11-02', slots: [{ time: '17:30', status: 'free' }, { time: '17:50', status: 'booked' }, { time: '18:10', status: 'free' }, { time: '18:30', status: 'free' }] }
    serve({ '/api/slots': () => ({ body: slots({ days: [day] }) }) })
    render(<MemoryRouter initialEntries={['/consultation/request?service=numerology+palmistry+gemstone-guidance+color-therapy']}><BookingFlow /></MemoryRouter>)
    const user = userEvent.setup()
    await fillDetails(user)
    expect(screen.getByRole('radio', { name: /^diamond package/i })).toBeChecked()
    await user.click(screen.getByRole('button', { name: /continue/i }))
    expect(await screen.findByText(/diamond package · 25-minute voice call/i)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /5:30 pm.*not enough time/i })).toBeDisabled()
    expect(screen.getByRole('radio', { name: /6:10 pm/i })).toBeEnabled()
    expect(screen.getByText(/this consultation is 25 minutes/i)).toBeInTheDocument()
  })

  it('offers WhatsApp when online booking is not open', async () => {
    serve({ '/api/slots': () => ({ body: slots({ ready: false, days: [] }) }) })
    render(<MemoryRouter initialEntries={['/consultation/request?service=numerology']}><BookingFlow /></MemoryRouter>)
    const user = userEvent.setup()
    await fillDetails(user)
    await user.click(screen.getByRole('button', { name: /continue/i }))
    const link = await screen.findByRole('link', { name: /book on whatsapp/i })
    expect(link.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/918795272576\?text=.*Numerology/)
    expect(screen.queryByRole('button', { name: /continue/i })).toBeNull()
  })
})

describe('booking page after paying', () => {
  const view = (over: Record<string, unknown> = {}) => ({ id: 'b1', status: 'paid', date: '2026-11-02', time: '17:50', services: ['numerology'], extension: false, amount: 499, test: false, firstName: 'Asha', reference: 'AB12CD34', ...over })
  const open = (path: string) => render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/booking/:id" element={<BookingStatus />} /></Routes></MemoryRouter>)

  it('confirms a paid booking with the time in IST, a calendar link and the reference', async () => {
    const calls = serve({ '/api/booking': () => ({ body: view() }) })
    open('/booking/b1?payment_id=pay_1&status=succeeded')
    expect(await screen.findByRole('heading', { name: /you’re booked/i })).toBeInTheDocument()
    expect(calls[0].url).toBe('/api/booking?id=b1&payment_id=pay_1')
    expect(screen.getByText(/5:50 pm \(IST\)/)).toBeInTheDocument()
    expect(screen.getByText('AB12CD34')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /add to google calendar/i }).getAttribute('href')).toContain('dates=20261102T122000Z%2F20261102T123000Z')
  })

  it('offers to try again when the payment did not go through', async () => {
    serve({ '/api/booking': () => ({ body: view({ status: 'cancelled' }) }), '/api/checkout': () => ({ body: { url: 'https://test.checkout/y', bookingId: 'b1' } }) })
    const go = vi.spyOn(browser, 'go').mockImplementation(() => {})
    open('/booking/b1?payment_id=pay_1&status=failed')
    expect(await screen.findByRole('heading', { name: /payment not completed/i })).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: /try the payment again/i }))
    await waitFor(() => expect(go).toHaveBeenCalledWith('https://test.checkout/y'))
  })
})
