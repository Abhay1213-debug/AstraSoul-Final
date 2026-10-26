import { HeroPhoto } from '../components/photo'
import { ButtonLink, PageHero } from '../components/ui'
import { contactChannels, operator, siteConfig } from '../config/site'
import { usePageTitle } from '../hooks/usePageTitle'

export default function About() {
  usePageTitle('About')
  return (
    <>
      <PageHero eyebrow="About" title={`About ${siteConfig.brandName}`} lede="Personalised spiritual guidance that connects you with human experts, by chat, voice or video." />
      <div className="photo-band"><HeroPhoto variant="full" /></div>
      <section className="section">
        <div className="container container--narrow stack">
          <h2>What we do</h2>
          <p>{siteConfig.brandName} helps you work out what you’re looking for, choose a relevant service — numerology, palmistry, gemstone guidance or color therapy — and consult a human expert by chat, voice or video. Our team connects the right expert to you and arranges the session with you personally.</p>
          <p>We also offer a simple free introductory tool: your Moolank. It is a starting point for reflection and does not replace a conversation with an expert.</p>
          <h2>What we believe</h2>
          <ul>
            <li><strong>People, not software, give the guidance.</strong> Gemstone recommendations, palmistry conclusions and personalised remedies come from human experts.</li>
            <li><strong>Clarity before you begin.</strong> We tell you what we need from you, how your session is arranged and what happens next.</li>
            <li><strong>Reflection, not promises.</strong> Nothing here guarantees a particular outcome, and it isn’t medical, legal or financial advice.</li>
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
