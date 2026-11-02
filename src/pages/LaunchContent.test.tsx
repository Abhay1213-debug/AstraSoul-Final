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
      expect(text, path).toMatch(/Last updated: 2 November 2026/)
      unmount()
    }
    page('/privacy')
    expect(mainText()).toMatch(/Ankiro is run by Abhay Prabhakar \(founder\), Gurugram, India/)
    expect(mainText()).toMatch(/abhayprabhakar1213@gmail\.com/)
    expect(mainText()).toMatch(/\+91 87952 72576/)
  })

  it('the refund policy states exactly the owner’s rule: 80% if cancelled at least 12 hours before, nothing later', () => {
    page('/refund-policy')
    expect(mainText()).toMatch(/at least 12 hours before your booked time, 80% of the amount you paid is refunded/i)
    expect(mainText()).toMatch(/less than 12 hours before your booked time, no refund is given/i)
    expect(mainText()).not.toMatch(/expert (is|has been) confirmed/i)
  })

  it('the payment page explains paying online through Dodo Payments, the statement name, the PIN warning and the refund rule', () => {
    page('/payment')
    expect(mainText()).toMatch(/pay online when you book, by UPI or card/i)
    expect(mainText()).toMatch(/Dodo Payments/)
    expect(mainText()).toMatch(/DODOPAY ANKIRO/)
    expect(mainText()).toMatch(/never ask for your upi pin/i)
    expect(mainText()).toMatch(/80% of what you paid is refunded if you cancel at least 12 hours before/i)
    expect(mainText()).not.toMatch(/okhdfcbank/) // the old manual UPI route is gone from the public pages
  })

  it('services show their price plus GST, the packages they are in, and the 10-minute voice call', () => {
    page('/services/numerology')
    expect(mainText()).toMatch(/₹499 \+ GST/)
    expect(mainText()).toMatch(/Palmistry \+ Numerology.*Highly recommended.*₹1,299 \+ GST/)
    expect(mainText()).toMatch(/Diamond package.*₹2,099 \+ GST/)
    expect(mainText()).toMatch(/10-minute voice call/i)
    expect(mainText()).not.toMatch(/price coming soon/i)
  })

  it('the consultation page lists every price, and a customised plan by message', () => {
    page('/consultation')
    for (const p of ['₹499', '₹899', '₹699', '₹299', '₹1,299', '₹1,099', '₹1,499', '₹899', '₹2,099']) expect(mainText()).toContain(`${p} + GST`)
    expect(screen.getByRole('link', { name: /customised plan/i })).toBeInTheDocument()
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
