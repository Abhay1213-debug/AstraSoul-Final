import { HeroPhoto } from '../components/photo'
import { ButtonLink, Notice, PageHero, SectionHead } from '../components/ui'
import { siteConfig } from '../config/site'
import { usePageTitle } from '../hooks/usePageTitle'

export default function About() {
  usePageTitle('About')
  return (
    <>
      <PageHero eyebrow="About" title={`About ${siteConfig.brandName}`} lede="A personalized spiritual guidance service that connects you with human experts — starting as a small pilot." />
      <div className="photo-band"><HeroPhoto variant="full" /></div>
      <section className="section">
        <div className="container container--narrow stack">
          <h2>What we’re building</h2>
          <p>{siteConfig.brandName} helps you work out what you’re looking for, choose a relevant service — numerology, palmistry, gemstone guidance or color therapy — and consult a human expert by chat, voice or video. After a consultation, the plan is for your expert’s guidance to be recorded in a personalised PDF report you can come back to.</p>
          <p>We also offer a simple free introductory tool: your Moolank. It is a starting point for reflection and does not replace a conversation with an expert.</p>
          <h2>What we believe</h2>
          <ul>
            <li><strong>People, not software, give the guidance.</strong> Gemstone recommendations, palmistry conclusions and personalised remedies come from human experts.</li>
            <li><strong>Honesty about what’s real.</strong> We tell you what’s live, what’s manual, and what’s still being built.</li>
            <li><strong>Reflection, not promises.</strong> Nothing here guarantees a particular outcome, and it isn’t medical, legal or financial advice.</li>
            <li><strong>Your details are yours.</strong> We ask only for what a service needs, and explain why.</li>
          </ul>
          <SectionHead title="Company details" />
          <Notice tone="warn"><p><span className="placeholder">Company history, team, registered business details and expert credentials will be added here once the business supplies them.</span> We have deliberately not invented any.</p></Notice>
          <div className="cluster"><ButtonLink to="/services" arrow>Explore services</ButtonLink><ButtonLink to="/contact" variant="ghost">Contact us</ButtonLink></div>
        </div>
      </section>
    </>
  )
}
