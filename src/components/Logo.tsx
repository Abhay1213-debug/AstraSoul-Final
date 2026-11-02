import { Link } from 'react-router-dom'
import { siteConfig } from '../config/site'
const brand = `${import.meta.env.BASE_URL}brand/`

/**
 * The approved Ankiro mark (the hand holding the sun with "1", and the arc of gems), delivered at exact pixel sizes
 * for the header so the browser never has to shrink a large image: 1x, 2x and 3x.
 */
export function LogoMark() {
  return (
    <img
      className="logo__mark"
      src={`${brand}mark-56.png`}
      srcSet={`${brand}mark-56.png 1x, ${brand}mark-112.png 2x, ${brand}mark-168.png 3x`}
      alt=""
      width={56}
      height={56}
      decoding="async"
    />
  )
}

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label={`${siteConfig.brandName}, home`}>
      <LogoMark />
      <span className="logo__text">
        <span className="logo__name">{siteConfig.brandName}</span>
        <span className="logo__tag">{siteConfig.tagline}</span>
      </span>
    </Link>
  )
}

/** The full lockup (mark, wordmark and tagline) for the footer and the About page. */
export function LogoLockup({ tone, className }: { tone: 'dark' | 'light'; className?: string }) {
  return (
    <img
      className={className}
      src={`${import.meta.env.BASE_URL}brand/logo-${tone}.webp`}
      alt={`${siteConfig.brandName}: ${siteConfig.tagline}`}
      width={tone === 'dark' ? 420 : 520}
      height={tone === 'dark' ? 470 : 582}
      loading="lazy"
      decoding="async"
    />
  )
}
