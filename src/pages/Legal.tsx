import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PageHero } from '../components/ui'
import { consultationInfo, contactChannels, operator, refundRule, siteConfig } from '../config/site'
import { usePageTitle } from '../hooks/usePageTitle'
import { accountsEnabled } from '../lib/auth/createAuthService'

/** Bump this when the wording changes. */
const UPDATED = '27 October 2026'

function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  usePageTitle(title)
  return (
    <>
      <PageHero eyebrow="Legal" title={title} />
      <section className="section section--tight">
        <div className="container container--narrow legal">
          <p>Last updated: {UPDATED}</p>
          {children}
        </div>
      </section>
    </>
  )
}

const Contact = () => (
  <>
    <a href={`mailto:${siteConfig.contactEmail}`}>{siteConfig.contactEmail}</a> or WhatsApp {contactChannels.whatsappDisplay}
  </>
)

export function Privacy() {
  const accounts = accountsEnabled()
  return (
    <LegalPage title="Privacy Policy">
      <h2>Who we are</h2>
      <p>
        {operator.business} is run by {operator.name} ({operator.role}), {operator.place}. You can reach us at <Contact />.
      </p>

      <h2>What we handle, and when</h2>
      <ul>
        <li><strong>Free Moolank insight:</strong> your date of birth is worked out in your browser only. It is not stored or sent to us.</li>
        <li><strong>How the website is used:</strong> we use an analytics tool, Microsoft Clarity, to see which pages are visited and where visitors tap or scroll, so we can improve the site. See “Cookies and tracking” below.</li>
        <li><strong>Preparing a consultation request:</strong> what you type stays in your browser until you choose to send it. When you send it to us on WhatsApp or by email, we receive what you send, together with your WhatsApp number or email address.</li>
        <li><strong>Messages to us:</strong> anything you write to us on WhatsApp or email, including through the “Get in touch” button. The button only opens your own app with a message ready; nothing is sent until you press send.</li>
        <li><strong>Payments:</strong> you pay in your own UPI app, outside this website. If you tell us the UPI reference, the name shown in your app and the date, we keep them to check the payment. Please never send us a UPI PIN, an OTP, a card number or a banking password.</li>
        {accounts && (
          <>
            <li><strong>Your account:</strong> if you create an account we store your name, email address and password (the password is held by our sign-in provider in a protected form and cannot be read by us), plus any phone number, date of birth or language you choose to add.</li>
            <li><strong>Requests sent online:</strong> the service and mode you chose, what you ask guidance on, any date of birth the service needs, the version of the consent you accepted, and the status of the request. Our team and the expert connected to your request can read it. Other customers cannot.</li>
            <li><strong>Activity records:</strong> we keep a record of changes to requests and payments so we can see what happened.</li>
          </>
        )}
      </ul>

      <h2>Why we use it</h2>
      <p>Only to answer you, connect the right expert, arrange and run your consultation, and check payments. We don’t sell your information and we don’t use it for advertising.</p>

      <h2>Who else is involved</h2>
      <p>
        When you contact us on WhatsApp or email, those services (Meta and Google) carry your message under their own privacy policies.
        This website is delivered by a hosting provider, which may keep ordinary technical logs of visits.
        Website usage is measured with Microsoft Clarity, run by Microsoft (see the Microsoft Privacy Statement).
        {accounts && ' Accounts, requests and payments records are stored with our database and sign-in provider (Supabase).'}
        {' '}Consultations are usually held on Google Meet.
      </p>

      <h2>Cookies and tracking</h2>
      <p>
        We don’t use advertising cookies. We do use Microsoft Clarity, a website analytics tool, which sets cookies (named _clck and _clsk) and records how visitors use the pages, such as clicks, scrolling and the pages viewed, so we can see what to improve.
        The date-of-birth field, the consultation request form and the contact form are hidden from it, so what you type there is not recorded.
        You can avoid Clarity by blocking cookies or turning on tracking protection in your browser, or by asking us at <Contact />.
        {accounts && ' If you log in, your browser also keeps a sign-in token so you stay logged in; it is removed when you log out.'}
      </p>

      <h2>How long we keep things</h2>
      <p>We keep your information only for as long as we need it to run the service and to keep proper records of payments. You can ask us at any time what we hold about you, or ask us to correct or delete it.</p>

      <h2>Your choices</h2>
      <p>
        To see, correct or delete your information, or to close your account, contact us at <Contact />. Some payment records may be kept in a form that no longer identifies you.
      </p>

      <h2>Changes</h2>
      <p>If this page changes, the date at the top changes too.</p>
    </LegalPage>
  )
}

export function Terms() {
  const accounts = accountsEnabled()
  return (
    <LegalPage title="Terms & Conditions">
      <h2>About the service</h2>
      <p>{siteConfig.brandName} provides personalised spiritual guidance through human experts (numerology, palmistry, gemstone guidance and color therapy), plus a free introductory insight. It is run by {operator.name}, {operator.place}.</p>

      <h2>No guaranteed outcomes; not professional advice</h2>
      <p>Guidance is based on traditional practices and is offered for reflection and exploration. We do not promise specific outcomes, and nothing provided is medical, psychological, legal or financial advice. Please seek qualified professionals for those matters. Decisions you make are yours.</p>

      <h2>Requests, experts and sessions</h2>
      <p>
        A request is not a confirmed booking. Our team reads every request, connects the right expert and agrees a time with you. {consultationInfo.line}{' '}
        Availability is not guaranteed, and sessions are scheduled rather than instant.
      </p>

      <h2>Prices and payment</h2>
      <p>
        Our team confirms the amount with you before you pay. You pay in your own UPI app, directly to our account; see <Link to="/payment">how payment works</Link>.
        A payment counts as received only once our team has checked it against our bank record.
      </p>

      <h2>Refunds</h2>
      <p>{refundRule.line} The full rule is in the <Link to="/refund-policy">Refund Policy</Link>.</p>

      <h2>Your responsibilities</h2>
      <p>Give accurate information, be respectful to our team and experts, and don’t misuse the service. Never share passwords, PINs, OTPs or banking details with us.{accounts && ' Keep your login details private.'}</p>

      <h2>Our responsibility</h2>
      <p>We will do our best to provide the service with care. To the extent the law allows, we are not responsible for decisions you take based on the guidance you receive.</p>

      <h2>Law</h2>
      <p>These terms are governed by the laws of India.</p>
    </LegalPage>
  )
}

export function Refund() {
  return (
    <LegalPage title="Refund Policy">
      <p>You pay with your own UPI app after our team confirms the amount with you. This website does not take payments itself.</p>
      <h2>Before an expert is confirmed</h2>
      <p>If you cancel before an expert has been confirmed for your consultation, {refundRule.beforeConfirmedPercent}% of the amount you paid is refunded.</p>
      <h2>After an expert is confirmed</h2>
      <p>Once an expert has been confirmed for your consultation, no refund is given.</p>
      <h2>How to ask</h2>
      <p>Contact us at <Contact /> and tell us the service you booked and the UPI reference of your payment. Once we have verified the cancellation, the refund is sent back by UPI to the account you paid from, and we will let you know when it has been sent.</p>
      <h2>If something goes wrong</h2>
      <p>If there is a problem with a confirmed session, please contact us and we will talk to you about it.</p>
    </LegalPage>
  )
}
