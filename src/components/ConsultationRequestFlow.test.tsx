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
    expect(screen.getByText(/online photo upload is not available yet/i)).toBeInTheDocument()
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
    expect(screen.getByText(/Price to be confirmed/)).toBeInTheDocument()
    await next(user) // consent missing
    expect(screen.getByText(/please confirm you understand/i)).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox'))
    await next(user)

    expect(screen.getByRole('heading', { name: /prepared — it has not been sent yet/i })).toBeInTheDocument()
    expect(screen.getByText(/Nothing has been submitted, booked or paid/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copy summary/i })).toBeInTheDocument()
    // No contact email is configured in tests → no mailto link, and the UI says so.
    expect(screen.queryByRole('link', { name: /open in email app/i })).not.toBeInTheDocument()
    expect(screen.getByText(/contact email isn’t set up yet/i)).toBeInTheDocument()
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
