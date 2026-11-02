import { Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useScrolled } from '../hooks/useHeaderState'
import { useAuth } from '../lib/auth'
import { useData } from '../lib/data'
import { Logo } from './Logo'
import { ButtonLink } from './ui'

export const primaryNav = [
  { to: '/services', label: 'Services' },
  { to: '/how-it-works', label: 'How it works' },
  { to: '/free-insight', label: 'Free insight' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
]

export function Header() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const scrolled = useScrolled()
  const pastHero = useScrolled(400)
  const authStatus = useAuth().state.status
  const signedIn = authStatus === 'signed_in'
  const accountsOn = authStatus !== 'unavailable'
  const { role } = useData()
  const roleLink = role.status === 'admin' ? { to: '/admin', label: 'Admin' } : role.status === 'staff' ? { to: '/staff', label: 'My requests' } : null
  // On the home page the header floats transparently over the dark hero until the page scrolls.
  const floating = pathname === '/' && !scrolled && !open
  // On phones the button lives in a bar at the bottom of the screen (the top bar is too narrow for it). Not on the request
  // page itself, and on the home page only once the hero, which has its own button, has scrolled away.
  const dock = pathname !== '/consultation/request' && (pathname !== '/' || pastHero) && !open

  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <>
      <header className={`site-header${pathname === '/' ? ' site-header--home' : ''}${floating ? ' is-floating' : ''}`}>
        <div className="container">
          <Logo />
          <nav className="nav" aria-label="Primary">
            {primaryNav.map((item) => (
              <NavLink key={item.to} to={item.to}>{item.label}</NavLink>
            ))}
          </nav>
          <div className="header-actions">
            {roleLink && <NavLink to={roleLink.to} className="btn btn--ghost btn--sm">{roleLink.label}</NavLink>}
            {signedIn
              ? <NavLink to="/dashboard" className="btn btn--ghost btn--sm">My dashboard</NavLink>
              : accountsOn && <NavLink to="/login" className="btn btn--ghost btn--sm">Log in</NavLink>}
            <ButtonLink to="/consultation/request" small className="header-cta">Start a consultation request</ButtonLink>
          </div>
          <button
            type="button"
            className="menu-btn"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
          </button>
        </div>
      </header>
      {/* Outside <header>: its backdrop-filter would otherwise become the containing block of this fixed panel. */}
      {open && (
        <nav id="mobile-nav" className="mobile-nav" aria-label="Mobile">
          {primaryNav.map((item) => (
            <NavLink key={item.to} to={item.to}>{item.label}</NavLink>
          ))}
          {roleLink && <NavLink to={roleLink.to}>{roleLink.label}</NavLink>}
          {signedIn ? <NavLink to="/dashboard">My dashboard</NavLink> : accountsOn && <NavLink to="/login">Log in</NavLink>}
          <ButtonLink to="/consultation/request">Start a consultation request</ButtonLink>
        </nav>
      )}
      {dock && (
        <div className="cta-dock">
          <ButtonLink to="/consultation/request">Start a consultation request</ButtonLink>
        </div>
      )}
    </>
  )
}
