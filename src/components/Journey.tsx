import type { CSSProperties } from 'react'
import { useReveal } from '../hooks/useReveal'
import { useScrollScene } from '../hooks/useScrollScene'
import { Reveal } from './ui'

export interface JourneyStep { t: string; d: string }

/**
 * Process narrative. `row` = horizontal sequence (home); `path` = vertical path that alternates
 * sides on wide screens (How it works). The connecting line draws itself when scrolled into view.
 */
export function Journey({ steps, variant = 'row', scrub = false }: { steps: JourneyStep[]; variant?: 'row' | 'path'; scrub?: boolean }) {
  const ref = useReveal<HTMLOListElement>()
  const scene = useScrollScene<HTMLOListElement>({ mode: 'pass', from: 0.9, to: 0.3, rest: 1 })
  if (scrub) {
    // The connecting line is drawn by the reader's own scroll, and each step lights as the line reaches it.
    return (
      <ol ref={scene} className={`journey journey--${variant} journey--scrub`}>
        {steps.map((s, i) => (
          <li key={s.t} className="journey__item" style={{ '--k': i / steps.length } as CSSProperties}>
            <span className="journey__num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
            <div className="journey__text">
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </div>
          </li>
        ))}
      </ol>
    )
  }
  return (
    <ol ref={ref} className={`journey journey--${variant}`}>
      {steps.map((s, i) => (
        <Reveal as="li" key={s.t} className="journey__item" delay={i * 0.09}>
          <span className="journey__num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
          <div className="journey__text">
            <h3>{s.t}</h3>
            <p>{s.d}</p>
          </div>
        </Reveal>
      ))}
    </ol>
  )
}
