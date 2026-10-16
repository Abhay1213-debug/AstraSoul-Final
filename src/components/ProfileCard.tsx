import { useState, type FormEvent } from 'react'
import { dataErrorMessage, type DataErrorCode, type DataService, type ProfileInfo } from '../lib/data'
import { Field } from './forms'
import { Notice } from './ui'

/** View and edit the details the database lets a customer change: name, phone, date of birth, language. The email belongs to the login. */
export function ProfileCard({ profile, service, onSaved }: { profile: ProfileInfo; service: DataService; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ fullName: profile.fullName, phone: profile.phone, dateOfBirth: profile.dateOfBirth, preferredLanguage: profile.preferredLanguage })
  const [errors, setErrors] = useState<Partial<Record<keyof typeof draft, string>>>({})
  const [failure, setFailure] = useState<DataErrorCode | null>(null)
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)

  const set = (k: keyof typeof draft, v: string) => {
    setDraft((d) => ({ ...d, [k]: v }))
    setErrors((e) => ({ ...e, [k]: undefined }))
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (pending) return
    const found: typeof errors = {}
    const name = draft.fullName.trim()
    if (name.length < 2 || name.length > 80) found.fullName = 'Please enter your name (2–80 characters).'
    const phone = draft.phone.trim()
    if (phone && !/^\+?[0-9][0-9 -]{6,17}[0-9]$/.test(phone)) found.phone = 'Please enter a valid phone number, or leave it empty.'
    if (draft.dateOfBirth && (draft.dateOfBirth < '1900-01-01' || draft.dateOfBirth > new Date().toISOString().slice(0, 10))) found.dateOfBirth = 'Please enter a real date of birth.'
    if (draft.preferredLanguage.length > 40) found.preferredLanguage = 'Please use 40 characters or fewer.'
    setErrors(found)
    setFailure(null)
    setSaved(false)
    if (Object.keys(found).length > 0) return

    setPending(true)
    const r = await service.updateMyProfile(draft)
    setPending(false)
    if (!r.ok) {
      setFailure(r.code)
      return
    }
    setSaved(true)
    setEditing(false)
    onSaved()
  }

  if (!editing) {
    return (
      <section className="card card--flat" aria-labelledby="profile-heading">
        <h2 id="profile-heading" style={{ fontSize: 'var(--fs-h3)' }}>Your details</h2>
        {saved && <Notice tone="success" role="status"><p>Your details were saved.</p></Notice>}
        <dl className="summary">
          <div><dt>Name</dt><dd>{profile.fullName || '—'}</dd></div>
          <div><dt>Email</dt><dd>{profile.email || '—'}</dd></div>
          <div><dt>Phone</dt><dd>{profile.phone || 'Not added'}</dd></div>
          <div><dt>Date of birth</dt><dd>{profile.dateOfBirth || 'Not added'}</dd></div>
          <div><dt>Preferred language</dt><dd>{profile.preferredLanguage || 'Not added'}</dd></div>
        </dl>
        <div><button type="button" className="btn btn--ghost btn--sm" onClick={() => { setDraft({ fullName: profile.fullName, phone: profile.phone, dateOfBirth: profile.dateOfBirth, preferredLanguage: profile.preferredLanguage }); setSaved(false); setEditing(true) }}>Edit details</button></div>
      </section>
    )
  }

  return (
    <section className="card card--flat" aria-labelledby="profile-heading">
      <h2 id="profile-heading" style={{ fontSize: 'var(--fs-h3)' }}>Edit your details</h2>
      <form onSubmit={save} noValidate className="form" aria-label="Edit your details">
        {failure && <Notice tone="danger" role="alert"><p>{dataErrorMessage[failure]}</p></Notice>}
        <Field label="Full name" error={errors.fullName}>
          {(a) => <input id={a.id} className="input" value={draft.fullName} maxLength={80} autoComplete="name" aria-describedby={a.describedBy} aria-invalid={a.invalid} onChange={(e) => set('fullName', e.target.value)} />}
        </Field>
        <Field label="Phone / WhatsApp" optional error={errors.phone}>
          {(a) => <input id={a.id} className="input" type="tel" value={draft.phone} autoComplete="tel" aria-describedby={a.describedBy} aria-invalid={a.invalid} onChange={(e) => set('phone', e.target.value)} />}
        </Field>
        <Field label="Date of birth" optional error={errors.dateOfBirth} hint="Only needed for some services, and only used for that consultation.">
          {(a) => <input id={a.id} className="input" type="date" min="1900-01-01" value={draft.dateOfBirth} aria-describedby={a.describedBy} aria-invalid={a.invalid} onChange={(e) => set('dateOfBirth', e.target.value)} />}
        </Field>
        <Field label="Preferred language" optional error={errors.preferredLanguage}>
          {(a) => <input id={a.id} className="input" value={draft.preferredLanguage} maxLength={40} aria-describedby={a.describedBy} aria-invalid={a.invalid} onChange={(e) => set('preferredLanguage', e.target.value)} />}
        </Field>
        <p className="hint">Your email belongs to your login and can’t be changed here.</p>
        <div className="cluster">
          <button type="submit" className="btn btn--primary btn--sm" disabled={pending}>{pending ? 'Saving…' : 'Save details'}</button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setEditing(false); setErrors({}); setFailure(null) }}>Cancel</button>
        </div>
      </form>
    </section>
  )
}
