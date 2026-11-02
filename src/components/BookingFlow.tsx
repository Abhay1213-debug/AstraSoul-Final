import { Check, Diamond, Layers, MessageCircle, Phone } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { services } from '../data/services'
import { browser, fetchSlots, startCheckout, type SlotsInfo } from '../lib/bookingApi'
import { whatsappUrl } from '../lib/contact'
import {
  CONCERN_MAX, PACKAGES, comboKey, comboName, extension, extensionPrice, formatRupees, formatTime, indiaNow, addDays, normaliseServices,
  priceFor, sessionMinutesFor, sessionName, slotsCovered, validateDetails, withGst, type BookingDetails, type DetailErrors, type ServiceSlug,
} from '../shared/booking'
import { Field } from './forms'
import { CustomPlan } from './PriceList'
import { refundRule } from '../config/site'
import { ServiceIcon } from './icons'
import { FieldError, Notice } from './ui'

const STEPS = ['Your details', 'Consultation', 'Time', 'Pay'] as const
const emptyDetails: BookingDetails = { name: '', email: '', phone: '', dateOfBirth: '', language: '', concern: '' }

function dayLabel(iso: string) {
  const today = indiaNow().date
  if (iso === today) return 'Today'
  if (iso === addDays(today, 1)) return 'Tomorrow'
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
}
const longDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

/**
 * Booking: your details, the consultation (one service or a combination), a date and time for the voice call,
 * then payment on Dodo Payments' checkout. The slot is held for the customer while they pay and becomes theirs once the
 * payment succeeds. Nothing is kept in the browser; the server re-checks everything, including the price.
 */
export function BookingFlow() {
  const [params] = useSearchParams()
  const initial = params.get('service') ?? ''
  const [step, setStep] = useState(0)
  const [details, setDetails] = useState<BookingDetails>(emptyDetails)
  // the consultation is kept as its key: one service ("numerology") or a package ("numerology+palmistry")
  const [choice, setChoice] = useState(() => {
    // a "+" in a web address can arrive as a space
    const picked = normaliseServices(initial.split(/[+\s]/))
    return picked && priceFor(picked) ? comboKey(picked) : ''
  })
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [extend, setExtend] = useState(false)
  const [consent, setConsent] = useState(false)
  const [errors, setErrors] = useState<DetailErrors & { choice?: string; slot?: string; consent?: string }>({})
  const [slots, setSlots] = useState<SlotsInfo | null | 'loading'>('loading')
  const [notice, setNotice] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const first = useRef(true)

  const chosen = (choice ? choice.split('+') : []) as ServiceSlug[]
  const info = slots !== 'loading' ? slots : null
  const testMode = info?.payments === 'test' || info?.payments === 'mock'
  const price = chosen.length ? priceFor(chosen, info?.testPrice ?? null) : null
  const extra = extensionPrice()
  const total = price ? price + (extend && extra ? extra : 0) : null
  const minutes = sessionMinutesFor(chosen, extend && Boolean(extra))
  const day = info?.days.find((d) => d.date === date)
  // a longer session (the 25-minute Diamond package) also needs the next slot to be free
  const fits = (time: string) => slotsCovered(time, minutes).every((t) => day?.slots.find((x) => x.time === t)?.status === 'free')

  const loadSlots = () => {
    setSlots('loading')
    fetchSlots().then((s) => {
      setSlots(s)
      if (!s) return
      setDate((d) => (d && s.days.some((x) => x.date === d && x.slots.some((t) => t.status === 'free')) ? d : s.days.find((x) => x.slots.some((t) => t.status === 'free'))?.date ?? ''))
    })
  }
  useEffect(loadSlots, [])

  useEffect(() => {
    if (first.current) { first.current = false; return }
    headingRef.current?.focus()
    window.scrollTo({ top: 0 })
  }, [step])

  const setField = (k: keyof BookingDetails, v: string) => {
    setDetails((d) => ({ ...d, [k]: v }))
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }))
  }

  function showErrors(found: typeof errors) {
    setErrors(found)
    requestAnimationFrame(() => {
      const bad = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')
      bad?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      bad?.focus({ preventScroll: true })
    })
  }

  async function next(e?: FormEvent) {
    e?.preventDefault()
    setNotice(null)
    if (step === 0) {
      const found = validateDetails(details)
      if (Object.keys(found).length) return showErrors(found)
    }
    if (step === 1) {
      if (!choice) return showErrors({ choice: 'Please choose a consultation or a package.' })
    }
    if (step === 2) {
      const found: typeof errors = {}
      if (!date || !time) found.slot = 'Please choose a date and a time.'
      else if (!fits(time)) found.slot = `This consultation needs ${minutes} free minutes. Please choose another time.`
      if (Object.keys(found).length) return showErrors(found)
    }
    if (step === 3) {
      if (!consent) return showErrors({ consent: 'Please confirm you agree to the terms.' })
      setPaying(true)
      const r = await startCheckout({ details, services: chosen, date, time, extend: extend && Boolean(extra), consent: true })
      if (r.ok) {
        browser.go(r.url)
        return
      }
      setPaying(false)
      if (r.error === 'slot_taken') {
        setNotice(`Someone has just booked ${formatTime(time)} on ${longDate(date)}. Please choose another time.`)
        setTime('')
        loadSlots()
        setStep(2)
      } else if (r.error === 'invalid' && r.fields && Object.keys(r.fields).length) {
        setErrors(r.fields)
        setStep(0)
      } else {
        setNotice('We could not open the payment page just now. Please try again in a moment.')
      }
      return
    }
    setErrors({})
    setStep(step + 1)
  }

  const back = () => { setErrors({}); setNotice(null); setStep(Math.max(0, step - 1)) }

  const whatsappText = useMemo(() => `Hello Ankiro, I would like to book a ${chosen.length ? `${comboName(chosen)} ` : ''}consultation on a voice call.`, [chosen])
  const closedNote = (msg: string) => (
    <div className="booking-closed">
      <p>{msg}</p>
      <a className="btn btn--primary" href={whatsappUrl(whatsappText)} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} aria-hidden="true" /> Book on WhatsApp</a>
    </div>
  )

  return (
    <div className="panel" data-clarity-mask="True">
      <ol className="stepper" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} className={i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>
            <span className="dot" aria-hidden="true">{i < step ? <Check size={14} /> : i + 1}</span>
            <span className="label">{label}<span className="sr-only">{i < step ? ' (completed)' : ''}</span></span>
          </li>
        ))}
      </ol>

      <form ref={formRef} onSubmit={next} noValidate className="form" aria-labelledby="step-heading">
        <h2 id="step-heading" ref={headingRef} tabIndex={-1} style={{ outline: 'none', fontSize: 'var(--fs-h3)' }}>
          {['Tell us a little about you', 'What type of consultation do you need?', 'Choose your time', 'Review and pay'][step]}
        </h2>

        {notice && <Notice tone="warn" role="alert"><p>{notice}</p></Notice>}

        {step === 0 && (
          <>
            <div className="form-grid form-grid--2">
              <Field label="Full name" error={errors.name}>
                {(a) => <input id={a.id} className="input" value={details.name} autoComplete="name" maxLength={80} aria-describedby={a.describedBy} aria-invalid={a.invalid} onChange={(e) => setField('name', e.target.value)} />}
              </Field>
              <Field label="Email" error={errors.email}>
                {(a) => <input id={a.id} className="input" type="email" value={details.email} autoComplete="email" aria-describedby={a.describedBy} aria-invalid={a.invalid} onChange={(e) => setField('email', e.target.value)} />}
              </Field>
              <Field label="Phone / WhatsApp" error={errors.phone}>
                {(a) => <input id={a.id} className="input" type="tel" value={details.phone} autoComplete="tel" placeholder="98765 43210" aria-describedby={a.describedBy} aria-invalid={a.invalid} onChange={(e) => setField('phone', e.target.value)} />}
              </Field>
              <Field label="Date of birth" error={errors.dateOfBirth}>
                {(a) => <input id={a.id} className="input" type="date" min="1900-01-01" value={details.dateOfBirth} autoComplete="bday" aria-describedby={a.describedBy} aria-invalid={a.invalid} onChange={(e) => setField('dateOfBirth', e.target.value)} />}
              </Field>
              <Field label="Preferred language" optional error={errors.language}>
                {(a) => <input id={a.id} className="input" value={details.language} maxLength={40} aria-describedby={a.describedBy} aria-invalid={a.invalid} onChange={(e) => setField('language', e.target.value)} />}
              </Field>
            </div>
            <Field label="What would you like guidance on?" error={errors.concern} hint="A few sentences is plenty.">
              {(a) => (
                <>
                  <textarea id={a.id} className="textarea" value={details.concern} maxLength={CONCERN_MAX + 200} aria-describedby={a.describedBy} aria-invalid={a.invalid} onChange={(e) => setField('concern', e.target.value)} />
                  <span className="char-count" aria-hidden="true">{details.concern.trim().length} / {CONCERN_MAX}</span>
                </>
              )}
            </Field>
          </>
        )}

        {step === 1 && (
          <>
            <fieldset className="field choice-set" aria-describedby={errors.choice ? 'choice-err' : undefined}>
              <legend>One service</legend>
              <div className="choice-grid">
                {services.map((s) => {
                  const p = priceFor([s.slug])
                  return (
                    <label className="choice" key={s.slug}>
                      <input type="radio" name="choice" value={s.slug} checked={choice === s.slug} aria-invalid={Boolean(errors.choice)} onChange={() => { setChoice(s.slug); setErrors({}) }} />
                      <span className="choice__body">
                        <span className="choice__title"><ServiceIcon icon={s.icon} size={22} />{s.name}</span>
                        <span className="choice__desc">{s.summary}</span>
                        {p && <span className="choice__price">{withGst(p)}</span>}
                      </span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
            <fieldset className="field choice-set" aria-describedby={errors.choice ? 'choice-err' : undefined}>
              <legend>Packages</legend>
              <div className="choice-grid">
                {PACKAGES.map((pk) => {
                  const key = comboKey(pk.services)
                  const p = priceFor(pk.services)
                  return (
                    <label className="choice" key={key}>
                      <input type="radio" name="choice" value={key} checked={choice === key} aria-invalid={Boolean(errors.choice)} onChange={() => { setChoice(key); setErrors({}) }} />
                      <span className="choice__body">
                        {pk.recommended && <span className="badge badge--pick">Highly recommended</span>}
                        <span className="choice__title">{pk.services.length > 2 ? <Diamond size={22} aria-hidden="true" /> : <Layers size={22} aria-hidden="true" />}{pk.name}</span>
                        {pk.note && <span className="choice__desc">{pk.note}</span>}
                        {p && <span className="choice__price">{withGst(p)}</span>}
                      </span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
            <CustomPlan />
            <FieldError id="choice-err" message={errors.choice} />
            {chosen.includes('palmistry') && <p className="hint" style={{ margin: 0 }}>For palmistry, our team will tell you how to share photos of your palms after you book.</p>}
          </>
        )}

        {step === 2 && (
          <>
            {slots === 'loading' && <p className="hint" role="status">Loading the free times…</p>}
            {slots !== 'loading' && (!info || !info.ready) && closedNote('Online booking is not open right now. Message us on WhatsApp and we will book a time for you.')}
            {info?.ready && (
              <>
                <div className="call-card">
                  <span className="call-card__icon" aria-hidden="true"><Phone size={22} /></span>
                  <div>
                    <p className="call-card__title">{comboName(chosen)} · {minutes}-minute voice call</p>
                    <p className="call-card__note">Every Ankiro consultation is a call, so your whole session goes to your question.</p>
                  </div>
                  <strong className="call-card__price">{price ? <>{withGst(price)}{testMode && <small> test mode</small>}</> : 'Price coming soon'}</strong>
                </div>
                {!price && closedNote(`Online booking for ${comboName(chosen)} opens soon. Message us on WhatsApp and we will book a time for you.`)}

                <fieldset className="field choice-set" aria-describedby={errors.slot ? 'slot-err' : undefined}>
                  <legend>Date <span className="legend-note">· all times are Indian time (IST)</span></legend>
                  <div className="dates" role="radiogroup" aria-label="Date">
                    {info.days.filter((d) => d.slots.some((s) => s.status !== 'closed')).map((d) => {
                      const free = d.slots.filter((s) => s.status === 'free').length
                      return (
                        <label key={d.date} className={`date-chip${free ? '' : ' is-full'}`}>
                          <input type="radio" name="date" value={d.date} checked={date === d.date} disabled={!free} onChange={() => { setDate(d.date); setTime(''); setErrors({}) }} />
                          <span><strong>{dayLabel(d.date)}</strong><small>{free ? `${free} free` : 'Full'}</small></span>
                        </label>
                      )
                    })}
                  </div>
                </fieldset>
                {day && (
                  <fieldset className="field choice-set">
                    <legend>Time on {longDate(day.date)}</legend>
                    <div className="times">
                      {day.slots.map((s) => {
                        const short = s.status === 'free' && !fits(s.time)
                        return (
                          <label key={s.time} className={`time-chip is-${short ? 'booked' : s.status}`}>
                            <input type="radio" name="time" value={s.time} checked={time === s.time} disabled={s.status !== 'free' || short} aria-invalid={Boolean(errors.slot)} onChange={() => { setTime(s.time); setErrors({}) }} />
                            <span>{formatTime(s.time)}{s.status === 'booked' && <small>Booked</small>}{short && <small>Not enough time</small>}</span>
                          </label>
                        )
                      })}
                    </div>
                    <p className="hint" style={{ margin: 0 }}>This consultation is {minutes} minutes.</p>
                  </fieldset>
                )}
                <FieldError id="slot-err" message={errors.slot} />
                {extra && (
                  <label className="check">
                    <input type="checkbox" checked={extend} onChange={(e) => setExtend(e.target.checked)} />
                    <span>Add {extension.minutes} more minutes (+{formatRupees(extra)})</span>
                  </label>
                )}
              </>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <dl className="summary">
              <div><dt>Consultation</dt><dd>{comboName(chosen)}</dd></div>
              <div><dt>How</dt><dd>{sessionName}</dd></div>
              <div><dt>When</dt><dd>{longDate(date)}, {formatTime(time)} (IST), {minutes} minutes</dd></div>
              <div><dt>Name</dt><dd>{details.name.trim()}</dd></div>
              <div><dt>Phone</dt><dd>{details.phone.trim()}</dd></div>
              <div><dt>Total</dt><dd className="summary__total">{total ? withGst(total) : '—'}<span className="hint"> GST is added on the payment page.{testMode && ' Test mode: no real money is charged.'}</span></dd></div>
            </dl>
            <div className="field">
              <label className="check">
                <input type="checkbox" checked={consent} aria-describedby={errors.consent ? 'consent-err' : undefined} aria-invalid={Boolean(errors.consent)} onChange={(e) => { setConsent(e.target.checked); setErrors({}) }} />
                <span>I agree to the <Link to="/terms" target="_blank">Terms &amp; Conditions</Link>, the <Link to="/refund-policy" target="_blank">Refund Policy</Link> and the <Link to="/privacy" target="_blank">Privacy Policy</Link>.</span>
              </label>
              <FieldError id="consent-err" message={errors.consent} />
            </div>
            <p className="hint" style={{ margin: 0 }}>You pay securely on Dodo Payments’ checkout by UPI or card. Your time is confirmed as soon as the payment goes through, and we send you the Google Meet link for your call on WhatsApp. {refundRule.short}</p>
          </>
        )}

        {Object.values(errors).some(Boolean) && step === 0 && (
          <Notice tone="danger" role="alert"><p>Please fix the highlighted fields to continue.</p></Notice>
        )}

        <div className="cluster" style={{ justifyContent: 'space-between' }}>
          {step > 0 ? <button type="button" className="btn btn--ghost" onClick={back} disabled={paying}>Back</button> : <span />}
          {!(step === 2 && (!info?.ready || !price)) && (
            <button type="submit" className="btn btn--primary" disabled={paying}>
              {step === 3 ? (paying ? 'Opening payment…' : `Pay ${total ? withGst(total) : ''} and book`) : 'Continue'}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
