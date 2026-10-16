import { ShieldCheck, Users, Video } from 'lucide-react'
import { ButtonLink, PageHero, Reveal, SectionHead } from '../components/ui'
import { consultationInfo } from '../config/site'
import { usePageTitle } from '../hooks/usePageTitle'

/**
 * No expert directory on purpose: experts are not listed in advance. The owner's team connects the right expert to each request.
 * (Real expert records live in the admin area only, so a request can be assigned to someone.)
 */
const points = [
  { icon: Users, t: 'We choose for you', d: 'You don’t need to browse or pick anyone. When you send a request, our team connects the right expert for your service and the way you want to consult.' },
  { icon: Video, t: 'A time agreed with you', d: `Our team agrees a time with you personally. ${consultationInfo.line}` },
  { icon: ShieldCheck, t: 'People, not software', d: 'Detailed guidance, remedies and conclusions always come from a human expert, never from the website.' },
]

export default function Experts() {
  usePageTitle('Experts')
  return (
    <>
      <PageHero eyebrow="Experts" title="The right expert, connected to you" lede="We don’t publish a list of experts in advance. Tell us what you’d like guidance on, and the right expert will be connected to you from our end." />
      <section className="section">
        <div className="container stack">
          <SectionHead title="How you’re matched" />
          <div className="grid grid--3">
            {points.map(({ icon: Icon, t, d }, i) => (
              <Reveal key={t} delay={i * 0.08}>
                <div className="card card--flat" style={{ height: '100%' }}>
                  <span className="card__icon"><Icon size={24} strokeWidth={1.6} aria-hidden="true" /></span>
                  <h3>{t}</h3>
                  <p>{d}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <div className="cluster">
            <ButtonLink to="/consultation/request" arrow>Start a consultation request</ButtonLink>
            <ButtonLink to="/contact" variant="ghost">Ask us a question</ButtonLink>
          </div>
        </div>
      </section>
    </>
  )
}
