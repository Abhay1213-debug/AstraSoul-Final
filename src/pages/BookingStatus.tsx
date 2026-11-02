import { CalendarPlus, CheckCircle2, MessageCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { PageHero } from '../components/ui'
import { usePageTitle } from '../hooks/usePageTitle'
import { browser, fetchBooking, retryCheckout, type BookingView } from '../lib/bookingApi'
import { refundRule } from '../config/site'
import { whatsappUrl } from '../lib/contact'
import { comboName, formatTime, sessionMinutesFor, sessionName, slotStart, withGst } from '../shared/booking'

const longDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

function calendarLink(b: BookingView) {
  const start = slotStart(b.date, b.time)
  const end = new Date(start.getTime() + sessionMinutesFor(b.services, b.extension) * 60_000)
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Ankiro consultation: ${comboName(b.services)}`,
    dates: `${stamp(start)}/${stamp(end)}`,
    details: `${sessionName} on Google Meet with an Ankiro expert (the link comes on WhatsApp). Booking reference ${b.reference}.`,
  })
  return `https://calendar.google.com/calendar/render?${q}`
}

/**
 * Where Dodo sends the customer back after paying. The server checks the payment with Dodo before saying "booked";
 * while a payment is still processing the page checks again for a little while.
 */
export default function BookingStatus() {
  usePageTitle('Your booking')
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  // Dodo's return details are read once and then cleared from the address bar, because Dodo also adds the email there
  const [{ paymentId, returned }] = useState(() => ({ paymentId: params.get('payment_id'), returned: params.get('status') }))
  useEffect(() => {
    if (window.location.search) window.history.replaceState(window.history.state, '', window.location.pathname)
  }, [])
  const [b, setB] = useState<BookingView | null | 'loading'>('loading')
  const [tries, setTries] = useState(0)
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetchBooking(id, paymentId).then((v) => { if (alive) setB(v) })
    return () => { alive = false }
  }, [id, paymentId, tries])

  // Dodo adds ?status= on the way back; anything but succeeded or processing means the customer did not pay
  const abandoned = Boolean(returned && !['succeeded', 'processing'].includes(returned))
  // a payment can take a few seconds to be confirmed: look again, up to about half a minute
  const pending = b !== 'loading' && b?.status === 'held' && !abandoned
  useEffect(() => {
    if (!pending || tries >= 10) return
    const t = window.setTimeout(() => setTries((n) => n + 1), 3000)
    return () => window.clearTimeout(t)
  }, [pending, tries])

  async function tryAgain() {
    setRetrying(true)
    setRetryError(null)
    const r = await retryCheckout(id)
    if (r.ok) { browser.go(r.url); return }
    setRetrying(false)
    setRetryError(r.error === 'slot_taken' ? 'That time is no longer free. Please choose another time.' : 'We could not open the payment page just now. Please try again in a moment.')
  }

  const view = b === 'loading' ? null : b
  const unpaid = view && (view.status === 'cancelled' || view.status === 'expired' || (view.status === 'held' && abandoned))
  const title = b === 'loading' ? 'Checking your booking' : !view ? 'Booking not found' : view.status === 'paid' ? 'You’re booked' : view.status === 'conflict' ? 'Payment received' : unpaid ? 'Payment not completed' : 'Confirming your payment'

  return (
    <>
      <PageHero eyebrow="Booking" title={title} />
      <section className="section section--tight">
        <div className="container container--narrow">
          <div className="panel stack booking-status" data-clarity-mask="True" aria-live="polite">
            {b === 'loading' && <p>Checking your payment…</p>}
            {b !== 'loading' && !view && (
              <>
                <p>We couldn’t find this booking. If you have paid, message us on WhatsApp with your payment receipt and we will sort it out straight away.</p>
                <div className="cluster"><Link className="btn btn--primary" to="/consultation/request">Book a consultation</Link></div>
              </>
            )}
            {view && (
              <>
                {view.status === 'paid' && (
                  <p className="booking-status__lead"><CheckCircle2 size={26} aria-hidden="true" /> Thank you, {view.firstName}. Your consultation is booked and paid.</p>
                )}
                {view.status === 'held' && !unpaid && (
                  <p className="booking-status__lead">{tries >= 10 ? 'Your payment is still being processed. Refresh this page in a minute; once it goes through it shows “booked” and Dodo Payments emails you a receipt.' : 'Confirming your payment with Dodo Payments…'}</p>
                )}
                {view.status === 'conflict' && (
                  <p className="booking-status__lead">Your payment went through, but that time was taken while the payment was processing. Our team will message you to pick another time, or refund you in full.</p>
                )}
                {unpaid && (
                  <p className="booking-status__lead">{view.status === 'held' ? 'The payment wasn’t completed, so nothing was charged. Your time is held for a few more minutes if you want to try again.' : 'The payment didn’t go through, so nothing was charged and the time was released. You can try again below.'}</p>
                )}
                <dl className="summary">
                  <div><dt>When</dt><dd>{longDate(view.date)}, {formatTime(view.time)} (IST)</dd></div>
                  <div><dt>Consultation</dt><dd>{comboName(view.services)}, {sessionMinutesFor(view.services, view.extension)} minutes</dd></div>
                  <div><dt>How</dt><dd>{sessionName}</dd></div>
                  <div><dt>Amount</dt><dd>{withGst(view.amount)}{view.test && <span className="hint"> (test mode, nothing charged)</span>}</dd></div>
                  <div><dt>Booking reference</dt><dd>{view.reference}</dd></div>
                </dl>
                {view.status === 'paid' && (
                  <>
                    <p>Before your session, our team will send you the Google Meet link for your call on WhatsApp. Dodo Payments emails your receipt. Need to cancel? {refundRule.short.replace('Cancel', 'Message us')}</p>
                    <div className="cluster">
                      <a className="btn btn--primary" href={calendarLink(view)} target="_blank" rel="noopener noreferrer"><CalendarPlus size={18} aria-hidden="true" /> Add to Google Calendar</a>
                      <a className="btn btn--ghost" href={whatsappUrl(`Hello Ankiro, I have booked a consultation. Booking reference ${view.reference}, ${longDate(view.date)} at ${formatTime(view.time)}.`)} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} aria-hidden="true" /> Message us on WhatsApp</a>
                    </div>
                  </>
                )}
                {unpaid && (
                  <div className="cluster">
                    <button type="button" className="btn btn--primary" onClick={tryAgain} disabled={retrying}>{retrying ? 'Opening payment…' : 'Try the payment again'}</button>
                    <Link className="btn btn--ghost" to="/consultation/request">Choose another time</Link>
                  </div>
                )}
                {retryError && <p className="field-error" role="alert"><span>{retryError}</span></p>}
              </>
            )}
          </div>
        </div>
      </section>
    </>
  )
}
