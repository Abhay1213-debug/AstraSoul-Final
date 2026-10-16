import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { formatDate, formatDateTime, formatMoney, modeLabel, serviceLabel, todayIso } from '../lib/format'
import {
  dataErrorMessage, paymentStatusLabel, paymentStatusMeaning, statusLabel,
  type DataErrorCode, type DataService, type PaymentInfo, type PaymentSettings, type RequestInfo,
} from '../lib/data'
import { paymentConfig, refundRule } from '../config/site'
import { Field } from './forms'
import { PaymentDetails } from './PaymentDetails'
import { Notice } from './ui'

/** Status chips reuse the site's existing badge colours: green = good, amber = in progress, red = stopped, grey = neutral. */
const requestTone: Record<string, string> = {
  submitted: 'manual', awaiting_confirmation: 'manual', confirmed: 'live', completed: 'live', cancelled: 'demo',
}
const paymentTone: Record<string, string> = { pending: 'manual', succeeded: 'live', failed: 'demo', refunded: 'planned' }

export const RequestStatusBadge = ({ status }: { status: string }) => (
  <span className={`badge badge--${requestTone[status] ?? 'planned'}`}>{statusLabel[status] ?? status}</span>
)
export const PaymentStatusBadge = ({ status }: { status: string }) => (
  <span className={`badge badge--${paymentTone[status] ?? 'planned'}`}>{paymentStatusLabel[status] ?? status}</span>
)

/** What the customer sees about payment for one request, in one line. */
export function paymentHeadline(r: RequestInfo): string {
  const latest = r.payments[0]
  if (!latest) return r.status === 'cancelled' ? 'No payment' : 'No payment reference yet'
  return paymentStatusLabel[latest.status] ?? latest.status
}

export function PaymentList({ payments, showAmounts = true }: { payments: PaymentInfo[]; showAmounts?: boolean }) {
  if (payments.length === 0) return null
  return (
    <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }} aria-label="Payment references">
      {payments.map((p) => (
        <li key={p.id} className="card card--flat">
          <div className="cluster" style={{ justifyContent: 'space-between' }}>
            <PaymentStatusBadge status={p.status} />
            <span className="hint">Submitted {formatDateTime(p.submittedAt)}</span>
          </div>
          <p style={{ margin: 0 }}>{paymentStatusMeaning[p.status]}</p>
          <dl className="summary">
            <div><dt>UPI reference</dt><dd>{p.upiReference}</dd></div>
            <div><dt>Name on payment</dt><dd>{p.payerName}</dd></div>
            <div><dt>Date paid</dt><dd>{formatDate(p.paidOn)}</dd></div>
            {showAmounts && <div><dt>Expected amount</dt><dd>{formatMoney(p.amountMinor)}</dd></div>}
            {p.receivedAmountMinor !== null && <div><dt>Amount received</dt><dd>{formatMoney(p.receivedAmountMinor)}</dd></div>}
          </dl>
        </li>
      ))}
    </ul>
  )
}

/**
 * The customer's manual-UPI step. The website never takes a payment and never marks anything as paid: the customer pays in their own
 * UPI app and tells us the reference; the team checks the bank record and verifies it.
 */
export function PaymentPanel({
  request, settings, priceMinor, service, onChanged,
}: { request: RequestInfo; settings: PaymentSettings; priceMinor: number | null; service: DataService; onChanged: () => void }) {
  const [reference, setReference] = useState('')
  const [payer, setPayer] = useState('')
  const [paidOn, setPaidOn] = useState('')
  const [errors, setErrors] = useState<{ reference?: string; payer?: string; paidOn?: string }>({})
  const [failure, setFailure] = useState<DataErrorCode | null>(null)
  const [pending, setPending] = useState(false)

  const open = ['submitted', 'awaiting_confirmation', 'confirmed'].includes(request.status)
  const hasPending = request.payments.some((p) => p.status === 'pending')
  const hasPaid = request.payments.some((p) => p.status === 'succeeded')
  const upiId = settings.upiId.trim() || paymentConfig.upiId
  const payeeName = settings.payeeName.trim() || paymentConfig.payeeName
  const configured = upiId !== ''

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pending) return
    const found: typeof errors = {}
    const ref = reference.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (!/^[A-Z0-9]{8,35}$/.test(ref)) found.reference = 'Please enter the transaction / UPI reference from your payment app (8–35 letters and numbers).'
    const name = payer.trim()
    if (name.length < 2 || name.length > 80) found.payer = 'Please enter the name shown in your payment app.'
    else if (/[0-9]{4,}/.test(name)) found.payer = 'That looks like a number, not a name. Never enter a PIN, OTP or card number anywhere on this site.'
    if (!paidOn) found.paidOn = 'Please choose the date you paid.'
    else if (paidOn > todayIso()) found.paidOn = 'The date can’t be in the future.'
    setErrors(found)
    setFailure(null)
    if (Object.keys(found).length > 0) return

    setPending(true)
    const result = await service.submitPaymentReference({ requestId: request.id, upiReference: ref, payerName: name, paidOn })
    setPending(false)
    if (!result.ok) {
      setFailure(result.code)
      return
    }
    setReference(''); setPayer(''); setPaidOn('')
    onChanged()
  }

  return (
    <section className="stack" aria-labelledby="payment-heading">
      <h2 id="payment-heading" style={{ fontSize: 'var(--fs-h3)' }}>Payment</h2>
      <PaymentList payments={request.payments} />
      {!open && request.payments.length === 0 && <p>This request is {request.status === 'completed' ? 'complete' : 'closed'}, so no payment is needed.</p>}
      {open && hasPaid && <Notice tone="success" role="status"><p>Your payment has been verified. Thank you.</p></Notice>}
      {open && hasPending && (
        <Notice role="status"><p>We have your payment reference and our team will check it. You don’t need to do anything else for now.</p></Notice>
      )}
      {open && !hasPaid && !hasPending && (
        <>
          {priceMinor === null ? (
            <Notice tone="warn" role="status">
              <p><strong>The price for this consultation is coming soon.</strong> You can’t submit a payment reference until it is set. We’ll update this page, and there is nothing you need to pay yet.</p>
            </Notice>
          ) : !configured ? (
            <Notice tone="warn" role="status">
              <p><strong>Payment instructions are being finalised.</strong> The amount for this consultation is {formatMoney(priceMinor)}. Please check back soon: we haven’t shared payment details yet, so please don’t pay anyone for this request.</p>
            </Notice>
          ) : (
            <>
              <div className="card card--flat">
                <h3 style={{ fontSize: '1.2rem' }}>How to pay</h3>
                <ol>
                  <li>Open your own UPI app and pay exactly <strong>{formatMoney(priceMinor)}</strong> to the UPI ID below.</li>
                  <li>Copy the transaction (reference) number from the app.</li>
                  <li>Enter it below with the name and date. We then check it against our bank record.</li>
                </ol>
                <dl className="summary">
                  <div><dt>Amount</dt><dd>{formatMoney(priceMinor)}</dd></div>
                </dl>
                <PaymentDetails upiId={upiId} payeeName={payeeName} />
                <p className="hint">Refunds: {refundRule.line}</p>
                {settings.instructions && <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{settings.instructions}</p>}
              </div>
              <Notice tone="warn">
                <p><strong>Never share your UPI PIN, an OTP, a card number or any banking password</strong> with us, on this site or in a message. We only ever need the reference number, the name and the date.</p>
              </Notice>
              <form onSubmit={submit} noValidate className="form" aria-label="Submit your payment reference">
                {failure && <Notice tone="danger" role="alert"><p>{dataErrorMessage[failure]}</p></Notice>}
                <Field label="UPI transaction reference" error={errors.reference} hint="From your payment app, e.g. “UPI Ref No.” or “Transaction ID”.">
                  {(a) => <input id={a.id} className="input" value={reference} maxLength={60} autoComplete="off" aria-describedby={a.describedBy} aria-invalid={a.invalid} onChange={(e) => { setReference(e.target.value); setErrors((x) => ({ ...x, reference: undefined })) }} />}
                </Field>
                <Field label="Name shown in your payment app" error={errors.payer}>
                  {(a) => <input id={a.id} className="input" value={payer} maxLength={80} autoComplete="off" aria-describedby={a.describedBy} aria-invalid={a.invalid} onChange={(e) => { setPayer(e.target.value); setErrors((x) => ({ ...x, payer: undefined })) }} />}
                </Field>
                <Field label="Date you paid" error={errors.paidOn}>
                  {(a) => <input id={a.id} className="input" type="date" min="2020-01-01" max={todayIso()} value={paidOn} aria-describedby={a.describedBy} aria-invalid={a.invalid} onChange={(e) => { setPaidOn(e.target.value); setErrors((x) => ({ ...x, paidOn: undefined })) }} />}
                </Field>
                <button type="submit" className="btn btn--primary" disabled={pending}>{pending ? 'Sending…' : 'Submit payment reference'}</button>
                <p className="hint">Submitting a reference does not mark you as paid. Our team verifies it first.</p>
              </form>
            </>
          )}
          {request.payments.some((p) => p.status === 'failed') && !hasPending && (
            <p className="hint">If a reference could not be verified, check it for typing mistakes and submit it again.</p>
          )}
        </>
      )}
    </section>
  )
}

/** The one-line "what happens next" for the customer. */
export function nextStep(r: RequestInfo): string {
  if (r.status === 'cancelled' || r.status === 'completed') return 'You’re welcome to send a new request whenever you like.'
  if (r.status === 'confirmed') return 'Please be ready at the time shown below.'
  if (r.payments.some((p) => p.status === 'succeeded')) return 'Payment is verified. Our team is arranging your expert and time.'
  if (r.payments.some((p) => p.status === 'pending')) return 'Our team is checking your payment reference.'
  return 'Submit your payment reference so our team can start.'
}

export function RequestRow({ r }: { r: RequestInfo }) {
  return (
    <li className="card card--flat">
      <div className="cluster" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ fontSize: '1.25rem', margin: 0 }}>{serviceLabel(r.serviceSlug)} · {modeLabel(r.mode)}</h3>
        <RequestStatusBadge status={r.status} />
      </div>
      <p className="hint" style={{ margin: 0 }}>Requested {formatDate(r.createdAt)} · Payment: {paymentHeadline(r)}</p>
      <p style={{ margin: 0 }}>{nextStep(r)}</p>
      <div className="card__foot"><Link className="link-arrow" to={`/dashboard/requests/${r.id}`}>Open request</Link></div>
    </li>
  )
}

/** Plain-language "things that need you / good news" derived from the requests. This is the in-app notification experience (no email is sent). */
export function dashboardUpdates(requests: RequestInfo[]): Array<{ key: string; tone: 'info' | 'warn' | 'success'; text: string; to: string }> {
  const out: Array<{ key: string; tone: 'info' | 'warn' | 'success'; text: string; to: string }> = []
  for (const r of requests) {
    const to = `/dashboard/requests/${r.id}`
    const label = `${serviceLabel(r.serviceSlug)} (${modeLabel(r.mode)})`
    const open = ['submitted', 'awaiting_confirmation'].includes(r.status)
    const pending = r.payments.some((p) => p.status === 'pending')
    const paid = r.payments.some((p) => p.status === 'succeeded')
    if (r.status === 'confirmed') {
      out.push({ key: r.id, tone: 'success', to, text: `Your ${label} consultation is confirmed${r.scheduledAt ? ` for ${formatDateTime(r.scheduledAt)}` : ''}.` })
    } else if (open && !pending && !paid) {
      const failed = r.payments.some((p) => p.status === 'failed')
      out.push({ key: r.id, tone: 'warn', to, text: failed ? `We couldn’t verify the payment reference for your ${label} request. You can submit a corrected one.` : `Your ${label} request is waiting for your payment reference.` })
    } else if (open && pending) {
      out.push({ key: r.id, tone: 'info', to, text: `We’re checking the payment reference for your ${label} request.` })
    } else if (open && paid) {
      out.push({ key: r.id, tone: 'info', to, text: `Payment for your ${label} request is verified. We’re arranging your expert and time.` })
    } else if (r.status === 'completed') {
      out.push({ key: r.id, tone: 'info', to, text: `Your ${label} consultation is complete.` })
    }
  }
  return out
}
