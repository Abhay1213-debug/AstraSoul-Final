import { Link } from 'react-router-dom'
import { ServiceArt } from '../components/art'
import { ConcernExplorer } from '../components/ConcernExplorer'
import { ButtonLink, PageHero, Reveal, SectionHead, TextLink } from '../components/ui'
import { services } from '../data/services'
import { usePageTitle } from '../hooks/usePageTitle'

export default function Services() {
  usePageTitle('Services')
  return (
    <>
      <PageHero eyebrow="Services" title={<>Four ways to find <em>personal</em> guidance</>} lede="Choose the service that best matches what you’re looking for. Each is delivered by a human expert, and each page explains what you’ll need to provide." />
      <section className="section" aria-label="All services">
        <div className="container">
          <div className="service-rows">
            {services.map((s, i) => (
              <Reveal key={s.slug}>
                <article className="service-row">
                  <div className={`arch theme-${s.slug}`}><ServiceArt slug={s.slug} /></div>
                  <div className="service-row__text">
                    <span className="num">0{i + 1}</span>
                    <h2>{s.name}</h2>
                    <p className="lede">{s.tagline}</p>
                    <p className="caption" style={{ marginBottom: 'var(--space-2)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>What we’ll ask you for</p>
                    <ul>
                      {s.whatYouNeed.slice(0, 2).map((n) => <li key={n}>{n}</li>)}
                    </ul>
                    <div className="cluster">
                      <ButtonLink to={`/services/${s.slug}`} variant="dark" arrow>About {s.name}</ButtonLink>
                      <Link className="link-arrow" to={`/consultation/request?service=${s.slug}`}>Request a consultation</Link>
                    </div>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      <section className="section section--paper" aria-labelledby="which-h">
        <div className="container">
          <SectionHead split eyebrow="Choosing" title={<span id="which-h">Which service fits my <em>concern?</em></span>} lede="Choose the description closest to what’s on your mind. Suggestions only — your expert can help you decide if another service would suit you better." />
          <ConcernExplorer />
          <p style={{ marginTop: 'var(--space-6)' }}><TextLink to="/how-it-works">How the process works</TextLink></p>
        </div>
      </section>
    </>
  )
}
