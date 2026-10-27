import { Mail, MessageCircle } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Field } from '../components/forms'
import { Notice, PageHero } from '../components/ui'
import { contactChannels, siteConfig } from '../config/site'
import { usePageTitle } from '../hooks/usePageTitle'
import { contactMessage, contactSubject, gmailComposeUrl, mailtoUrl, whatsappUrl } from '../lib/contact'
import { isValidEmail } from '../lib/requestValidation'
import { buildMailto } from '../lib/requestSummary'

type Errors = { name?: string; email?: string; message?: string }

export default function Contact() {
  usePageTitle('Contact')
  const [form, setForm] = useState({ name: '', email: '', message: '' })
  const [errors, setErrors] = useState<Errors>({})
  const [opened, setOpened] = useState(false)
  const configured = Boolean(siteConfig.contactEmail)
  const ctx = { page: 'the Contact page', path: '/contact' }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const found: Errors = {}
    if (form.name.trim().length < 2) found.name = 'Please enter your name.'
    if (!isValidEmail(form.email)) found.email = 'Please enter a valid email address.'
    if (form.message.trim().length < 10) found.message = 'Please write a short message (at least 10 characters).'
    setErrors(found)
    setOpened(false)
    if (Object.keys(found).length) return
    const url = buildMailto(
      siteConfig.contactEmail,
      `Message from ${form.name.trim()} via the ${siteConfig.brandName} website`,
      `${form.message.trim()}\n\n— ${form.name.trim()} (${form.email.trim()})\nSent from the ${siteConfig.brandName} website, Contact page.`,
    )
    if (url) {
      window.location.href = url
      setOpened(true)
    }
  }

  const set = (k: keyof typeof form) => (v: string) => { setForm((f) => ({ ...f, [k]: v })); setErrors((x) => ({ ...x, [k]: undefined })) }

  return (
    <>
      <PageHero eyebrow="Contact" title="Get in touch" lede="Questions about a service, a consultation or payment? Message us on WhatsApp or email. Our team replies personally." />
      <section className="section">
        <div className="container container--narrow stack">
          <div className="grid grid--2">
            <a className="card card--flat" href={whatsappUrl(contactMessage(ctx))} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
              <span className="card__icon"><MessageCircle size={24} strokeWidth={1.6} aria-hidden="true" /></span>
              <h2 style={{ fontSize: '1.3rem' }}>WhatsApp</h2>
              <p style={{ margin: 0 }}>{contactChannels.whatsappDisplay}</p>
              <p className="hint" style={{ margin: 0 }}>Opens WhatsApp with a message already written for you.</p>
            </a>
            {configured && (
              <a className="card card--flat" href={gmailComposeUrl(contactSubject(ctx), contactMessage(ctx))} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                <span className="card__icon"><Mail size={24} strokeWidth={1.6} aria-hidden="true" /></span>
                <h2 style={{ fontSize: '1.3rem' }}>Gmail</h2>
                <p style={{ margin: 0, overflowWrap: 'anywhere' }}>{siteConfig.contactEmail}</p>
                <p className="hint" style={{ margin: 0 }}>Opens a Gmail message with your note already started.</p>
              </a>
            )}
          </div>
          {configured && <p className="hint">On a phone or without Gmail? <a href={mailtoUrl(contactSubject(ctx), contactMessage(ctx))}>Use your own email app instead</a>.</p>}

          {configured && (
            <form className="panel form" onSubmit={onSubmit} noValidate aria-label="Write us a message" data-clarity-mask="True">
              <h2 style={{ fontSize: 'var(--fs-h3)' }}>Or write a message here</h2>
              <Notice><p>This form opens <strong>your own email app</strong> with your message ready to send. Nothing is sent until you press send there.</p></Notice>
              <div className="form-grid form-grid--2">
                <Field label="Your name" error={errors.name}>
                  {(a) => <input id={a.id} className="input" autoComplete="name" maxLength={80} value={form.name} aria-describedby={a.describedBy} aria-invalid={a.invalid} onChange={(e) => set('name')(e.target.value)} />}
                </Field>
                <Field label="Your email" error={errors.email}>
                  {(a) => <input id={a.id} className="input" type="email" autoComplete="email" value={form.email} aria-describedby={a.describedBy} aria-invalid={a.invalid} onChange={(e) => set('email')(e.target.value)} />}
                </Field>
              </div>
              <Field label="Message" error={errors.message} hint="Please don’t include passwords or financial details.">
                {(a) => <textarea id={a.id} className="textarea" maxLength={2000} value={form.message} aria-describedby={a.describedBy} aria-invalid={a.invalid} onChange={(e) => set('message')(e.target.value)} />}
              </Field>
              <button type="submit" className="btn btn--primary" style={{ justifySelf: 'start' }}><Mail size={18} aria-hidden="true" /> Open in email app</button>
              <div aria-live="polite">{opened && <Notice tone="success"><p>Your email app should have opened. If it didn’t, you can write to <a href={`mailto:${siteConfig.contactEmail}`}>{siteConfig.contactEmail}</a> directly.</p></Notice>}</div>
            </form>
          )}
        </div>
      </section>
    </>
  )
}
