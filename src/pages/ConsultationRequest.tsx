import { ConsultationRequestFlow } from '../components/ConsultationRequestFlow'
import { PageHero } from '../components/ui'
import { usePageTitle } from '../hooks/usePageTitle'

const next = [
  { t: 'You prepare your request', d: 'Four short steps on this page. Nothing is sent or stored by this website.' },
  { t: 'You send it to our team', d: 'The final step gives you a summary to send by email, or to copy.' },
  { t: 'The team arranges a time', d: 'Experts are assigned and scheduled by people during the pilot. Availability isn’t guaranteed, and there is no instant connection.' },
  { t: 'No payment yet', d: 'No payment is taken at this stage, and prices have not been set.' },
]

export default function ConsultationRequest() {
  usePageTitle('Start a consultation request')
  return (
    <>
      <PageHero
        crumbs={[{ to: '/', label: 'Home' }, { to: '/consultation', label: 'Consultation' }, { label: 'Request' }]}
        title={<>Start a consultation <em>request</em></>}
        lede="Four short steps. You’ll review everything before anything leaves your browser — and nothing is charged."
      />
      <section className="section section--tight">
        <div className="container container--wide request-layout">
          <aside className="request-aside" aria-labelledby="next-h">
            <h2 id="next-h">What happens <em>next</em></h2>
            <ol>
              {next.map((n) => <li key={n.t}><span><strong>{n.t}</strong>{n.d}</span></li>)}
            </ol>
          </aside>
          <ConsultationRequestFlow />
        </div>
      </section>
    </>
  )
}
