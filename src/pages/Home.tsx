import { ConcernExplorer } from '../components/ConcernExplorer'
import { Journey } from '../components/Journey'
import { Approach } from '../components/scene/Approach'
import { Daybreak } from '../components/scene/Daybreak'
import { HeroScene } from '../components/scene/HeroScene'
import { MoolankPeak } from '../components/scene/MoolankPeak'
import { ServicesRail } from '../components/scene/ServicesRail'
import { SectionHead, TextLink } from '../components/ui'
import { VoiceOnly } from '../components/VoiceOnly'
import { voiceOnly } from '../config/site'
import { usePageTitle } from '../hooks/usePageTitle'

const journey = [
  { t: 'Tell us about you', d: 'Your name, date of birth and what you would like guidance on.' },
  { t: 'Choose your consultation', d: 'One service, or a combination of them.' },
  { t: 'Pick a time and pay', d: 'A 10-minute voice call in a free evening slot. Pay by UPI or card and you are booked.' },
  { t: 'Consult a human expert', d: 'Your expert provides the detailed guidance, remedies and conclusions.' },
]

/**
 * Eight acts, each with its own ground and its own way of moving (see scrollcraft/builds/ankiro/BRIEF.md):
 * night sky (layered, pinned), dusk (words lit by scroll), range (sideways pan), daylight (interactive picker),
 * daylight (self-drawing journey), night (the Moolank wheel, the peak), dusk (voice only: the call and the comparison rise), daybreak (the ask).
 */
export default function Home() {
  usePageTitle()
  return (
    <div className="home-sky">
      <HeroScene />
      <Approach />
      <ServicesRail />

      <section className="section home-panel" data-veil="1" aria-labelledby="concern-h">
        <div className="container">
          <SectionHead split eyebrow="Start with your question" title={<span id="concern-h">Not sure which service <em>fits?</em></span>} lede="Pick the sentence closest to what’s on your mind. It’s a suggestion to help you begin, not a diagnosis." />
          <ConcernExplorer />
        </div>
      </section>

      <section className="section home-panel" data-veil="1" aria-labelledby="journey-h">
        <div className="container">
          <SectionHead title={<span id="journey-h">A simple, <em>clear</em> journey</span>} lede="From your first question to your session, here is how it works." />
          <Journey steps={journey} scrub />
          <p style={{ marginTop: 'var(--space-7)' }}><TextLink to="/how-it-works">See the full process</TextLink></p>
        </div>
      </section>

      <MoolankPeak />

      <section className="section section--plum modes" data-veil="0.85" aria-labelledby="modes-h">
        <div className="container container--wide">
          <SectionHead split eyebrow="Voice calls only" title={<span id="modes-h">Talk it through, <em>don’t type it out</em></span>} lede={voiceOnly.why} />
          <VoiceOnly />
        </div>
      </section>

      <Daybreak />
    </div>
  )
}
