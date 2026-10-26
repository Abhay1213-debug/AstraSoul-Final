import { Link } from 'react-router-dom'
import { PaymentDetails } from '../components/PaymentDetails'
import { ButtonLink, Notice, PageHero, SectionHead } from '../components/ui'
import { consultationInfo, refundRule } from '../config/site'
import { usePageTitle } from '../hooks/usePageTitle'

/** A public page: how payment works and where to pay. It takes no payment and asks for no banking information. */
export default function Payment() {
  usePageTitle('How payment works')
  return (
    <>
      <PageHero eyebrow="Payment" title="How payment works" lede="You pay with your own UPI app, directly to our account. This website never takes a payment itself." />
      <section className="section">
        <div className="container container--narrow stack">
          <Notice tone="warn" role="status">
            <p><strong>Please pay only after our team has confirmed the amount with you.</strong> If you pay before we have agreed the details, please contact us first.</p>
          </Notice>
          <ol className="stack">
            <li>Send your consultation request. Our team replies and confirms the service, the mode and the amount.</li>
            <li>Pay that exact amount using the UPI ID or QR code below, in any UPI app.</li>
            <li>Send us the UPI reference (transaction ID), the name shown in your app and the date, on WhatsApp or email. We check it against our bank record.</li>
            <li>Our team connects the right expert to you and agrees a time. {consultationInfo.line}</li>
          </ol>
          <SectionHead title="Where to pay" />
          <PaymentDetails />
          <Notice tone="warn">
            <p><strong>Never share your UPI PIN, an OTP, a card number or any banking password</strong> with us, on this website or in a message. We only ever need the reference number, the name and the date.</p>
          </Notice>
          <h2 style={{ fontSize: 'var(--fs-h3)' }}>Refunds</h2>
          <p>{refundRule.line} See the full <Link to="/refund-policy">Refund Policy</Link>.</p>
          <div className="cluster">
            <ButtonLink to="/consultation/request" arrow>Start a consultation request</ButtonLink>
            <ButtonLink to="/contact" variant="ghost">Contact us</ButtonLink>
          </div>
        </div>
      </section>
    </>
  )
}
