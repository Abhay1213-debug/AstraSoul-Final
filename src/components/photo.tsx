/**
 * The supplied brand photograph, used as-is. The file in /public/images is the untouched original
 * (1504×632); every use below is only a CSS crop/feather of that one file.
 *
 *  - `hero`     right-hand hero image: the original cropped on its left edge only (object-position),
 *               which removes four faint decorative words that would collide with the headline and
 *               keeps the face, halo, moon and the "Same sky. A brighter you." line intact.
 *  - `portrait` tall crop around the face (used in the closing section).
 *  - `full`     the complete, uncropped image.
 */
export const HERO_SRC = `${import.meta.env.BASE_URL}images/hero-reference.webp`
export const HERO_ALT =
  'A woman in profile with her eyes closed and a gentle smile, her face lit by warm golden light and framed by a thin golden halo and fine celestial geometry, beside a crescent moon against a deep chocolate-brown sky. Text in the image reads: Same sky. A brighter you.'
export const HERO_SIZE = { width: 1504, height: 632 } as const

export function HeroPhoto({ variant, priority = false, className = '' }: { variant: 'hero' | 'portrait' | 'full'; priority?: boolean; className?: string }) {
  return (
    <img
      className={`photo photo--${variant} ${className}`}
      src={HERO_SRC}
      alt={HERO_ALT}
      width={HERO_SIZE.width}
      height={HERO_SIZE.height}
      decoding="async"
      {...(priority ? { fetchPriority: 'high' as const } : { loading: 'lazy' as const })}
    />
  )
}
