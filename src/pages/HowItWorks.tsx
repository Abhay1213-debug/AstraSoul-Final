import { Link } from 'react-router-dom'
import { Journey } from '../components/Journey'
import { ButtonLink, PageHero, Reveal, SectionHead } from '../components/ui'
import { consultationInfo, refundRule } from '../config/site'
import { usePageTitle } from '../hooks/usePageTitle'

const journey = [
  { t: 'Understand the services', d: 'Read about numerology, palmistry, gemstone guidance and color therapy, and see which fits your question.' },
  { t: 'Choose a service and share the details it needs', d: 'Only what that service requires — for example your date of birth.' },
  { t: 'Try the free introductory insight', d: 'Optional. Find your Moolank — a simple starting point, not personalised advice.' },
  { t: 'Choose chat, voice or video', d: 'Tell us how you prefer to consult.' },
  { t: 'Review your request and send it', d: 'See exactly what you’re asking for, then send it to us on WhatsApp or by email. We confirm the price with you before you pay.' },
  { t: 'The right expert is connected to you', d: 'Our team chooses the expert for your service and mode and agrees a time with you.' },
  { t: 'Consult your expert', d: `Your expert provides the detailed guidance and recommendations. ${consultationInfo.line}` },
]

const good = [
  { q: 'Do I need an account?', a: 'No. You prepare your request on this website and send it to our team on WhatsApp or by email. We reply personally.' },
  { q: 'Who will I speak to?', a: 'You don’t need to choose anyone. Our team connects the right expert for your service and the way you want to consult.' },
  { q: 'How long is a session?', a: consultationInfo.line },
  { q: 'When and how do I pay?', a: 'After our team has confirmed the amount with you. You pay with your own UPI app, using the UPI ID or QR code on the payment page.' },
  { q: 'What if I need to cancel?', a: refundRule.line },
  { q: 'Is anything guaranteed?', a: 'Guidance is offered for reflection and exploration. It does not promise a particular outcome and is not medical, legal or financial advice.' },
]

export default function HowItWorks() {
  usePageTitle('How it works')
  return (
    <>
      <PageHero eyebrow="How it works" title="A calm, guided path to personal guidance" lede="From your first question to your session, step by step." />
      <section className="section" aria-labelledby="journey-h">
        <div className="container">
          <SectionHead title={<span id="journey-h">The journey</span>} />
          <Journey steps={journey} variant="path" />
        </div>
      </section>
      <section className="section section--paper" aria-labelledby="good-h">
        <div className="container">
          <SectionHead eyebrow="Good to know" title={<span id="good-h">Questions people ask</span>} />
          <div className="grid grid--2">
            {good.map((g, i) => (
              <Reveal key={g.q} delay={(i % 2) * 0.08}>
                <div className="card card--flat" style={{ height: '100%' }}>
                  <h3>{g.q}</h3>
                  <p>{g.a}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 'var(--space-5)' }}>See also: <Link to="/payment">how payment works</Link> · <Link to="/refund-policy">Refund Policy</Link> · <Link to="/contact">contact us</Link></p>
          <div className="cluster" style={{ marginTop: 'var(--space-6)' }}>
            <ButtonLink to="/consultation/request" arrow>Start a consultation request</ButtonLink>
            <ButtonLink to="/consultation" variant="ghost">Consultation options</ButtonLink>
          </div>
        </div>
      </section>
    </>
  )
}
