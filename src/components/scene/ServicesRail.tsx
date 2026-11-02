import { useEffect, useRef } from 'react'
import { services } from '../../data/services'
import { useCanPin, useScrollScene } from '../../hooks/useScrollScene'
import { ServiceCard } from '../ServiceCard'
import { SectionHead, TextLink } from '../ui'

/**
 * Act 3, range. Vertical scroll becomes sideways travel: the four services pass by like four doors. The section is
 * as tall as the distance the track has to travel, so the pan is exactly as long as it needs to be. On phones and
 * with reduced motion it is an ordinary swipeable row.
 */
export function ServicesRail() {
  const pin = useCanPin()
  const scene = useScrollScene<HTMLElement>({ mode: pin ? 'pin' : 'pass' })
  const track = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scene.current
    const tr = track.current
    if (!el || !tr) return
    const measure = () => el.style.setProperty('--dist', pin ? `${Math.max(0, tr.scrollWidth - window.innerWidth)}px` : '0px')
    measure()
    const ro = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure)
    ro?.observe(tr)
    window.addEventListener('resize', measure)
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure) }
  }, [pin, scene])

  return (
    <section className={`rail${pin ? ' rail--pinned' : ''}`} data-veil="0.85" ref={scene} aria-labelledby="services-h">
      <div className="rail-stage">
        <div className="rail-track" ref={track}>
          <div className="rail-intro">
            <SectionHead
              eyebrow="Our services"
              title={<span id="services-h">Guidance for every <em>chapter</em> of life</span>}
              lede="Four services, each led by a human expert."
            />
            <p><TextLink to="/services">Compare all services</TextLink></p>
          </div>
          {services.map((s, i) => <ServiceCard key={s.slug} service={s} index={i} rail />)}
          <span className="rail-end" aria-hidden="true" />
        </div>
        <div className="rail-bar" aria-hidden="true"><i /></div>
      </div>
    </section>
  )
}
