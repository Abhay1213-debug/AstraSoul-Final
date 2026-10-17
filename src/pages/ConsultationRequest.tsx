import { ConsultationRequestFlow } from '../components/ConsultationRequestFlow'
import { PageHero } from '../components/ui'
import { usePageTitle } from '../hooks/usePageTitle'

const next = [
  { t: 'You prepare your request', d: 'Four short steps on this page. Nothing is sent or stored by this website.' },
  { t: 'You send it to our team', d: 'The final step opens WhatsApp or your email app with your request ready to send.' },
  { t: 'We confirm the amount and the time', d: 'Our team replies, connects the right expert and agrees a time with you. Availability isn’t guaranteed, and there is no instant connection.' },
  { t: 'You pay by UPI', d: 'Once we have confirmed the amount, you pay with your own UPI app. The UPI ID and QR code are on the last step and on the payment page.' },
]

export default function ConsultationRequest() {
  usePageTitle('Start a consultation request')
  return (
    <>
      <PageHero
        crumbs={[{ to: '/', label: 'Home' }, { to: '/consultation', label: 'Consultation' }, { label: 'Request' }]}
        title={<>Start a consultation <em>request</em></>}
        lede="Four short steps. You’ll review everything before anything leaves your browser. You pay only after our team has confirmed the amount with you."
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
