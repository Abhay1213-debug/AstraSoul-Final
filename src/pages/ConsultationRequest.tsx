import { BookingFlow } from '../components/BookingFlow'
import { PageHero } from '../components/ui'
import { usePageTitle } from '../hooks/usePageTitle'
import { schedule } from '../shared/booking'

const next = [
  { t: 'Tell us about you', d: 'Your details and what you would like guidance on.' },
  { t: 'Choose your consultation', d: 'One service, or a combination.' },
  { t: 'Pick a time', d: 'A 10-minute voice call, any evening from 5:30 to 8:30 pm.' },
  { t: 'Pay and you’re booked', d: `By UPI or card. Your ${schedule.sessionMinutes}-minute session is confirmed straight away.` },
]

export default function ConsultationRequest() {
  usePageTitle('Book a consultation')
  return (
    <>
      <PageHero
        crumbs={[{ to: '/', label: 'Home' }, { to: '/consultation', label: 'Consultation' }, { label: 'Book' }]}
        title={<>Book a <em>consultation</em></>}
        lede="Four short steps. Choose your time, pay, and your session is booked."
      />
      <section className="section section--tight">
        <div className="container container--wide request-layout">
          <aside className="request-aside" aria-labelledby="next-h">
            <h2 id="next-h">How it <em>works</em></h2>
            <ol>
              {next.map((n) => <li key={n.t}><span><strong>{n.t}</strong>{n.d}</span></li>)}
            </ol>
          </aside>
          <BookingFlow />
        </div>
      </section>
    </>
  )
}
