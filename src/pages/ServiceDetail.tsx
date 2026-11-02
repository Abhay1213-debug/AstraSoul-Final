import { Check, Phone } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { ServiceArt } from '../components/art'
import { PackageRows } from '../components/PriceList'
import { ButtonLink, Reveal, SectionHead, TextLink } from '../components/ui'
import { consultationInfo, voiceOnly } from '../config/site'
import { serviceBySlug, services } from '../data/services'
import { usePageTitle } from '../hooks/usePageTitle'
import { PACKAGES, priceFor, withGst } from '../shared/booking'
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
  if (!service) return <NotFound />
  const price = priceFor([service.slug])
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
              <ButtonLink to={`/consultation/request?service=${service.slug}`} arrow>Book a {service.name.toLowerCase()} consultation</ButtonLink>
              {service.slug === 'numerology' && <ButtonLink to="/free-insight" variant="ghost">Try the free Moolank insight</ButtonLink>}
            </div>
            <dl className="glance">
              <div><dt>Date of birth</dt><dd>{service.dob === 'required' ? 'Needed' : service.dob === 'optional' ? 'Optional' : 'Not needed'}</dd></div>
              <div>{service.needsPalmPhotos
                ? <><dt>Palm photographs</dt><dd>Shared after you book</dd></>
                : <><dt>Session</dt><dd>{consultationInfo.minutes}-minute voice call</dd></>}</div>
              <div><dt>Price</dt><dd>{price ? withGst(price) : 'Coming soon'}</dd></div>
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
          </div>
        </div>
      </section>

      <section className="section section--paper" aria-labelledby="call-h">
        <div className="container">
          <SectionHead split eyebrow="Consultation & price" title={<span id="call-h">A <em>voice call</em> with your expert</span>} lede={consultationInfo.line} />
          <Reveal>
            <div className="price price--call">
              <span className="card__icon"><Phone size={24} strokeWidth={1.6} aria-hidden="true" /></span>
              <h3>{service.name} on a voice call</h3>
              <p>{voiceOnly.short}</p>
              <strong>{price ? withGst(price) : 'Price coming soon'}</strong>
              <div className="card__foot">
                <ButtonLink to={`/consultation/request?service=${service.slug}`} small>Book a voice call</ButtonLink>
              </div>
            </div>
          </Reveal>
          {PACKAGES.some((pk) => pk.services.includes(service.slug)) && (
            <div className="package-rows">
              <h3>Or in a package</h3>
              <PackageRows only={service.slug} />
            </div>
          )}
          <p style={{ marginTop: 'var(--space-6)' }}><TextLink to="/consultation">See all prices, and why we consult by voice only</TextLink></p>
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
