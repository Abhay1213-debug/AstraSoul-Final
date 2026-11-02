import { Check, Hourglass, MessageCircle, Phone } from 'lucide-react'
import type { CSSProperties } from 'react'
import { consultationInfo } from '../config/site'
import { useScrollScene } from '../hooks/useScrollScene'
import { Rings } from './art'

const inChat = [
  'Typing back and forth uses up most of the session.',
  'Time often runs out before the real question is answered.',
  'Every follow-up waits for the next message.',
]
const onCall = [
  'You explain your situation in your own words.',
  'Your expert asks and answers on the spot.',
  `Your ${consultationInfo.minutes} minutes go to your question, not to typing.`,
]

/** Why Ankiro consults by voice only: the call itself, and how it compares with a chat consultation. */
export function VoiceOnly() {
  // The two panels rise one after the other as the section scrolls in.
  const ref = useScrollScene<HTMLDivElement>({ mode: 'pass', from: 0.98, to: 0.35, rest: 1 })
  return (
    <div className="voice-only" ref={ref}>
      <div className="mode-wrap" style={{ '--i': 0 } as CSSProperties}>
        <article className="mode-arch mode-arch--voice">
          <div className="mode-arch__top" aria-hidden="true">
            <Rings className="mode-arch__rings" />
            <span className="mode-arch__icon"><Phone size={30} strokeWidth={1.6} /></span>
          </div>
          <div className="mode-arch__body">
            <h3>Voice consultation</h3>
            <p>A {consultationInfo.minutes}-minute call with a human expert, at the time you book.</p>
            <p className="mode-note">Voice only, by choice. No chat, no waiting for replies.</p>
          </div>
        </article>
      </div>
      <div className="mode-wrap" style={{ '--i': 1 } as CSSProperties}>
        <div className="versus">
          <div className="versus__side versus__side--chat">
            <h3><MessageCircle size={20} aria-hidden="true" /> Chat consultations on other apps</h3>
            <ul>
              {inChat.map((t) => <li key={t}><Hourglass size={18} aria-hidden="true" />{t}</li>)}
            </ul>
          </div>
          <div className="versus__side versus__side--call">
            <h3><Phone size={20} aria-hidden="true" /> A voice call with Ankiro</h3>
            <ul>
              {onCall.map((t) => <li key={t}><Check size={18} aria-hidden="true" />{t}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
