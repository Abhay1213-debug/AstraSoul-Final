import { Link } from 'react-router-dom'
import { siteConfig } from '../config/site'

/** Brand-neutral mark: an arched doorway with a rising sun. Contains no lettering, so any final name works. */
export function LogoMark() {
  return (
    <svg className="logo__mark" viewBox="0 0 40 44" aria-hidden="true">
      <path d="M5 42V19a15 15 0 0 1 30 0v23Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 42V20a10 10 0 0 1 20 0v22" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <circle cx="20" cy="26" r="5.2" fill="var(--logo-sun, #d7b56d)" />
      <path d="M3 42h34" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label={`${siteConfig.brandName} — home`}>
      <LogoMark />
      <span className="logo__text">
        <span className="logo__name">{siteConfig.brandName}</span>
        <span className="logo__tag">{siteConfig.tagline}</span>
      </span>
    </Link>
  )
}
