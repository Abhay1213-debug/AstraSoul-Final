import { Link } from 'react-router-dom'
import { ModeCards } from '../components/ModeCards'
import { ButtonLink, Notice, PageHero, SectionHead } from '../components/ui'
import { Journey } from '../components/Journey'
import { consultationInfo } from '../config/site'
import { usePageTitle } from '../hooks/usePageTitle'

const after = [
  { t: 'We reply personally', d: 'Our team reads your request and gets back to you on WhatsApp or by email.' },
  { t: 'We confirm the amount and the time', d: 'We connect the right expert and agree a time with you. You are told the price before you pay.' },
  { t: 'You pay by UPI', d: 'Once the amount is confirmed, you pay with your own UPI app and send us the reference.' },
  { t: 'You consult your expert', d: consultationInfo.line },
]

export default function Consultation() {
  usePageTitle('Consultation options')
  return (
    <>
      <PageHero eyebrow="Consultation options" title="Chat, voice or video" lede="Choose how you’d like to speak with an expert. The detailed guidance, remedies and conclusions always come from a human expert.">
        <div className="cluster" style={{ marginTop: 'var(--space-5)' }}>
          <ButtonLink to="/consultation/request" arrow>Start a consultation request</ButtonLink>
        </div>
      </PageHero>
      <section className="section" aria-labelledby="modes-h">
        <div className="container">
          <SectionHead title={<span id="modes-h">The three modes</span>} />
          <ModeCards />
          <div style={{ marginTop: 'var(--space-6)' }}>
            <Notice><p><strong>Sessions are scheduled.</strong> Experts are not on call. After you send a request, the team reviews it, chooses an expert and agrees a time with you.</p></Notice>
          </div>
        </div>
      </section>
      <section className="section section--alt" aria-labelledby="after-h">
        <div className="container">
          <SectionHead eyebrow="What happens next" title={<span id="after-h">After you send your request</span>} lede="Our team looks after every step personally." />
          <Journey steps={after} />
          <p className="hint" style={{ marginTop: 'var(--space-5)' }}>Payment is by UPI after the amount is confirmed. See <Link to="/payment">how payment works</Link>.</p>
        </div>
      </section>
    </>
  )
}
