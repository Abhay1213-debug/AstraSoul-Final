import { BadgeCheck, Lock, Users } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useScrollScene } from '../../hooks/useScrollScene'

const words: { w: string; em?: boolean }[] = [
  { w: 'Guidance' }, { w: 'from' }, { w: 'people', em: true }, { w: 'explained' }, { w: 'with' }, { w: 'care.' },
]

const principles = [
  { icon: Users, t: 'People, not software', d: 'Every recommendation and remedy comes from a human expert. The website only works out your Moolank.' },
  { icon: BadgeCheck, t: 'Book in minutes', d: 'Pick an evening time that suits you, pay by UPI or card, and your session is confirmed.' },
  { icon: Lock, t: 'Private by default', d: 'We ask only for what a service needs. Your free insight never leaves your browser.' },
]

/**
 * Act 2, trust. The statement is lit word by word by the reader's own scroll (kinetic, not pinned), then three
 * plain promises arrive one after another. Ground: dusk.
 */
export function Approach() {
  const ref = useScrollScene<HTMLElement>({ mode: 'pass', from: 0.92, to: 0.05, rest: 1 })
  return (
    <section className="section section--plum approach" data-veil="0.75" ref={ref} aria-labelledby="human-h">
      <div className="container">
        <span className="eyebrow">Our approach</span>
        <h2 className="statement kw-line" id="human-h" aria-label="Guidance from people, explained with care.">
          {words.map((x, i) => (
            <span key={x.w} className="kw" style={{ '--i': i } as CSSProperties} aria-hidden="true">{x.em ? <em>{x.w}</em> : x.w}</span>
          ))}
        </h2>
        <ul className="principles">
          {principles.map((p, i) => (
            <li key={p.t} style={{ '--i': i } as CSSProperties}>
              <span className="pr-icon" aria-hidden="true"><p.icon size={22} /></span>
              <h3>{p.t}</h3>
              <p>{p.d}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
