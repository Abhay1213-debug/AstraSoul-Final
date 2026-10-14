import { render, screen } from '@testing-library/react'
import { createMemoryRouter, matchRoutes, RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { routes } from '../App'

const paths = [
  '/', '/about', '/services', '/services/numerology', '/services/palmistry', '/services/gemstone-guidance',
  '/services/color-therapy', '/how-it-works', '/experts', '/consultation', '/consultation/request', '/free-insight',
  '/contact', '/login', '/signup', '/dashboard', '/privacy', '/terms', '/refund-policy',
]

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return render(<RouterProvider router={router} />)
}

const isRealRoute = (href: string) => {
  const pathname = href.split(/[?#]/)[0]
  const matches = matchRoutes(routes, pathname)
  return Boolean(matches) && matches![matches!.length - 1].route.path !== '*'
}

describe('every public page', () => {
  it.each(paths)('%s renders with exactly one h1', (path) => {
    const { container } = renderAt(path)
    expect(container.querySelectorAll('h1').length).toBe(1)
    expect(screen.queryByText(/couldn’t find that page/i)).not.toBeInTheDocument()
  })

  it('has no broken internal links (navigation, footer, CTAs on every page)', () => {
    const broken: string[] = []
    for (const path of paths) {
      const { container, unmount } = renderAt(path)
      container.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
        const href = a.getAttribute('href')!
        if (href.startsWith('/') && !isRealRoute(href)) broken.push(`${path} → ${href}`)
      })
      unmount()
    }
    expect(broken).toEqual([])
  })

  it('the retired /weekly-horoscope link redirects to the free insight (no broken links)', async () => {
    renderAt('/weekly-horoscope')
    expect(await screen.findByRole('heading', { level: 1, name: /discover your moolank/i })).toBeInTheDocument()
  })

  it('unknown paths show the not-found page', () => {
    renderAt('/does-not-exist')
    expect(screen.getByText(/couldn’t find that page/i)).toBeInTheDocument()
    renderAt('/services/not-a-service')
  })
})

describe('honesty guardrails (PROJECT_BRIEF §1)', () => {
  const forbidden = [
    /\b\d[\d,.]*\s*\+?\s*(seekers|people guided|customers|clients|users)\b/i, // invented customer counts
    /\btrusted experts\b/i,
    /\bcertified\b|\bqualified (astrologer|expert)\b|\byears of experience\b/i, // invented credentials
    /(?<!\bno\s)(?<!\bnot\s)(?<!\bnor\s)\bguaranteed?\s+(results?|outcomes?|success)\b/i, // negated disclaimers are fine
    /\b(5|4\.\d)[- ]?stars?\b|\btestimonials?\b/i,
    /horoscope|zodiac|astrolog|kundli|\bplanets?\b|sun sign/i, // astrology is not part of the service offering
  ]

  it.each(paths)('%s makes no invented claims', (path) => {
    const { container } = renderAt(path)
    const text = container.textContent ?? ''
    for (const re of forbidden) {
      const m = re.exec(text)
      expect(m ? text.slice(Math.max(0, m.index - 40), m.index + 40) : null, `${path} matched ${re}`).toBeNull()
    }
  })

  it('experts page labels every profile as a demonstration', () => {
    renderAt('/experts')
    expect(screen.getAllByText(/demonstration profile$/i).length).toBeGreaterThanOrEqual(3)
    expect(screen.getByText(/No real expert information has been added yet/i)).toBeInTheDocument()
  })

  it('login, signup and dashboard say they are not available', () => {
    for (const path of ['/login', '/signup', '/dashboard']) {
      const { unmount } = renderAt(path)
      expect(screen.getByRole('status')).toHaveTextContent(/isn’t available yet/i)
      unmount()
    }
  })

  it('there is no form on login/signup that could pretend to save credentials', () => {
    const { container } = renderAt('/login')
    expect(container.querySelector('input[type=password]')).toBeNull()
  })
})
