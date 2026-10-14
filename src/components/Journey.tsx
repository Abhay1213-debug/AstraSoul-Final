import { useReveal } from '../hooks/useReveal'
import { Reveal } from './ui'

export interface JourneyStep { t: string; d: string }

/**
 * Process narrative. `row` = horizontal sequence (home); `path` = vertical path that alternates
 * sides on wide screens (How it works). The connecting line draws itself when scrolled into view.
 */
export function Journey({ steps, variant = 'row' }: { steps: JourneyStep[]; variant?: 'row' | 'path' }) {
  const ref = useReveal<HTMLOListElement>()
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
