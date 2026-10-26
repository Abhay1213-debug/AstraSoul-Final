import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ConsultationRequestFlow } from './ConsultationRequestFlow'

const setup = (url = '/consultation/request') => {
  render(<MemoryRouter initialEntries={[url]}><ConsultationRequestFlow /></MemoryRouter>)
  return userEvent.setup()
}
const next = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: /continue|prepare my request/i }))

async function fillDetails(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/full name/i), 'Asha Rao')
  await user.type(screen.getByLabelText(/^email/i), 'asha@example.com')
  await user.type(screen.getByLabelText(/^date of birth/i), '1990-03-29')
  await user.type(screen.getByLabelText(/what would you like guidance on/i), 'I would like to understand my career direction.')
}

describe('<ConsultationRequestFlow />', () => {
  it('requires a service before continuing', async () => {
    const user = setup()
    await next(user)
    expect(screen.getByText('Please choose a service.')).toBeInTheDocument()
  })

  it('skips to details when a service is preselected via the URL', () => {
    setup('/consultation/request?service=palmistry')
    expect(screen.getByRole('heading', { name: /tell us a little about you/i })).toBeInTheDocument()
    expect(screen.getByText(/we don’t ask for photos here/i)).toBeInTheDocument()
  })

  it('ignores an invalid service in the URL', () => {
    setup('/consultation/request?service=<script>')
    expect(screen.getByRole('heading', { name: /which service/i })).toBeInTheDocument()
  })

  it('validates details with clear errors', async () => {
    const user = setup('/consultation/request?service=numerology')
    await next(user)
    expect(screen.getByText('Please enter your full name.')).toBeInTheDocument()
    expect(screen.getByText('Please enter your email address.')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/fix the highlighted fields/i)
  })

  it('completes the flow and never claims the request was sent, booked or paid', async () => {
    const user = setup('/consultation/request?service=numerology')
    await fillDetails(user)
    await next(user)

    await next(user) // no mode chosen
    expect(screen.getByText(/choose how you would like to consult/i)).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /video consultation/i }))
    await next(user)

    expect(screen.getByRole('heading', { name: /review your request/i })).toBeInTheDocument()
    expect(screen.getByText(/Confirmed before you pay/)).toBeInTheDocument()
    await next(user) // consent missing
    expect(screen.getByText(/please confirm you understand/i)).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox'))
    await next(user)

    expect(screen.getByRole('heading', { name: /ready — send it to our team/i })).toBeInTheDocument()
    expect(screen.getByText(/Nothing has been submitted, booked or paid/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copy summary/i })).toBeInTheDocument()
    // Sending is by the visitor's OWN WhatsApp / email app; the site never sends anything itself.
    const wa = screen.getByRole('link', { name: /send on whatsapp/i })
    expect(wa.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/918795272576\?text=/)
    expect(decodeURIComponent(wa.getAttribute('href')!)).toMatch(/Asha Rao/)
    expect(screen.getByRole('link', { name: /open in email app/i }).getAttribute('href')).toMatch(/^mailto:abhayprabhakar1213@gmail\.com\?/)
    // the payment option is on the last step: UPI ID + QR code, pay only after the amount is confirmed, never share a PIN
    expect(screen.getByText('abhayprabhakar1213@okhdfcbank')).toBeInTheDocument()
    expect(screen.getByAltText(/upi qr code for abhay prabhakar/i)).toHaveAttribute('src', '/images/upi-qr.jpg')
    expect(screen.getByText(/please pay only after that/i)).toBeInTheDocument()
    expect(screen.getByText(/never share your upi pin/i)).toBeInTheDocument()
  })

  it('keeps entered data when going back a step', async () => {
    const user = setup('/consultation/request?service=numerology')
    await fillDetails(user)
    await next(user)
    await user.click(screen.getByRole('button', { name: /back/i }))
    expect(screen.getByLabelText(/full name/i)).toHaveValue('Asha Rao')
  })

  it('does not write anything to localStorage/sessionStorage', async () => {
    const user = setup('/consultation/request?service=numerology')
    await fillDetails(user)
    await next(user)
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })
})
