import { ArrowRight } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { serviceBySlug } from '../data/services'
import type { ServiceSlug } from '../types/domain'
import { Rings, ServiceArt } from './art'

/**
 * "Which service might suit me?" Interactive but honest: it only suggests services that are
 * commonly used for a concern. It does not diagnose, and nothing is sent anywhere.
 */
const concerns: { q: string; services: ServiceSlug[]; why: string }[] = [
  { q: 'I want to understand my personality, patterns and decisions', services: ['numerology'], why: 'Numerology looks at the numbers connected to your date of birth and name, and gives you a structured way to reflect on your tendencies.' },
  { q: 'I’d like a reading based on my own hands', services: ['palmistry'], why: 'A palm reading begins with the lines and shape of your hands, so it suits people who prefer something drawn from their own palms.' },
  { q: 'I’m wondering which gemstone is traditionally associated with me', services: ['gemstone-guidance'], why: 'A human expert explains which stones are traditionally associated with your details, and why — before you consider buying anything.' },
  { q: 'I want more calm and intention in my surroundings and routine', services: ['color-therapy'], why: 'Colour therapy is a gentle, practical reflection on the colours in your space, clothing and day.' },
  { q: 'I’m facing a career or study decision and want another perspective', services: ['numerology', 'palmistry'], why: 'People often explore decisions like this through numerology or palmistry. Neither predicts outcomes; both offer a different lens to think with.' },
]

export function ConcernExplorer() {
  const [active, setActive] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)

  /** On narrow screens the answer sits below the list, so bring it into view after a choice. */
  const choose = (i: number) => {
    setActive(i)
    if (window.innerWidth < 900) {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      requestAnimationFrame(() => panelRef.current?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' }))
    }
  }
  const contact = active === concerns.length
  const current = concerns[active]

  return (
    <div className="explorer">
      <div className="explorer__list" role="group" aria-label="What’s on your mind?">
        {concerns.map((c, i) => (
          <button key={c.q} type="button" className="explorer__item" aria-pressed={active === i} onClick={() => choose(i)}>
            <span className="explorer__n" aria-hidden="true">0{i + 1}</span>
            <span className="explorer__q">{c.q}</span>
          </button>
        ))}
        <button type="button" className="explorer__item" aria-pressed={contact} onClick={() => choose(concerns.length)}>
          <span className="explorer__n" aria-hidden="true">06</span>
          <span className="explorer__q">My question doesn’t fit any of these</span>
        </button>
      </div>

      <div className="explorer__panel" aria-live="polite" ref={panelRef}>
        {contact ? (
          <div className="explorer__contact">
            <Rings className="explorer__rings" />
            <h3>Tell us what’s on your mind</h3>
            <p>If none of these fit, ask us. We’ll help you work out whether one of the four services might be a good place to start.</p>
            <Link className="btn btn--primary" to="/contact">Ask us <ArrowRight size={18} aria-hidden="true" /></Link>
          </div>
        ) : (
          <>
            <p className="explorer__why">{current.why}</p>
            <div className="explorer__results">
              {current.services.map((slug) => {
                const s = serviceBySlug(slug)!
                return (
                  <div key={slug} className={`suggest theme-${slug}`}>
                    <div className="suggest__art"><ServiceArt slug={slug} /></div>
                    <div className="suggest__body">
                      <h3>{s.name}</h3>
                      <p>{s.tagline}</p>
                      <div className="suggest__links">
                        <Link className="link-arrow" to={`/services/${slug}`}>About {s.name} <ArrowRight size={16} aria-hidden="true" /></Link>
                        <Link className="link-arrow" to={`/consultation/request?service=${slug}`}>Request a consultation <ArrowRight size={16} aria-hidden="true" /></Link>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="hint">Suggestions only — your expert can help you decide if another service would suit you better.</p>
          </>
        )}
      </div>
    </div>
  )
}
