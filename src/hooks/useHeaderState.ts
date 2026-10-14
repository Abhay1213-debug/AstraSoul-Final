import { useEffect, useState } from 'react'

/** True once the page has scrolled past a few pixels (used to solidify the transparent home header). */
export function useScrolled(threshold = 16): boolean {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    let raf = 0
    const update = () => { raf = 0; setScrolled(window.scrollY > threshold) }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [threshold])
  return scrolled
}
