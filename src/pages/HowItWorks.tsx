import { Journey } from '../components/Journey'
import { ButtonLink, PageHero, SectionHead, StatusBadge } from '../components/ui'
import { featureStatus, type FeatureStatus } from '../config/site'
import { usePageTitle } from '../hooks/usePageTitle'

const journey = [
  { t: 'Understand the services', d: 'Read about numerology, palmistry, gemstone guidance and color therapy, and see which fits your question.' },
  { t: 'Choose a service and share the details it needs', d: 'Only what that service requires — for example your date of birth.' },
  { t: 'Try a free introductory insight (optional)', d: 'Find your Moolank. It is a simple starting point, not personalised advice.' },
  { t: 'Choose chat, voice or video', d: 'Tell us how you prefer to consult.' },
  { t: 'Review your request', d: 'See exactly what you’re asking for, and the price once prices are set.' },
  { t: 'The team arranges your expert', d: 'During the pilot, expert assignment and scheduling are done by people, not automatically.' },
  { t: 'Consult your expert', d: 'Your expert provides the detailed guidance and recommendations.' },
  { t: 'Receive your report', d: 'The plan is a personalised PDF recording your expert’s guidance, available from your account.' },
]

const availability: { feature: string; status: FeatureStatus; note: string }[] = [
  { feature: 'Service information & free Moolank insight', status: featureStatus.moolankCalculator, note: 'Works today, entirely in your browser.' },
  { feature: 'Consultation request preparation', status: featureStatus.consultationRequestForm, note: 'You can fill in and review a request. It is not stored or sent by this website — you send the summary by email yourself.' },
  { feature: 'Voice & video consultations', status: featureStatus.videoConsultation, note: 'Coordinated manually (for example via Google Meet). Times are agreed with you; availability is not guaranteed.' },
  { feature: 'Chat consultation', status: featureStatus.chatConsultation, note: 'No live chat system yet. The team will arrange the conversation after reviewing your request.' },
  { feature: 'Expert directory', status: featureStatus.expertDirectory, note: 'Profiles shown are demonstrations, not real experts.' },
  { feature: 'Online booking submission', status: featureStatus.onlineBookingSubmission, note: 'Planned. Needs a backend.' },
  { feature: 'Payments', status: featureStatus.payments, note: 'Planned. The payment provider has not been chosen; nothing is charged.' },
  { feature: 'Accounts & dashboard', status: featureStatus.accounts, note: 'Planned. Needs secure authentication and a database.' },
  { feature: 'PDF guidance reports', status: featureStatus.pdfReports, note: 'Planned. Reports will contain only your expert’s approved guidance.' },
]

export default function HowItWorks() {
  usePageTitle('How it works')
  return (
    <>
      <PageHero eyebrow="How it works" title="A calm, guided path to personal guidance" lede="This is the full journey we are building towards — and, below it, exactly which parts work today." />
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
