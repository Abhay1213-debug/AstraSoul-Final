import { useState, type FormEvent } from 'react'
import { authErrorMessage, useAuth, type AuthErrorCode, type MfaState, type TotpEnrolment } from '../lib/auth'
import { Field } from './forms'
import { Notice } from './ui'

/**
 * The authenticator-app step (a 6-digit code). Administrators and experts need it: the DATABASE refuses their powers without it
 * (the session must be at level aal2 and have a verified authenticator). This component only helps the person get there:
 * set up an authenticator (QR code + secret, shown once and never stored by the website) and/or enter the current code.
 */
export function Authenticator({ mfa, onDone, intro }: { mfa: MfaState; onDone: () => void | Promise<void>; intro?: string }) {
  const { service } = useAuth()
  const [failure, setFailure] = useState<AuthErrorCode | null>(null)
  const [enrolment, setEnrolment] = useState<TotpEnrolment | null>(null)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | undefined>()
  const [pending, setPending] = useState(false)
  const factorId = enrolment?.factorId ?? mfa.verifiedFactorId

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pending || !service || !factorId) return
    const digits = code.replace(/\s/g, '')
    if (!/^[0-9]{6}$/.test(digits)) {
      setCodeError('Please enter the 6-digit code from your authenticator app.')
      return
    }
    setCodeError(undefined)
    setPending(true)
    const r = await service.verifyTotp(factorId, digits)
    setPending(false)
    setCode('')
    if (!r.ok) {
      setFailure(r.code)
      return
    }
    setFailure(null)
    setEnrolment(null)
    await onDone()
  }

  async function startEnrol() {
    if (!service) return
    setPending(true)
    const r = await service.enrollTotp()
    setPending(false)
    if (r.ok) {
      setEnrolment(r.data)
      setFailure(null)
    } else setFailure(r.code)
  }

  return (
    <div className="card card--flat stack" style={{ maxWidth: '36rem' }}>
      <h2 style={{ fontSize: 'var(--fs-h3)' }}>{factorId ? 'Enter your authenticator code' : 'Set up your authenticator'}</h2>
      {intro && <Notice role="status"><p>{intro}</p></Notice>}
      {failure && <Notice tone="danger" role="alert"><p>{authErrorMessage[failure]}</p></Notice>}

      {!factorId && (
        <>
          <p>Use an authenticator app on your phone (for example Google Authenticator, Microsoft Authenticator or Authy). Press the button to get a QR code.</p>
          <div><button type="button" className="btn btn--primary" disabled={pending} onClick={startEnrol}>{pending ? 'Preparing…' : 'Set up authenticator'}</button></div>
        </>
      )}

      {enrolment && (
        <div className="stack">
          <p>Scan this QR code with your authenticator app, or type the secret in by hand. Then enter the 6-digit code it shows.</p>
          <img src={enrolment.qrCode} alt="QR code for your authenticator app" width={180} height={180} style={{ background: '#fff', padding: 8, borderRadius: 8 }} />
          <p className="hint" style={{ overflowWrap: 'anywhere' }}>Secret: <code>{enrolment.secret}</code> (don’t share it or save it anywhere public)</p>
        </div>
      )}

      {factorId && (
        <form onSubmit={submit} noValidate className="form" aria-label="Authenticator code">
          <Field label="6-digit code" error={codeError}>
            {(a) => <input id={a.id} className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} aria-describedby={a.describedBy} aria-invalid={a.invalid} onChange={(e) => { setCode(e.target.value); setCodeError(undefined) }} />}
          </Field>
          <button type="submit" className="btn btn--primary" disabled={pending}>{pending ? 'Checking…' : 'Continue'}</button>
        </form>
      )}
    </div>
  )
}
