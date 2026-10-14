import type { ReactNode } from 'react'
import { Notice, PageHero } from '../components/ui'
import { siteConfig } from '../config/site'
import { usePageTitle } from '../hooks/usePageTitle'

const P = ({ children }: { children: ReactNode }) => <span className="placeholder">{children}</span>

function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  usePageTitle(title)
  return (
    <>
      <PageHero eyebrow="Legal" title={title} />
      <section className="section section--tight">
        <div className="container container--narrow legal">
          <Notice tone="danger">
            <p><strong>Template — not legal advice. Must be reviewed by a qualified professional before public launch.</strong> Highlighted <P>[bracketed text]</P> marks information the business must supply or confirm. Statements describe the site as it works today and must be updated as features (accounts, payments, reports) are added.</p>
          </Notice>
          {children}
        </div>
      </section>
    </>
  )
}

export function Privacy() {
  return (
    <LegalPage title="Privacy Policy">
      <p>Last updated: <P>[date]</P></p>
      <h2>Who we are</h2>
      <p>{siteConfig.brandName} (working name) is operated by <P>[legal entity name, registered address]</P>. Contact: <P>[privacy contact email]</P>.</p>
      <h2>What this website does with your information today</h2>
      <ul>
        <li><strong>Free Moolank insight:</strong> your date of birth is processed in your browser only. It is not stored or sent to us.</li>
        <li><strong>Consultation request form:</strong> details you type stay in your browser. They are not stored by this website. If you choose to email the summary to us, we receive it by email.</li>
        <li><strong>Contact form:</strong> opens your email app; we receive only what you send.</li>
        <li>This website does not currently create accounts, take payments, or accept file uploads.</li>
      </ul>
      <h2>Information we may handle as the service develops</h2>
      <p>Name, email, phone, date of birth, consultation details, palm photographs and consultation reports. We will collect only what a service needs and explain why. <P>[Legal bases, purposes and retention periods to be defined.]</P></p>
      <h2>Sharing</h2>
      <p><P>[List processors and providers once chosen — hosting, database, email, payments, AI provider.]</P> We do not sell personal information.</p>
      <h2>Security</h2>
      <p>Private information such as reports and photographs will be stored securely and shown only to the customer it belongs to and authorised staff. <P>[Describe actual measures once implemented.]</P></p>
      <h2>Your rights</h2>
      <p><P>[Access, correction, deletion and complaint rights under applicable law, including India’s Digital Personal Data Protection Act, 2023 — to be confirmed by counsel.]</P></p>
      <h2>Cookies and analytics</h2>
      <p>This website does not currently use analytics or advertising cookies. <P>[Update if this changes.]</P></p>
    </LegalPage>
  )
}

export function Terms() {
  return (
    <LegalPage title="Terms & Conditions">
      <p>Last updated: <P>[date]</P></p>
      <h2>About the service</h2>
      <p>{siteConfig.brandName} (working name) provides personalised spiritual guidance through human experts and some free introductory tools. Services are provided for reflection and exploration.</p>
      <h2>No guaranteed outcomes; not professional advice</h2>
      <p>Guidance is based on traditional practices. We do not promise specific outcomes, and nothing provided is medical, psychological, legal or financial advice. Please seek qualified professionals for those matters.</p>
      <h2>Experts and consultations</h2>
      <p>Detailed recommendations, including gemstone and palmistry conclusions and remedies, are given by human experts. During the pilot, assignment and scheduling are arranged manually and availability is not guaranteed. A consultation request is not a confirmed booking until confirmed by us.</p>
      <h2>Prices and payment</h2>
      <p>Prices: <P>[to be published]</P>. Payment methods and the payment provider: <P>[to be confirmed]</P>. A payment is considered received only once verified.</p>
      <h2>Your responsibilities</h2>
      <p>Provide accurate information and do not misuse the service. Do not share passwords or financial details in consultation requests.</p>
      <h2>Reports</h2>
      <p>Where a report is provided, it records the expert’s guidance for your personal use. <P>[Terms on reuse and sharing.]</P></p>
      <h2>Liability, governing law, disputes</h2>
      <p><P>[To be drafted by counsel.]</P></p>
    </LegalPage>
  )
}

export function Refund() {
  return (
    <LegalPage title="Refund Policy">
      <p>Last updated: <P>[date]</P></p>
      <p>No payments are taken through this website at present. This policy will apply once payments are introduced.</p>
      <h2>Before a consultation is confirmed</h2>
      <p><P>[Policy for requests cancelled before an expert and time are confirmed.]</P></p>
      <h2>After confirmation</h2>
      <p><P>[Cancellation and rescheduling windows; what happens if an expert is unavailable or a session cannot take place.]</P></p>
      <h2>After a consultation</h2>
      <p><P>[Conditions, if any, for refunds once guidance or a report has been delivered.]</P></p>
      <h2>How refunds are issued</h2>
      <p>A refund will be shown as a separate payment status. <P>[Refund method, timeline and how to request one.]</P></p>
    </LegalPage>
  )
}
