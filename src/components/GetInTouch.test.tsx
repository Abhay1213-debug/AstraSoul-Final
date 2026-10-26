import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { routes } from '../App'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { contactMessage, contactSubject, gmailComposeUrl, mailtoUrl, whatsappUrl } from '../lib/contact'
import { GetInTouch } from './GetInTouch'

describe('contact message and link builders', () => {
  it('the message says who is writing, from which website and which page, and ends ready for the visitor’s question', () => {
    const m = contactMessage({ page: 'Numerology', path: '/services/numerology' })
    expect(m).toMatch(/^Hello Abhay, I'm connecting with you through the Ankiro website/)
    expect(m).toContain('I was looking at: Numerology, /services/numerology')
    expect(m.endsWith('My question: ')).toBe(true)
    expect(contactMessage()).not.toContain('I was looking at')
  })

  it('WhatsApp links go to the owner’s number in international format with the message encoded', () => {
    const url = whatsappUrl('Hello & welcome? 100%')
    expect(url).toBe('https://wa.me/918795272576?text=Hello%20%26%20welcome%3F%20100%25')
  })

  it('email links go to the owner’s address with subject and body encoded', () => {
    const subject = contactSubject({ page: 'Palmistry' })
    expect(subject).toBe('Ankiro website: question about Palmistry')
    const mail = mailtoUrl(subject, 'Line one\nLine two')
    expect(mail).toMatch(/^mailto:abhayprabhakar1213@gmail\.com\?subject=/)
    expect(mail).toContain('body=Line%20one%0ALine%20two')
    expect(gmailComposeUrl(subject, 'x')).toMatch(/^https:\/\/mail\.google\.com\/mail\/\?view=cm&fs=1&to=abhayprabhakar1213%40gmail\.com&su=/)
  })
})

describe('<GetInTouch />', () => {
  it('is on every page of the site, closed until pressed', () => {
    for (const path of ['/', '/services/numerology', '/contact', '/privacy', '/payment']) {
      const router = createMemoryRouter(routes, { initialEntries: [path] })
      const { unmount } = render(<RouterProvider router={router} />)
      const btn = screen.getByRole('button', { name: /get in touch/i })
      expect(btn, path).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByRole('dialog', { name: /get in touch/i }), path).toBeNull()
      unmount()
    }
  })

  it('opens two options with the number visible, each with a ready-made message naming the website and page', async () => {
    const user = userEvent.setup()
    document.title = 'Numerology · Ankiro'
    render(<MemoryRouter initialEntries={['/services/numerology']}><GetInTouch /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: /get in touch/i }))
    const panel = screen.getByRole('dialog', { name: /get in touch/i })
    expect(within(panel).getByText('+91 87952 72576')).toBeInTheDocument()
    expect(within(panel).getByText('abhayprabhakar1213@gmail.com')).toBeInTheDocument()
    const wa = within(panel).getByRole('link', { name: /whatsapp/i })
    expect(wa.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/918795272576\?text=/)
    expect(decodeURIComponent(wa.getAttribute('href')!)).toMatch(/connecting with you through the Ankiro website \(I was looking at: Numerology, \/services\/numerology\)/)
    expect(wa).toHaveAttribute('target', '_blank')
    expect(wa).toHaveAttribute('rel', expect.stringContaining('noopener'))
    const gm = within(panel).getByRole('link', { name: /gmail/i })
    expect(gm.getAttribute('href')).toMatch(/^https:\/\/mail\.google\.com\/mail\/\?view=cm/)
    expect(decodeURIComponent(gm.getAttribute('href')!)).toContain('Ankiro website: question about Numerology')
    expect(within(panel).getByRole('link', { name: /another email app/i }).getAttribute('href')).toMatch(/^mailto:abhayprabhakar1213@gmail\.com\?/)
  })

  it('closes with Escape and with the close button, and returns focus to the button', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><GetInTouch /></MemoryRouter>)
    const btn = screen.getByRole('button', { name: /get in touch/i })
    await user.click(btn)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(btn).toHaveFocus()
    await user.click(btn)
    await user.click(screen.getByRole('button', { name: /^close$/i }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
