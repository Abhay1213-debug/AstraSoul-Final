import { Journey } from '../components/Journey'
import { ButtonLink, PageHero, SectionHead, StatusBadge } from '../components/ui'
import { featureStatus, type FeatureStatus } from '../config/site'
import { usePageTitle } from '../hooks/usePageTitle'

const journey = [
  { t: 'Understand the services', d: 'Read about numerology, palmistry, gemstone guidance and color therapy, and see which fits your question.' },
  { t: 'Choose a service and share the details it needs', d: 'Only what that service requires — for example your date of birth.' },
  { t: 'Try a free introductory insight (optional)', d: 'Find your Moolank. It is a simple starting point, not personalised advice.' },
  { t: 'Choose chat, voice or video', d: 'Tell us how you prefer to consult.' },
  { t: 'Review your request and send it', d: 'See exactly what you’re asking for, then send it to us on WhatsApp or by email. Prices are coming soon.' },
  { t: 'The right expert is connected to you', d: 'Our team chooses the expert for your service and mode and agrees a time with you. Experts are not listed in advance, and nothing is automatic.' },
  { t: 'Consult your expert', d: 'Your expert provides the detailed guidance and recommendations. Each session is about 20 minutes, usually on Google Meet.' },
]

const availability: { feature: string; status: FeatureStatus; note: string }[] = [
  { feature: 'Service information & free Moolank insight', status: featureStatus.moolankCalculator, note: 'Works today, entirely in your browser.' },
  { feature: 'Consultation requests', status: featureStatus.consultationRequestForm, note: 'You prepare and review a request here, then send it to us on WhatsApp or by email. Our team replies personally.' },
  { feature: 'Voice & video consultations', status: featureStatus.videoConsultation, note: 'Arranged by our team, usually on Google Meet. Times are agreed with you; availability is not guaranteed.' },
  { feature: 'Chat consultation', status: featureStatus.chatConsultation, note: 'There is no live chat system yet. Our team arranges the conversation with you after reviewing your request.' },
  { feature: 'Expert matching', status: featureStatus.expertDirectory, note: 'The right expert is connected to you by our team. Experts are not listed in advance.' },
  { feature: 'Payments', status: featureStatus.payments, note: 'You pay with your own UPI app after our team confirms the amount with you. We check each payment by hand. Nothing is charged on this website.' },
  { feature: 'Accounts & dashboard', status: featureStatus.accounts, note: 'Coming soon.' },
]

export default function HowItWorks() {
  usePageTitle('How it works')
  return (
    <>
      <PageHero eyebrow="How it works" title="A calm, guided path to personal guidance" lede="From your first question to your session, and exactly which parts are available today." />
      <section className="section" aria-labelledby="journey-h">
        <div className="container">
          <SectionHead title={<span id="journey-h">The journey</span>} />
          <Journey steps={journey} variant="path" />
        </div>
      </section>
      <section className="section section--paper" aria-labelledby="avail-h">
        <div className="container">
          <SectionHead eyebrow="Transparency" title={<span id="avail-h">What’s available today</span>} lede="We’re an early pilot. Rather than imply everything is automated, here is the honest status of each part." />
          <div className="table-wrap">
            <table className="status-table">
              <caption className="sr-only">Availability of each feature</caption>
              <thead><tr><th scope="col">Feature</th><th scope="col">Status</th><th scope="col">Notes</th></tr></thead>
              <tbody>
                {availability.map((a) => (
                  <tr key={a.feature}><th scope="row" style={{ textTransform: 'none', letterSpacing: 0, fontSize: '0.95rem', color: 'var(--text)' }}>{a.feature}</th><td><StatusBadge status={a.status} /></td><td>{a.note}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="cluster" style={{ marginTop: 'var(--space-6)' }}>
            <ButtonLink to="/consultation/request" arrow>Start a consultation request</ButtonLink>
            <ButtonLink to="/consultation" variant="ghost">Consultation options</ButtonLink>
          </div>
        </div>
      </section>
    </>
  )
}
