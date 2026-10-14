import { Check, ClipboardCopy, Mail } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { formatPrice, getPrice } from '../config/pricing'
import { siteConfig } from '../config/site'
import { bookingStatusInfo, consultationModes, isModeId, modeById } from '../data/consultationModes'
import { isServiceSlug, serviceBySlug, services } from '../data/services'
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
 * HONESTY NOTE: there is no backend yet. This flow collects and validates a request in memory
 * (nothing is stored — not even in localStorage), then lets the customer send the prepared
 * summary themselves by email or copy it. It never reports a request as "submitted", "booked"
 * or "paid".
 */
export function ConsultationRequestFlow() {
  const [params] = useSearchParams()
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
    if (step === 3) setPrepared(true)
    else setStep(step + 1)
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

  // ---------- Prepared (final) screen ----------
  if (prepared && service && mode) {
    return (
      <div className="panel stack">
        <h2 ref={headingRef} tabIndex={-1} style={{ outline: 'none' }}>Your request is prepared — it has not been sent yet</h2>
        <Notice tone="warn" role="status">
          <p><strong>Nothing has been submitted, booked or paid.</strong> Online submission is not connected yet, and this
          website has not stored your details. To make your request, send the summary below to our team yourself.</p>
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
            <p>This opens your own email app with the request filled in. You review it and press send there.</p>
          ) : (
            <Notice tone="warn">
              <p>Our contact email isn’t set up yet, so there is no address to send this to. You can still copy the summary below
              and keep it for when it is.</p>
              {import.meta.env.DEV && <p className="hint">Developer note: set <code>VITE_CONTACT_EMAIL</code> in <code>.env.local</code>.</p>}
            </Notice>
          )}
        </div>
        <div className="cluster">
          {mailto && <a className="btn btn--primary" href={mailto}><Mail size={18} aria-hidden="true" /> Open in email app</a>}
          <button type="button" className="btn btn--ghost" onClick={copySummary}>
            <ClipboardCopy size={18} aria-hidden="true" /> Copy summary
          </button>
          <button type="button" className="btn btn--ghost" onClick={startOver}>Start over</button>
        </div>
        <div role="status" aria-live="polite">
          {copyState === 'copied' && <Notice tone="success"><p>Summary copied to your clipboard.</p></Notice>}
          {copyState === 'failed' && <Notice tone="danger"><p>Your browser did not allow copying. Please select the summary below and copy it manually.</p></Notice>}
        </div>
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
              <p>We ask only for what this service needs. Your details are used to prepare your consultation request and are not
              stored by this website at this stage.</p>
            </Notice>
            <div className="form-grid form-grid--2">
              <Field label="Full name" error={errors.fullName}>
                {(a) => <input id={a.id} className="input" value={draft.fullName} autoComplete="name" maxLength={80} aria-describedby={a.describedBy} aria-invalid={a.invalid} onChange={(e) => set('fullName', e.target.value)} />}
              </Field>
              <Field label="Email" error={errors.email}>
                {(a) => <input id={a.id} className="input" type="email" value={draft.email} autoComplete="email" aria-describedby={a.describedBy} aria-invalid={a.invalid} onChange={(e) => set('email', e.target.value)} />}
              </Field>
              <Field label="Phone / WhatsApp" optional error={errors.phone}>
                {(a) => <input id={a.id} className="input" type="tel" value={draft.phone} autoComplete="tel" aria-describedby={a.describedBy} aria-invalid={a.invalid} onChange={(e) => set('phone', e.target.value)} />}
              </Field>
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
              <div><dt>Price</dt><dd>{formatPrice(getPrice(service.slug, mode.id))} <span className="hint">(placeholder — no payment is taken)</span></dd></div>
              <div><dt>Name</dt><dd>{draft.fullName.trim()}</dd></div>
              <div><dt>Email</dt><dd>{draft.email.trim()}</dd></div>
              {draft.phone.trim() && <div><dt>Phone</dt><dd>{draft.phone.trim()}</dd></div>}
              {draft.dateOfBirth && <div><dt>Date of birth</dt><dd>{draft.dateOfBirth}</dd></div>}
              {draft.preferredLanguage.trim() && <div><dt>Language</dt><dd>{draft.preferredLanguage.trim()}</dd></div>}
              <div><dt>Guidance on</dt><dd>{draft.concern.trim()}</dd></div>
              <div><dt>Status</dt><dd>{bookingStatusInfo.draft.label} — {bookingStatusInfo.draft.meaning}</dd></div>
            </dl>
            <Notice>
              <p>The next screen gives you a summary to send to our team by email. A time with an
              expert is only agreed after the team reviews your request; availability is not guaranteed.</p>
            </Notice>
            <div className="field">
              <label className="check">
                <input type="checkbox" checked={draft.consent} aria-describedby={errors.consent ? 'consent-err' : undefined} aria-invalid={Boolean(errors.consent)} onChange={(e) => set('consent', e.target.checked)} />
                <span>I understand my details will be used only to prepare and handle this consultation request, and that this request is not a confirmed booking.</span>
              </label>
              <FieldError id="consent-err" message={errors.consent} />
            </div>
          </>
        )}

        {Object.values(errors).some(Boolean) && step !== 0 && (
          <Notice tone="danger" role="alert"><p>Please fix the highlighted fields to continue.</p></Notice>
        )}

        <div className="cluster" style={{ justifyContent: 'space-between' }}>
          {step > 0 ? <button type="button" className="btn btn--ghost" onClick={back}>Back</button> : <span />}
          <button type="submit" className="btn btn--primary">{step === 3 ? 'Prepare my request' : 'Continue'}</button>
        </div>
      </form>
    </div>
  )
}
