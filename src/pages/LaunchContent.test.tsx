import { render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { routes } from '../App'

function page(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return render(<RouterProvider router={router} />)
}
const mainText = () => screen.getByRole('main').textContent ?? ''

describe('launch content (accounts switched off, as at launch)', () => {
  it('legal pages name the operator, give real contact details and have no unfilled placeholders', () => {
    for (const path of ['/privacy', '/terms', '/refund-policy']) {
      const { unmount } = page(path)
      const text = mainText()
      expect(text, path).not.toMatch(/\[[^\]]{4,}\]/) // no "[to be confirmed]" style placeholders
      expect(text, path).not.toMatch(/not legal advice|working name|reviewed by a lawyer/i)
      expect(text, path).toMatch(/Last updated: 27 October 2026/)
      unmount()
    }
    page('/privacy')
    expect(mainText()).toMatch(/Ankiro is run by Abhay Prabhakar \(founder\), Gurugram, India/)
    expect(mainText()).toMatch(/abhayprabhakar1213@gmail\.com/)
    expect(mainText()).toMatch(/\+91 87952 72576/)
  })

  it('the refund policy states exactly the owner’s rule: 80% before an expert is confirmed, nothing after', () => {
    page('/refund-policy')
    expect(mainText()).toMatch(/before an expert has been confirmed.*80% of the amount you paid is refunded/i)
    expect(mainText()).toMatch(/Once an expert has been confirmed.*no refund is given/i)
  })

  it('the payment page shows the owner’s UPI ID and QR code, warns never to share a PIN, and says to pay only after the amount is confirmed', () => {
    page('/payment')
    expect(mainText()).toContain('abhayprabhakar1213@okhdfcbank')
    expect(mainText()).toContain('Abhay Prabhakar')
    expect(screen.getByRole('img', { name: /upi qr code for abhay prabhakar/i })).toHaveAttribute('src', '/images/upi-qr.jpg')
    expect(mainText()).toMatch(/never share your upi pin/i)
    expect(mainText()).toMatch(/pay only after our team has confirmed the amount/i)
    expect(mainText()).toMatch(/80% of the amount is refunded/i)
  })

  it('services show "Confirmed before you pay" and the 20-minute session note; no page invents a price', () => {
    page('/services/numerology')
    expect(screen.getAllByText(/confirmed before you pay/i).length).toBeGreaterThanOrEqual(3)
    expect(mainText()).toMatch(/about 20 minutes/i)
    expect(mainText()).not.toMatch(/₹\s?\d/)
  })

  it('there are no demonstration experts, no "planned" PDF reports and no dead log-in links on the public pages', () => {
    for (const path of ['/', '/how-it-works', '/experts', '/consultation', '/about', '/services']) {
      const { unmount } = page(path)
      const text = document.body.textContent ?? ''
      expect(text, path).not.toMatch(/demonstration|PDF report|guidance report/i)
      expect(screen.queryByRole('link', { name: /^log in$/i }), path).toBeNull()
      expect(screen.queryByRole('link', { name: /^sign up$/i }), path).toBeNull()
      unmount()
    }
  })

  it('the footer carries the contact details and the payment link', () => {
    page('/')
    const footer = screen.getByRole('contentinfo')
    expect(footer).toHaveTextContent('abhayprabhakar1213@gmail.com')
    expect(footer).toHaveTextContent('+91 87952 72576')
    expect(footer.querySelector('a[href="/payment"]')).not.toBeNull()
  })

  it('the contact page offers WhatsApp and Gmail with ready-made messages', () => {
    page('/contact')
    const main = within(screen.getByRole('main'))
    const wa = main.getByRole('link', { name: /whatsapp/i })
    expect(wa.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/918795272576\?text=/)
    expect(main.getByRole('link', { name: /gmail/i }).getAttribute('href')).toMatch(/^https:\/\/mail\.google\.com\//)
  })
})
