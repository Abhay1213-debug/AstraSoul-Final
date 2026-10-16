import { Eye, Lock, MessageCircle, Phone, Video } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Rings } from '../components/art'
import { ConcernExplorer } from '../components/ConcernExplorer'
import { Journey } from '../components/Journey'
import { ModeCards } from '../components/ModeCards'
import { HeroPhoto } from '../components/photo'
import { MoolankCalculator } from '../components/MoolankCalculator'
import { ServiceCard } from '../components/ServiceCard'
import { ButtonLink, Notice, Reveal, SectionHead, StatusBadge, TextLink } from '../components/ui'
import { featureStatus, siteConfig } from '../config/site'
import { services } from '../data/services'
import { usePageTitle } from '../hooks/usePageTitle'

const journey = [
  { t: 'Choose what you need', d: 'Pick the service that fits your question — or read about each one first.' },
  { t: 'Share the details it needs', d: 'Only what the service requires, such as your date of birth.' },
  { t: 'Choose chat, voice or video', d: 'Tell us how you would like to consult. Times are agreed with you by the team.' },
  { t: 'Consult a human expert', d: 'Your expert provides the detailed guidance, remedies and conclusions.' },
]

const principles = [
  { t: 'People, not software', d: 'Gemstone recommendations, palmistry conclusions and personalised remedies come from human experts. Software only does one simple, introductory thing: your Moolank.' },
  { t: 'Honest about what’s real', d: 'We’re an early pilot. Every page says what is live, what is arranged by hand, and what is still being built.' },
  { t: 'Private by default', d: 'We ask only for what a service needs, and explain why. Your free insight is calculated in your browser, not sent to us.' },
]

const serviceColours: Record<string, string> = {
  numerology: 'var(--champagne)',
  palmistry: '#ebbfa6',
  'gemstone-guidance': 'var(--sage)',
  'color-therapy': 'var(--terracotta)',
}

export default function Home() {
  usePageTitle()
  return (
    <>
      <section className="hero">
        <div className="hero__media">
          <HeroPhoto variant="hero" priority />
        </div>
        <div className="container container--wide hero__inner">
          <div className="hero__copy">
            <span className="eyebrow hero__rise" style={{ '--i': 0 } as React.CSSProperties}>Personalized spiritual guidance</span>
            <h1>
              <span className="hero__rise" style={{ '--i': 1 } as React.CSSProperties}>Your questions.</span>
              <span className="hero__rise" style={{ '--i': 2 } as React.CSSProperties}><em>Deeper answers.</em></span>
              <span className="hero__rise" style={{ '--i': 3 } as React.CSSProperties}>A brighter you.</span>
            </h1>
            <p className="hero__lede hero__rise" style={{ '--i': 4 } as React.CSSProperties}>
              Numerology, palmistry, gemstone guidance and color therapy — with detailed guidance from human experts, by chat, voice or video.
            </p>
            <div className="cluster hero__rise" style={{ '--i': 5 } as React.CSSProperties}>
              <ButtonLink to="/consultation/request" arrow>Start a consultation request</ButtonLink>
              <ButtonLink to="/free-insight" variant="ghost">Try the free insight</ButtonLink>
            </div>
            <ul className="hero-chips hero__rise" style={{ '--i': 6 } as React.CSSProperties} aria-label="Consultation modes">
              <li><MessageCircle size={15} aria-hidden="true" /> Chat</li>
              <li><Phone size={15} aria-hidden="true" /> Voice</li>
              <li><Video size={15} aria-hidden="true" /> Video</li>
            </ul>
            <ul className="hero-points hero__rise" style={{ '--i': 7 } as React.CSSProperties}>
              <li><Eye size={18} aria-hidden="true" /> Detailed guidance from human experts</li>
              <li><Lock size={18} aria-hidden="true" /> Free insight is calculated in your browser</li>
            </ul>
          </div>
        </div>
      </section>

      <nav className="ledge" aria-label="Jump to a service">
        <ul>
          {services.map((s) => (
            <li key={s.slug}>
              <Link to={`/services/${s.slug}`}><span style={{ '--c': serviceColours[s.slug] } as React.CSSProperties} aria-hidden="true" />{s.name}</Link>
            </li>
          ))}
        </ul>
      </nav>

      <section className="section" aria-labelledby="services-h">
        <div className="container container--wide">
          <SectionHead
            split
            eyebrow="Our services"
            title={<span id="services-h">Guidance for every <em>chapter</em> of life</span>}
            lede="Four core services, each led by a human expert. Every page explains what it is, what we need from you, and what to expect."
          />
          <div className="bento">
            {services.map((s, i) => <ServiceCard key={s.slug} service={s} index={i} />)}
          </div>
          <p style={{ marginTop: 'var(--space-6)' }}><TextLink to="/services">Compare all services</TextLink></p>
        </div>
      </section>

      <section className="section section--plum" aria-labelledby="human-h">
        <div className="container">
          <Reveal>
            <span className="eyebrow">Our approach</span>
            <h2 className="statement" id="human-h">Guidance from <em>people</em>, explained with care.</h2>
          </Reveal>
          <ul className="principles">
            {principles.map((p, i) => (
              <Reveal as="li" key={p.t} delay={i * 0.1}>
                <span className="n" aria-hidden="true">0{i + 1}</span>
                <h3>{p.t}</h3>
                <p>{p.d}</p>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      <section className="section section--paper" aria-labelledby="concern-h">
        <div className="container">
          <SectionHead split eyebrow="Start with your question" title={<span id="concern-h">Not sure which service <em>fits?</em></span>} lede="Choose the description closest to what’s on your mind. These are suggestions to help you begin, not a diagnosis." />
          <ConcernExplorer />
        </div>
      </section>

      <section className="section section--dark moolank-section" aria-labelledby="insight-h">
        <Rings className="rings-bg" />
        <div className="container split split--wide-left">
          <div className="stack">
            <span className="eyebrow">Free introductory insight <StatusBadge status={featureStatus.moolankCalculator} /></span>
            <h2 id="insight-h">Discover your <em>Moolank</em></h2>
            <p className="lede">Your Moolank is your “root number”, taken from the day of the month you were born. Enter your date of birth to see yours and exactly how it was worked out.</p>
            <p style={{ color: '#dccdb4' }}>It is a traditional starting point for reflection — a small, free taste of numerology. A human expert goes much further.</p>
            <TextLink to="/free-insight">About the free insight</TextLink>
          </div>
          <MoolankCalculator />
        </div>
      </section>

      <section className="section" aria-labelledby="journey-h">
        <div className="container">
          <SectionHead eyebrow="How it works" title={<span id="journey-h">A simple, <em>honest</em> journey</span>} lede="We are an early pilot. Here is the path today — and the pages explain which parts are manual." />
          <Journey steps={journey} />
          <p style={{ marginTop: 'var(--space-7)' }}><TextLink to="/how-it-works">See what’s available today</TextLink></p>
        </div>
      </section>

      <section className="section section--plum" aria-labelledby="modes-h">
        <div className="container container--wide">
          <SectionHead split eyebrow="Consultation options" title={<span id="modes-h">Consult the way that <em>suits you</em></span>} lede="Three ways to speak with an expert. During the pilot, times are arranged manually with you — we don’t promise instant connection." />
          <ModeCards />
        </div>
      </section>

      <section className="section" aria-labelledby="cta-h">
        <div className="container container--wide">
          <Reveal>
            <div className="stage">
              <div className="stage__text">
                <span className="eyebrow">Begin</span>
                <h2 id="cta-h">Ready to ask <em>your question?</em></h2>
                <p className="lede">Prepare a consultation request in a few minutes and send it to us on WhatsApp or email. Nothing is charged until our team confirms the details with you.</p>
                <div className="cluster">
                  <ButtonLink to="/consultation/request" arrow>Start a consultation request</ButtonLink>
                  <ButtonLink to="/contact" variant="ghost">Ask us a question</ButtonLink>
                </div>
              </div>
              <div className="stage__photo"><HeroPhoto variant="portrait" /></div>
            </div>
          </Reveal>
          <div style={{ marginTop: 'var(--space-6)', maxWidth: 780, marginInline: 'auto' }}>
            <Notice><p><strong>Early pilot.</strong> {siteConfig.brandName} is a personal, hands-on service: our team replies to every request, connects the right expert to you and arranges the session with you. Online accounts are coming soon.</p></Notice>
          </div>
        </div>
      </section>
    </>
  )
}
