import { consultationModes } from '../data/consultationModes'
import { featureStatus } from '../config/site'
import { ModeIcon } from './icons'
import { Rings } from './art'
import { Reveal, StatusBadge } from './ui'

const modeStatus = {
  chat: featureStatus.chatConsultation,
  voice: featureStatus.voiceConsultation,
  video: featureStatus.videoConsultation,
} as const

/** Three arch-topped panels, staggered vertically on wide screens. Each states its real status. */
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
              <StatusBadge status={modeStatus[m.id]} />
              <h3>{m.name}</h3>
              <p>{m.summary} {m.howItWorks}</p>
              <p className="pilot">{m.pilotNote}</p>
            </div>
          </article>
        </Reveal>
      ))}
    </div>
  )
}
