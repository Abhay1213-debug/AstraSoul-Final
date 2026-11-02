import { Link } from 'react-router-dom'
import { Journey } from '../components/Journey'
import { ButtonLink, PageHero, Reveal, SectionHead } from '../components/ui'
import { consultationInfo, refundRule, voiceOnly } from '../config/site'
import { usePageTitle } from '../hooks/usePageTitle'
import { prices, withGst } from '../shared/booking'

const lowestPrice = Math.min(...Object.values(prices).filter((p): p is number => typeof p === 'number'))

const journey = [
  { t: 'Tell us about you', d: 'Your name, date of birth and what you would like guidance on.' },
  { t: 'Choose your consultation', d: 'Numerology, palmistry, gemstone guidance or color therapy, or a combination.' },
  { t: 'Pick a time', d: 'Any free evening slot from 5:30 to 8:30 pm (IST) for your voice call.' },
  { t: 'Pay, then consult', d: `Pay by UPI or card and your time is confirmed. ${consultationInfo.line}` },
]

const good = [
  { q: 'Do I need an account?', a: 'No. You book and pay on this website in a few minutes, without an account.' },
  { q: 'Who will I speak to?', a: 'You don’t need to choose anyone. Our team connects the right expert for your service.' },
  { q: 'How does the call work?', a: 'It is a voice call on Google Meet. Before your session we send you the link on WhatsApp. You can join from your phone or computer, and you don’t need to turn on a camera.' },
  { q: 'Why only voice calls, and no chat?', a: `${voiceOnly.why} ${voiceOnly.short}` },
  { q: 'How long is a session?', a: consultationInfo.line },
  { q: 'How much does it cost?', a: `One service starts at ${withGst(lowestPrice)}, and packages combine two or more services. Every price is on the Consultation page. If you would like a different combination, message us for a customised plan.` },
  { q: 'When and how do I pay?', a: 'When you book. You pay online by UPI or card through our payment partner, Dodo Payments, and your time is confirmed straight away.' },
  { q: 'What if I need to cancel?', a: refundRule.line },
  { q: 'Which service should I choose?', a: 'Read about each service first, or start with the free Moolank insight. If you are still unsure, write your question in your request and our team will guide you.' },
]

export default function HowItWorks() {
  usePageTitle('How it works')
  return (
    <>
      <PageHero eyebrow="How it works" title="From your question to your session" lede="Four simple steps. No account needed." />
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
            <ButtonLink to="/consultation" variant="ghost">Why voice calls</ButtonLink>
          </div>
        </div>
      </section>
    </>
  )
}
