import { Check } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { ServiceArt } from '../components/art'
import { ModeIcon } from '../components/icons'
import { ButtonLink, Notice, Reveal, SectionHead, TextLink } from '../components/ui'
import { useLivePrices } from '../hooks/useLivePrices'
import { consultationModes } from '../data/consultationModes'
import { serviceBySlug, services } from '../data/services'
import { usePageTitle } from '../hooks/usePageTitle'
import NotFound from './NotFound'

function List({ items }: { items: string[] }) {
  return (
    <ul className="checklist">
      {items.map((i) => (
        <li key={i}><Check size={18} aria-hidden="true" /><span>{i}</span></li>
      ))}
    </ul>
  )
}

export default function ServiceDetail() {
  const { slug = '' } = useParams()
  const service = serviceBySlug(slug)
  usePageTitle(service?.name)
  const priceText = useLivePrices()
  if (!service) return <NotFound />
  const others = services.filter((s) => s.slug !== service.slug)

  return (
    <>
      <section className={`service-hero theme-${service.slug}`}>
        <div className="container container--wide service-hero__inner">
          <div>
            <nav className="breadcrumb" aria-label="Breadcrumb">
              <Link to="/">Home</Link> / <Link to="/services">Services</Link> / <span aria-current="page">{service.name}</span>
            </nav>
            <span className="eyebrow">Service</span>
            <h1>{service.name}</h1>
            <p className="lede">{service.tagline}</p>
            <div className="cluster" style={{ marginTop: 'var(--space-5)' }}>
              <ButtonLink to={`/consultation/request?service=${service.slug}`} arrow>Request a {service.name.toLowerCase()} consultation</ButtonLink>
              {service.slug === 'numerology' && <ButtonLink to="/free-insight" variant="ghost">Try the free Moolank insight</ButtonLink>}
            </div>
            <dl className="glance">
              <div><dt>Date of birth</dt><dd>{service.dob === 'required' ? 'Needed' : service.dob === 'optional' ? 'Optional' : 'Not needed'}</dd></div>
              <div>{service.needsPalmPhotos
                ? <><dt>Palm photographs</dt><dd>Shared securely once confirmed</dd></>
                : <><dt>Delivered by</dt><dd>A human expert</dd></>}</div>
              <div><dt>Price</dt><dd>To be confirmed</dd></div>
            </dl>
          </div>
          <div className="arch"><ServiceArt slug={service.slug} /></div>
        </div>
      </section>

      <section className="section">
        <div className="container detail-grid">
          <Reveal className="sticky">
            <span className="eyebrow">What it is</span>
            <p className="lede" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: 'clamp(1.4rem, 1.1rem + 1.2vw, 2rem)', lineHeight: 1.3, letterSpacing: '-0.015em' }}>{service.whatItIs}</p>
          </Reveal>
          <div>
            <Reveal className="detail-block"><h2>Who it may suit</h2><List items={service.whoItSuits} /></Reveal>
            <Reveal className="detail-block"><h2>What we’ll ask you for</h2><List items={service.whatYouNeed} /></Reveal>
            <Reveal className="detail-block"><h2>What your expert does</h2><List items={service.whatTheExpertDoes} /></Reveal>
            <Reveal className="detail-block"><Notice tone="warn"><p><strong>Please note:</strong> {service.whatItIsNot}</p></Notice></Reveal>
          </div>
        </div>
      </section>

      <section className="section section--paper" aria-labelledby="modes-h">
        <div className="container">
          <SectionHead split eyebrow="Consultation modes & pricing" title={<span id="modes-h">Choose how to <em>consult</em></span>} lede="Prices are coming soon. Each consultation is about 20 minutes, arranged by our team. Nothing is charged on this website." />
          <div className="price-row grid grid--3">
            {consultationModes.map((m, i) => (
              <Reveal key={m.id} delay={i * 0.08}>
                <div className="price" style={{ height: '100%' }}>
                  <span className="card__icon"><ModeIcon icon={m.icon} /></span>
                  <h3>{m.name}</h3>
                  <p>{m.summary}</p>
                  <strong>{priceText(service.slug, m.id)}</strong>
                  <div className="card__foot">
                    <ButtonLink to={`/consultation/request?service=${service.slug}&mode=${m.id}`} variant="ghost" small>Choose {m.id}</ButtonLink>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
          <p style={{ marginTop: 'var(--space-6)' }}><TextLink to="/consultation">How consultations work during the pilot</TextLink></p>
        </div>
      </section>

      <nav className="ledge" aria-label="Other services">
        <ul>
          {others.map((s) => (
            <li key={s.slug}><Link to={`/services/${s.slug}`}>{s.name}</Link></li>
          ))}
        </ul>
      </nav>
    </>
  )
}
