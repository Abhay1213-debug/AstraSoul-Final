import { Link } from 'react-router-dom'
import { ModeCards } from '../components/ModeCards'
import { ButtonLink, Notice, PageHero, SectionHead } from '../components/ui'
import { bookingStatusInfo, paymentStatusInfo } from '../data/consultationModes'
import { usePageTitle } from '../hooks/usePageTitle'

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
            <Notice tone="warn"><p><strong>No instant connection.</strong> Experts are not on call. After you send a request, the team reviews it, chooses an expert and agrees a time with you. Availability isn’t guaranteed.</p></Notice>
          </div>
        </div>
      </section>
      <section className="section section--alt" aria-labelledby="status-h">
        <div className="container">
          <SectionHead eyebrow="Know where you stand" title={<span id="status-h">What each status means</span>} lede="Booking progress and payment are tracked separately, so one never hides the other." />
          <div className="grid grid--2">
            <div className="card card--flat">
              <h3>Request / booking status</h3>
              <dl style={{ margin: 0, display: 'grid', gap: 'var(--space-3)' }}>
                {Object.values(bookingStatusInfo).map((s) => (
                  <div key={s.label}><dt style={{ fontWeight: 700 }}>{s.label}</dt><dd style={{ margin: 0, color: 'var(--text-muted)' }}>{s.meaning}</dd></div>
                ))}
              </dl>
            </div>
            <div className="card card--flat">
              <h3>Payment status</h3>
              <dl style={{ margin: 0, display: 'grid', gap: 'var(--space-3)' }}>
                {Object.values(paymentStatusInfo).map((s) => (
                  <div key={s.label}><dt style={{ fontWeight: 700 }}>{s.label}</dt><dd style={{ margin: 0, color: 'var(--text-muted)' }}>{s.meaning}</dd></div>
                ))}
              </dl>
              <p className="hint" style={{ marginTop: 'var(--space-3)' }}>You pay with your own UPI app after our team confirms the amount. See <Link to="/payment">how payment works</Link>.</p>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
