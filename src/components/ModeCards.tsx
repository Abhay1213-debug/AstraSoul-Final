import { consultationModes } from '../data/consultationModes'
import { ModeIcon } from './icons'
import { Rings } from './art'
import { Reveal } from './ui'

/** Three arch-topped panels, staggered vertically on wide screens. */
export function ModeCards() {
  return (
    <div className="mode-arches">
      {consultationModes.map((m, i) => (
        <Reveal key={m.id} delay={i * 0.1} className="mode-wrap">
          <article className={`mode-arch mode-arch--${m.id}`}>
            <div className="mode-arch__top" aria-hidden="true">
              <Rings className="mode-arch__rings" />
              <span className="mode-arch__icon"><ModeIcon icon={m.icon} size={30} /></span>
            </div>
            <div className="mode-arch__body">
              <h3>{m.name}</h3>
              <p>{m.summary} {m.howItWorks}</p>
              <p className="mode-note">{m.note}</p>
            </div>
          </article>
        </Reveal>
      ))}
    </div>
  )
}
