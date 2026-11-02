import { ButtonLink } from '../ui'
import { useScrollScene } from '../../hooks/useScrollScene'
import { HERO_ALT, HERO_FIGURE_SIZE, HERO_FIGURE_SRC, HERO_SKY_SIZE, HERO_SKY_SRC } from '../photo'

/**
 * Act 8, the close. The same arched window as the hero, now in daylight: the sun finishes rising behind it as
 * the visitor arrives, then everything holds still around one ask. Ground: daylight, the only fully light finish.
 */
export function Daybreak() {
  const ref = useScrollScene<HTMLElement>({ mode: 'pass', from: 1, to: 0.12, rest: 1 })
  return (
    <section className="daybreak" data-veil="0.8" ref={ref} aria-labelledby="cta-h">
      <div className="container container--wide daybreak-inner">
        <div className="daybreak-copy">
          <span className="eyebrow">Begin</span>
          <h2 id="cta-h">Ready to ask <em>your question?</em></h2>
          <p className="lede">Choose your consultation and an evening time, pay by UPI or card, and your session is booked. It takes a few minutes.</p>
          <div className="cluster">
            <ButtonLink to="/consultation/request" arrow>Start a consultation request</ButtonLink>
            <ButtonLink to="/contact" variant="ghost">Ask us a question</ButtonLink>
          </div>
        </div>
        <div className="daybreak-sky">
          <div className="db-sun" aria-hidden="true" />
          <svg className="db-rings" viewBox="0 0 800 800" aria-hidden="true" fill="none" focusable="false">
            {[190, 270, 350].map((r, i) => <circle key={r} cx="400" cy="400" r={r} strokeDasharray={i === 1 ? '2 10' : undefined} opacity={0.55 - i * 0.12} />)}
          </svg>
          <div className="db-arch">
            <img className="db-sky" src={HERO_SKY_SRC} alt="" aria-hidden="true" width={HERO_SKY_SIZE.width} height={HERO_SKY_SIZE.height} loading="lazy" decoding="async" />
            <i className="db-bloom" aria-hidden="true" />
            <img className="db-figure" src={HERO_FIGURE_SRC} alt={HERO_ALT} width={HERO_FIGURE_SIZE.width} height={HERO_FIGURE_SIZE.height} loading="lazy" decoding="async" />
          </div>
        </div>
      </div>
    </section>
  )
}
