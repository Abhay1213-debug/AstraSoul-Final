import { Mail } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Field } from '../components/forms'
import { Notice, PageHero } from '../components/ui'
import { siteConfig } from '../config/site'
import { usePageTitle } from '../hooks/usePageTitle'
import { isValidEmail } from '../lib/requestValidation'
import { buildMailto } from '../lib/requestSummary'

type Errors = { name?: string; email?: string; message?: string }

export default function Contact() {
  usePageTitle('Contact')
  const [form, setForm] = useState({ name: '', email: '', message: '' })
  const [errors, setErrors] = useState<Errors>({})
  const [opened, setOpened] = useState(false)
  const configured = Boolean(siteConfig.contactEmail)

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
      `Message from ${form.name.trim()}`,
      `${form.message.trim()}\n\n— ${form.name.trim()} (${form.email.trim()})`,
    )
    if (url) {
      window.location.href = url
      setOpened(true)
    }
  }

  const set = (k: keyof typeof form) => (v: string) => { setForm((f) => ({ ...f, [k]: v })); setErrors((x) => ({ ...x, [k]: undefined })) }

  return (
    <>
      <PageHero eyebrow="Contact" title="Get in touch" lede="Questions about a service, a consultation, or how the pilot works? Write to us." />
      <section className="section">
        <div className="container container--narrow stack">
          {!configured ? (
            <Notice tone="warn" role="status">
              <p><strong>Our contact channel isn’t set up yet.</strong> Please check back soon.</p>
              {import.meta.env.DEV && <p className="hint">Developer note: set <code>VITE_CONTACT_EMAIL</code> in <code>.env.local</code> to enable this form.</p>}
            </Notice>
          ) : (
            <form className="panel form" onSubmit={onSubmit} noValidate>
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
