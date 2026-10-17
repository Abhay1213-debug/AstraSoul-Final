import { Check, ClipboardCopy, Mail, MessageCircle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { formatPrice, getPrice } from '../config/pricing'
import { siteConfig } from '../config/site'
import { bookingStatusInfo, consultationModes, isModeId, modeById } from '../data/consultationModes'
import { isServiceSlug, serviceBySlug, services } from '../data/services'
import { useLoad } from '../hooks/useLoad'
import { useAuth } from '../lib/auth'
import { dataErrorMessage, useData, type DataErrorCode } from '../lib/data'
import { formatMoney } from '../lib/format'
import { PaymentDetails } from './PaymentDetails'
import { refundRule } from '../config/site'
import { whatsappUrl } from '../lib/contact'
import { buildMailto, buildRequestSummary } from '../lib/requestSummary'
import {
  CONCERN_MAX, emptyDraft, hasErrors, validateDetailsStep, validateModeStep, validateReviewStep, validateServiceStep,
  type RequestErrors,
} from '../lib/requestValidation'
import type { ConsultationRequestDraft } from '../types/domain'
import { Field } from './forms'
import { ModeIcon, ServiceIcon } from './icons'
import { FieldError, Notice } from './ui'

const STEPS = ['Service', 'Your details', 'Consultation mode', 'Review'] as const

/**
 * Consultation request flow.
 *
 * TWO MODES, chosen by what is really available:
 *  - ONLINE: accounts are switched on, the customer is logged in, and an approved consent version exists in the database. The request is
 *    saved through the database (which checks everything again), and the customer is taken to the request page for the payment steps.
 *  - PREPARED-BY-EMAIL (the default): collects and validates in memory (nothing stored, not even in localStorage), then lets the
 *    customer send the prepared summary themselves by email or copy it. It never reports a request as "submitted", "booked" or "paid".
 */
export function ConsultationRequestFlow() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { state: auth } = useAuth()
  const { service: data } = useData()
  const signedIn = auth.status === 'signed_in'
  const consentLoad = useLoad(data && signedIn ? () => data.getActiveConsentVersion() : null, [data, signedIn])
  const profileLoad = useLoad(data && signedIn ? () => data.getMyProfile() : null, [data, signedIn])
  const pricesLoad = useLoad(data ? () => data.listPrices() : null, [data])
  const consentVersion = consentLoad.state.status === 'done' ? consentLoad.state.data : null
  const profile = profileLoad.state.status === 'done' ? profileLoad.state.data : null
  const online = Boolean(data && signedIn && consentVersion && profile)
  const [submitFailure, setSubmitFailure] = useState<DataErrorCode | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const initialService = params.get('service') ?? ''
  const initialMode = params.get('mode') ?? ''

  const [draft, setDraft] = useState<ConsultationRequestDraft>(() => ({
    ...emptyDraft,
    service: isServiceSlug(initialService) ? initialService : '',
    mode: isModeId(initialMode) ? initialMode : '',
  }))
  // Start at details when the service is pre-selected from a service page.
  const [step, setStep] = useState(() => (isServiceSlug(initialService) ? 1 : 0))
  const [errors, setErrors] = useState<RequestErrors>({})
  const [prepared, setPrepared] = useState(false)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const firstRender = useRef(true)

  const service = serviceBySlug(draft.service)
  const mode = modeById(draft.mode)

  // In online mode the details come from the customer's profile (they are not asked again).
  useEffect(() => {
    if (!online || !profile) return
    setDraft((d) => ({
      ...d,
      fullName: profile.fullName,
      email: profile.email || (auth.status === 'signed_in' ? auth.user.email : ''),
      phone: profile.phone,
      dateOfBirth: d.dateOfBirth || profile.dateOfBirth,
      preferredLanguage: d.preferredLanguage || profile.preferredLanguage,
    }))
  }, [online, profile, auth])

  const priceMinor = (slug: string, m: string): number | null | undefined =>
    pricesLoad.state.status === 'done' ? pricesLoad.state.data.find((p) => p.serviceSlug === slug && p.mode === m)?.amountMinor ?? null : undefined

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    headingRef.current?.focus()
    window.scrollTo({ top: 0 })
  }, [step, prepared])

  const set = <K extends keyof ConsultationRequestDraft>(key: K, value: ConsultationRequestDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  function next(e?: FormEvent) {
    e?.preventDefault()
    let found: RequestErrors = {}
    if (step === 0) found = validateServiceStep(draft)
    if (step === 1 && service) found = validateDetailsStep(draft, service)
    if (step === 2) found = validateModeStep(draft)
    if (step === 3) found = validateReviewStep(draft)
    setErrors(found)
    if (hasErrors(found)) return
    if (step === 3) {
      if (online) void submitOnline()
      else setPrepared(true)
    } else setStep(step + 1)
  }

  async function submitOnline() {
    if (submitting || createdId || !data || !consentVersion || !service || !mode) return
    setSubmitting(true)
    setSubmitFailure(null)
    const result = await data.createRequest({
      serviceSlug: service.slug,
      mode: mode.id,
      concern: draft.concern,
      dateOfBirth: service.dob === 'none' ? '' : draft.dateOfBirth,
      preferredLanguage: draft.preferredLanguage,
      consentVersion,
    })
    setSubmitting(false)
    if (!result.ok) {
      setSubmitFailure(result.code)
      return
    }
    setCreatedId(result.data.id)
  }

  const back = () => { setErrors({}); setStep(Math.max(0, step - 1)) }

  const summary = useMemo(
    () => (service && mode ? buildRequestSummary(draft, service, mode, siteConfig.brandName) : ''),
    [draft, service, mode],
  )
  const mailto = service && mode
    ? buildMailto(siteConfig.contactEmail, `Consultation request: ${service.name} (${mode.name})`, summary)
    : null

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(summary)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  function startOver() {
    setDraft(emptyDraft); setErrors({}); setStep(0); setPrepared(false); setCopyState('idle')
  }

  // ---------- Submitted online ----------
  if (createdId && service && mode) {
    return (
      <div className="panel stack">
        <h2 ref={headingRef} tabIndex={-1} style={{ outline: 'none' }}>Your request has been received</h2>
        <Notice tone="success" role="status">
          <p><strong>Thank you.</strong> We have your request for {service.name} ({mode.name}). It is <strong>not a confirmed booking yet</strong>: our team will check payment, then arrange an expert and a time.</p>
        </Notice>
        <p>Next step: open your request to see the price and payment instructions, and to submit your UPI payment reference.</p>
        <div className="cluster">
          <button type="button" className="btn btn--primary" onClick={() => navigate(`/dashboard/requests/${createdId}`)}>Open my request</button>
          <Link className="btn btn--ghost" to="/dashboard">Go to my dashboard</Link>
        </div>
      </div>
    )
  }

  // ---------- Prepared (final) screen ----------
  if (prepared && service && mode) {
    return (
      <div className="panel stack">
        <h2 ref={headingRef} tabIndex={-1} style={{ outline: 'none' }}>Your request is prepared — it has not been sent yet</h2>
        <Notice tone="warn" role="status">
          <p><strong>Nothing has been submitted, booked or paid.</strong> Your request is only sent when you press send in
          WhatsApp or your email app, and this website does not store your details. To make your request, send the summary below to our team.</p>
        </Notice>
        <dl className="summary">
          <div><dt>Status</dt><dd>{bookingStatusInfo.draft.label} — {bookingStatusInfo.draft.meaning}</dd></div>
          <div><dt>Service</dt><dd>{service.name}</dd></div>
          <div><dt>Mode</dt><dd>{mode.name}</dd></div>
          <div><dt>Price</dt><dd>{formatPrice(getPrice(service.slug, mode.id))}</dd></div>
        </dl>
        <div>
          <h3 style={{ fontSize: '1.3rem' }}>Send it to the team</h3>
          {mailto ? (
            <p>Choose WhatsApp or email. Either opens your own app with the request filled in. You review it and press send there. Our team replies personally.</p>
          ) : (
            <Notice tone="warn">
              <p>Our contact email isn’t set up yet, so there is no address to send this to. You can still copy the summary below
              and keep it for when it is.</p>
              {import.meta.env.DEV && <p className="hint">Developer note: set <code>VITE_CONTACT_EMAIL</code> in <code>.env.local</code>.</p>}
            </Notice>
          )}
        </div>
        <div className="cluster">
          <a className="btn btn--primary" href={whatsappUrl(summary)} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} aria-hidden="true" /> Send on WhatsApp</a>
          {mailto && <a className="btn btn--ghost" href={mailto}><Mail size={18} aria-hidden="true" /> Open in email app</a>}
          <button type="button" className="btn btn--ghost" onClick={copySummary}>
            <ClipboardCopy size={18} aria-hidden="true" /> Copy summary
          </button>
          <button type="button" className="btn btn--ghost" onClick={startOver}>Start over</button>
        </div>
        <div role="status" aria-live="polite">
          {copyState === 'copied' && <Notice tone="success"><p>Summary copied to your clipboard.</p></Notice>}
          {copyState === 'failed' && <Notice tone="danger"><p>Your browser did not allow copying. Please select the summary below and copy it manually.</p></Notice>}
        </div>
        <section className="stack" aria-labelledby="pay-after-h">
          <h3 id="pay-after-h" style={{ fontSize: '1.3rem' }}>Paying for your consultation</h3>
          <p style={{ margin: 0 }}>
            After you send this, our team replies and confirms the amount. <strong>Please pay only after that.</strong> You pay with your own UPI app,
            using the UPI ID or QR code below, then tell us the UPI reference. {refundRule.line}
          </p>
          <PaymentDetails />
          <Notice tone="warn"><p><strong>Never share your UPI PIN, an OTP, a card number or a banking password</strong> with us. See <Link to="/payment">how payment works</Link>.</p></Notice>
        </section>
        <details>
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Preview the summary text</summary>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: '#fffdf7', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: 'var(--space-4)', fontFamily: 'inherit', fontSize: '0.92rem' }}>{summary}</pre>
        </details>
      </div>
    )
  }

  // ---------- Steps ----------
  return (
    <div className="panel">
      {data && !signedIn && auth.status !== 'loading' && (
        <Notice role="status">
          <p><strong>Want to send this online?</strong> <Link to={`/login?next=${encodeURIComponent('/consultation/request')}`}>Log in</Link> or <Link to="/signup">create an account</Link> first. Without an account you can still prepare your request and email it to us.</p>
        </Notice>
      )}
      {data && signedIn && consentLoad.state.status === 'done' && !consentVersion && (
        <Notice tone="warn" role="status">
          <p><strong>Online requests aren’t open yet.</strong> You can still prepare your request below and send it to us by email. Nothing is stored by this website.</p>
        </Notice>
      )}
      {online && (
        <Notice role="status"><p>You’re logged in, so this request will be saved to your account and you can follow it on your dashboard.</p></Notice>
      )}
      <ol className="stepper" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} className={i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>
            <span className="dot" aria-hidden="true">{i < step ? <Check size={14} /> : i + 1}</span>
            <span className="label">{label}<span className="sr-only">{i < step ? ' (completed)' : ''}</span></span>
          </li>
        ))}
      </ol>

      <form onSubmit={next} noValidate className="form" aria-labelledby="step-heading">
        <h2 id="step-heading" ref={headingRef} tabIndex={-1} style={{ outline: 'none', fontSize: 'var(--fs-h3)' }}>
          {step === 0 && 'Which service would you like?'}
          {step === 1 && 'Tell us a little about you'}
          {step === 2 && 'How would you like to consult?'}
          {step === 3 && 'Review your request'}
        </h2>

        {step === 0 && (
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }} aria-describedby={errors.service ? 'service-err' : undefined}>
            <legend className="sr-only">Service</legend>
            <div className="choice-grid">
              {services.map((s) => (
                <label className="choice" key={s.slug}>
                  <input type="radio" name="service" value={s.slug} checked={draft.service === s.slug} onChange={() => set('service', s.slug)} />
                  <span className="choice__body">
                    <span className="choice__title"><ServiceIcon icon={s.icon} size={22} />{s.name}</span>
                    <span className="choice__desc">{s.summary}</span>
                  </span>
                </label>
              ))}
            </div>
            <FieldError id="service-err" message={errors.service} />
            <p className="hint">Not sure? Read about <Link to="/services">each service</Link> first.</p>
          </fieldset>
        )}

        {step === 1 && service && (
          <>
            <p className="hint" style={{ margin: 0 }}>
              Service: <strong>{service.name}</strong> · <button type="button" className="link-arrow" style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0, color: 'var(--gold-ink)', textDecoration: 'underline' }} onClick={() => { setStep(0) }}>change</button>
            </p>
            <Notice>
              {online
                ? <p>We ask only for what this service needs. Your request is saved to your account so you and our team can follow it. Your name and email come from your account.</p>
                : <p>We ask only for what this service needs. Your details are used to prepare your consultation request and are not
                  stored by this website at this stage.</p>}
            </Notice>
            <div className="form-grid form-grid--2">
              {!online && <Field label="Full name" error={errors.fullName}>
                {(a) => <input id={a.id} className="input" value={draft.fullName} autoComplete="name" maxLength={80} aria-describedby={a.describedBy} aria-invalid={a.invalid} onChange={(e) => set('fullName', e.target.value)} />}
              </Field>}
              {!online && <Field label="Email" error={errors.email}>
                {(a) => <input id={a.id} className="input" type="email" value={draft.email} autoComplete="email" aria-describedby={a.describedBy} aria-invalid={a.invalid} onChange={(e) => set('email', e.target.value)} />}
              </Field>}
              {!online && <Field label="Phone / WhatsApp" optional error={errors.phone}>
                {(a) => <input id={a.id} className="input" type="tel" value={draft.phone} autoComplete="tel" aria-describedby={a.describedBy} aria-invalid={a.invalid} onChange={(e) => set('phone', e.target.value)} />}
              </Field>}
              {service.dob !== 'none' && (
                <Field
                  label="Date of birth"
                  optional={service.dob === 'optional'}
                  error={errors.dateOfBirth}
                  hint={service.dob === 'optional' ? 'Only if you would like it taken into account.' : `Needed for ${service.name.toLowerCase()}.`}
                >
                  {(a) => <input id={a.id} className="input" type="date" min="1900-01-01" value={draft.dateOfBirth} autoComplete="bday" aria-describedby={a.describedBy} aria-invalid={a.invalid} onChange={(e) => set('dateOfBirth', e.target.value)} />}
                </Field>
              )}
              <Field label="Preferred language" optional error={errors.preferredLanguage}>
                {(a) => <input id={a.id} className="input" value={draft.preferredLanguage} maxLength={40} aria-describedby={a.describedBy} aria-invalid={a.invalid} onChange={(e) => set('preferredLanguage', e.target.value)} />}
              </Field>
            </div>
            {service.needsPalmPhotos && (
              <Notice>
                <p><strong>Palm photographs:</strong> online photo upload is not available yet, so we are not asking
                for photos here. Once your request is confirmed, the team will tell you how to share them securely.</p>
              </Notice>
            )}
            <Field label="What would you like guidance on?" error={errors.concern} hint="A few sentences is plenty. Please don't include passwords or financial details.">
              {(a) => (
                <>
                  <textarea id={a.id} className="textarea" value={draft.concern} maxLength={CONCERN_MAX + 200} aria-describedby={a.describedBy} aria-invalid={a.invalid} onChange={(e) => set('concern', e.target.value)} />
                  <span className="char-count" aria-hidden="true">{draft.concern.trim().length} / {CONCERN_MAX}</span>
                </>
              )}
            </Field>
          </>
        )}

        {step === 2 && (
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="sr-only">Consultation mode</legend>
            <div className="choice-grid">
              {consultationModes.map((m) => (
                <label className="choice" key={m.id}>
                  <input type="radio" name="mode" value={m.id} checked={draft.mode === m.id} onChange={() => set('mode', m.id)} />
                  <span className="choice__body">
                    <span className="choice__title"><ModeIcon icon={m.icon} size={22} />{m.name}</span>
                    <span className="choice__desc">{m.summary}</span>
                    <span className="choice__desc"><strong>Pilot:</strong> {m.pilotNote}</span>
                  </span>
                </label>
              ))}
            </div>
            <FieldError id="mode-err" message={errors.mode} />
          </fieldset>
        )}

        {step === 3 && service && mode && (
          <>
            <dl className="summary">
              <div><dt>Service</dt><dd>{service.name}</dd></div>
              <div><dt>Mode</dt><dd>{mode.name}</dd></div>
              <div><dt>Price</dt><dd>
                {online && priceMinor(service.slug, mode.id) !== undefined ? formatMoney(priceMinor(service.slug, mode.id) ?? null) : formatPrice(getPrice(service.slug, mode.id))}{' '}
                <span className="hint">{online ? '(you pay only after submitting, with your own UPI app)' : '(placeholder — no payment is taken)'}</span></dd></div>
              <div><dt>Name</dt><dd>{draft.fullName.trim()}</dd></div>
              <div><dt>Email</dt><dd>{draft.email.trim()}</dd></div>
              {draft.phone.trim() && <div><dt>Phone</dt><dd>{draft.phone.trim()}</dd></div>}
              {draft.dateOfBirth && <div><dt>Date of birth</dt><dd>{draft.dateOfBirth}</dd></div>}
              {draft.preferredLanguage.trim() && <div><dt>Language</dt><dd>{draft.preferredLanguage.trim()}</dd></div>}
              <div><dt>Guidance on</dt><dd>{draft.concern.trim()}</dd></div>
              <div><dt>Status</dt><dd>{online ? 'Not submitted yet' : `${bookingStatusInfo.draft.label} — ${bookingStatusInfo.draft.meaning}`}</dd></div>
            </dl>
            <Notice>
              <p>{online
                ? 'When you submit, your request is saved and you’ll see your payment steps. A time with an expert is only agreed after our team checks payment and reviews your request; availability is not guaranteed.'
                : 'The next screen gives you a summary to send to our team by email. A time with an expert is only agreed after the team reviews your request; availability is not guaranteed.'}</p>
            </Notice>
            <div className="field">
              <label className="check">
                <input type="checkbox" checked={draft.consent} aria-describedby={errors.consent ? 'consent-err' : undefined} aria-invalid={Boolean(errors.consent)} onChange={(e) => set('consent', e.target.checked)} />
                <span>I understand my details will be used only to prepare and handle this consultation request, and that this request is not a confirmed booking. (See our <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>, which opens in a new tab.)</span>
              </label>
              <FieldError id="consent-err" message={errors.consent} />
            </div>
          </>
        )}

        {submitFailure && <Notice tone="danger" role="alert"><p>{dataErrorMessage[submitFailure]}</p></Notice>}
        {Object.values(errors).some(Boolean) && step !== 0 && (
          <Notice tone="danger" role="alert"><p>Please fix the highlighted fields to continue.</p></Notice>
        )}

        <div className="cluster" style={{ justifyContent: 'space-between' }}>
          {step > 0 ? <button type="button" className="btn btn--ghost" onClick={back}>Back</button> : <span />}
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {step === 3 ? (online ? (submitting ? 'Submitting…' : 'Submit my request') : 'Prepare my request') : 'Continue'}
          </button>
        </div>
      </form>
    </div>
  )
}
