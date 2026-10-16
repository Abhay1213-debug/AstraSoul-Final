import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AuthProvider } from '../lib/auth'
import { createFakeAuth } from '../test/fakeAuth'
import { Header } from './Header'

describe('<Header /> mobile menu', () => {
  it('opens, lists every destination, and closes with Escape', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Header /></MemoryRouter>)
    const btn = screen.getByRole('button', { name: /open menu/i })
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    await user.click(btn)
    const nav = screen.getByRole('navigation', { name: 'Mobile' })
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    for (const label of ['Services', 'How it works', 'Experts', 'Consultation', 'Free insight', 'About', 'Contact']) {
      expect(nav).toHaveTextContent(label)
    }
    // accounts are not switched on in this test: no "Log in" link that would lead nowhere
    expect(nav).not.toHaveTextContent('Log in')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('navigation', { name: 'Mobile' })).not.toBeInTheDocument()
  })

  it('renders the fixed mobile panel outside <header> (header backdrop-filter would shrink it)', async () => {
    const user = userEvent.setup()
    const { container } = render(<MemoryRouter><Header /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: /open menu/i }))
    const header = container.querySelector('header')!
    expect(header.contains(document.getElementById('mobile-nav'))).toBe(false)
  })

  it('shows "Log in" only when accounts are switched on', async () => {
    render(<MemoryRouter><AuthProvider service={createFakeAuth()}><Header /></AuthProvider></MemoryRouter>)
    expect((await screen.findAllByRole('link', { name: /^log in$/i })).length).toBeGreaterThan(0)
  })
})
