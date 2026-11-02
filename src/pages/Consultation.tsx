import { Link } from 'react-router-dom'
import { ButtonLink, PageHero, SectionHead } from '../components/ui'
import { Journey } from '../components/Journey'
import { PriceList } from '../components/PriceList'
import { VoiceOnly } from '../components/VoiceOnly'
import { consultationInfo, voiceOnly } from '../config/site'
import { usePageTitle } from '../hooks/usePageTitle'

const after = [
  { t: 'Choose your consultation', d: 'One service, or a combination of them.' },
  { t: 'Pick a time', d: 'Any free evening slot from 5:30 to 8:30 pm (IST) for your voice call.' },
  { t: 'Pay and you’re booked', d: 'Pay by UPI or card. Your time is confirmed straight away.' },
  { t: 'Consult your expert', d: consultationInfo.line },
]

export default function Consultation() {
  usePageTitle('Voice consultations')
  return (
    <>
      <PageHero eyebrow="Consultations" title="Voice consultations" lede={`${consultationInfo.line} The detailed guidance, remedies and conclusions always come from a human expert.`}>
        <div className="cluster" style={{ marginTop: 'var(--space-5)' }}>
          <ButtonLink to="/consultation/request" arrow>Start a consultation request</ButtonLink>
        </div>
      </PageHero>
      <section className="section" aria-labelledby="modes-h">
        <div className="container">
          <SectionHead split eyebrow="Why voice only" title={<span id="modes-h">Talk it through, <em>don’t type it out</em></span>} lede={voiceOnly.why} />
          <VoiceOnly />
        </div>
      </section>
      <section className="section section--paper" aria-labelledby="prices-h">
        <div className="container">
          <SectionHead split eyebrow="Prices" title={<span id="prices-h">One call, <em>clear prices</em></span>} lede="Choose one service or a package. Prices are before GST, which is added on the payment page." />
          <PriceList />
        </div>
      </section>
      <section className="section section--alt" aria-labelledby="after-h">
        <div className="container">
          <SectionHead eyebrow="What happens next" title={<span id="after-h">How booking works</span>} lede="It takes a few minutes." />
          <Journey steps={after} />
          <p className="hint" style={{ marginTop: 'var(--space-5)' }}>You pay online when you book. See <Link to="/payment">how payment works</Link>.</p>
        </div>
      </section>
    </>
  )
}
