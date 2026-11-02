import { LogoLockup } from '../components/Logo'
import { ButtonLink, PageHero } from '../components/ui'
import { contactChannels, operator, proof, siteConfig } from '../config/site'
import { usePageTitle } from '../hooks/usePageTitle'

export default function About() {
  usePageTitle('About')
  return (
    <>
      <PageHero eyebrow="About" title={`About ${siteConfig.brandName}`} lede="Personal guidance from human experts, on a voice call." />
      <section className="section about-brand" aria-label={`${siteConfig.brandName} logo`}>
        <div className="container about-brand__inner">
          <LogoLockup tone="light" className="about-lockup" />
          <p className="about-proof"><strong>{proof.figure}</strong> {proof.short}</p>
        </div>
      </section>
      <section className="section">
        <div className="container container--narrow stack">
          <h2>What we do</h2>
          <p>{siteConfig.brandName} connects you with a human expert in numerology, palmistry, gemstone guidance or color therapy, on a voice call. Our team arranges each session with you personally. The free Moolank insight is a simple starting point, not a replacement for an expert.</p>
          <h2>Our experts</h2>
          <p>You don’t need to choose anyone. When you send a request, our team connects the right expert for your service and the way you’d like to consult. Our experts value their privacy, so we don’t publish their photos.</p>
          <h2>What we believe</h2>
          <ul>
            <li><strong>People, not software, give the guidance.</strong> Gemstone recommendations, palmistry conclusions and personalised remedies come from human experts.</li>
            <li><strong>Simple booking.</strong> You see the price, choose a time that suits you and pay in one go.</li>
            <li><strong>Your details are yours.</strong> We ask only for what a service needs, and explain why.</li>
          </ul>
          <h2>Who runs {siteConfig.brandName}</h2>
          <p>{siteConfig.brandName} is run by {operator.name}, {operator.role}, from {operator.place}. Every request is read and answered by our team. You can reach us on WhatsApp at {contactChannels.whatsappDisplay}{siteConfig.contactEmail ? <> or at <a href={`mailto:${siteConfig.contactEmail}`}>{siteConfig.contactEmail}</a></> : null}.</p>
          <div className="cluster"><ButtonLink to="/services" arrow>Explore services</ButtonLink><ButtonLink to="/contact" variant="ghost">Contact us</ButtonLink></div>
        </div>
      </section>
    </>
  )
}
