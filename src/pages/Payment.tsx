import { Link } from 'react-router-dom'
import { ButtonLink, PageHero, SectionHead } from '../components/ui'
import { consultationInfo, refundRule } from '../config/site'
import { usePageTitle } from '../hooks/usePageTitle'

/** A public page: how payment works. Payments are taken on Dodo Payments' checkout, never on this website itself. */
export default function Payment() {
  usePageTitle('How payment works')
  return (
    <>
      <PageHero eyebrow="Payment" title="How payment works" lede="You pay online when you book, by UPI or card. Your time is confirmed as soon as the payment goes through." />
      <section className="section">
        <div className="container container--narrow stack">
          <ol className="stack">
            <li>Choose your consultation and a free evening time on the booking page.</li>
            <li>Pay on the secure checkout of Dodo Payments, our payment partner, by UPI or card. GST is added to the price there.</li>
            <li>Your booking is confirmed straight away, and Dodo Payments emails you the receipt.</li>
            <li>Before your session, our team sends you the Google Meet link for your call on WhatsApp. {consultationInfo.line}</li>
          </ol>
          <SectionHead title="Good to know" />
          <p>The payment shows on your bank or UPI statement as <strong>DODOPAY ANKIRO</strong>.</p>
          <p>Card and UPI details are entered only on Dodo Payments’ checkout. We never see them, and we will never ask for your UPI PIN, an OTP, a card number or a password.</p>
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
