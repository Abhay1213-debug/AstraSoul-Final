import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
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
    for (const label of ['Services', 'How it works', 'Experts', 'Consultation', 'Free insight', 'About', 'Contact', 'Log in']) {
      expect(nav).toHaveTextContent(label)
    }
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
})
