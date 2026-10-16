import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  authErrorMessage, normaliseEmail, safeNext, validateNewPassword, validateResetRequest, validateSignIn, validateSignUp,
  type AuthErrorCode, type AuthService,
} from '../lib/auth'
import {
  PASSWORD_MAX, PASSWORD_MIN, type NewPasswordErrors, type SignInErrors, type SignUpDraft, type SignUpErrors,
} from '../lib/auth/validation'
import { Field } from './forms'
import { Notice } from './ui'

/**
 * Sign-up and log-in forms. They only talk to the AuthService they are given (never to Supabase directly).
 * Passwords: kept only in the input fields, cleared after every attempt, never stored, logged or put in a URL.
 */

export function SignupForm({ service }: { service: AuthService }) {
  const navigate = useNavigate()
  const [draft, setDraft] = useState<SignUpDraft>({ fullName: '', email: '', password: '', confirmPassword: '' })
  const [errors, setErrors] = useState<SignUpErrors>({})
  const [failure, setFailure] = useState<AuthErrorCode | null>(null)
  const [pending, setPending] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const set = (key: keyof SignUpDraft, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pending) return
    const found = validateSignUp(draft)
    setErrors(found)
    setFailure(null)
    if (Object.keys(found).length > 0) return

    setPending(true)
    const email = normaliseEmail(draft.email)
    const result = await service.signUp({ fullName: draft.fullName.trim(), email, password: draft.password })
    setPending(false)
    setDraft((d) => ({ ...d, password: '', confirmPassword: '' }))

    if (!result.ok) {
      setFailure(result.code)
      return
    }
    if (result.data.needsConfirmation) setSentTo(email)
    else navigate('/dashboard', { replace: true })
  }

  if (sentTo) {
    return (
      <div className="stack">
        <h2>Check your email</h2>
        <Notice tone="success" role="status">
          <p>
            If <strong>{sentTo}</strong> can be used for a new account, a confirmation link is on its way. Open it to finish
            creating your account, then log in.
          </p>
        </Notice>
        <p>Nothing after a few minutes? Check your spam folder, or ask for a new link.</p>
        <ResendConfirmation service={service} email={sentTo} />
        <div className="cluster">
          <button type="button" className="btn btn--ghost" onClick={() => setSentTo(null)}>Go back</button>
          <Link className="btn btn--primary" to="/login">Go to log in</Link>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="form" aria-label="Create an account">
      {failure && <Notice tone="danger" role="alert"><p>{authErrorMessage[failure]}</p></Notice>}
      <Field label="Full name" error={errors.fullName}>
        {(a) => <input id={a.id} className="input" value={draft.fullName} autoComplete="name" maxLength={80} aria-describedby={a.describedBy} aria-invalid={a.invalid} onChange={(e) => set('fullName', e.target.value)} />}
      </Field>
      <Field label="Email" error={errors.email}>
        {(a) => <input id={a.id} className="input" type="email" value={draft.email} autoComplete="email" maxLength={320} aria-describedby={a.describedBy} aria-invalid={a.invalid} onChange={(e) => set('email', e.target.value)} />}
      </Field>
      <Field label="Password" error={errors.password} hint={`At least ${PASSWORD_MIN} characters. A few random words works well.`}>
        {(a) => <input id={a.id} className="input" type="password" value={draft.password} autoComplete="new-password" maxLength={PASSWORD_MAX + 20} aria-describedby={a.describedBy} aria-invalid={a.invalid} onChange={(e) => set('password', e.target.value)} />}
      </Field>
      <Field label="Confirm password" error={errors.confirmPassword}>
        {(a) => <input id={a.id} className="input" type="password" value={draft.confirmPassword} autoComplete="new-password" maxLength={PASSWORD_MAX + 20} aria-describedby={a.describedBy} aria-invalid={a.invalid} onChange={(e) => set('confirmPassword', e.target.value)} />}
      </Field>
      <button type="submit" className="btn btn--primary btn--block" disabled={pending}>
        {pending ? 'Creating your account…' : 'Create account'}
      </button>
      <p className="hint">
        Please read our <Link to="/privacy">Privacy Policy</Link> and <Link to="/terms">Terms</Link>. We never ask for card or bank details when you create an account.
      </p>
      <p>Already have an account? <Link to="/login">Log in</Link></p>
    </form>
  )
}

export function LoginForm({ service, next }: { service: AuthService; next: string | null }) {
  const navigate = useNavigate()
  const [draft, setDraft] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState<SignInErrors>({})
  const [failure, setFailure] = useState<AuthErrorCode | null>(null)
  const [pending, setPending] = useState(false)

  const set = (key: 'email' | 'password', value: string) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pending) return
    const found = validateSignIn(draft)
    setErrors(found)
    setFailure(null)
    if (Object.keys(found).length > 0) return

    setPending(true)
    const result = await service.signIn({ email: normaliseEmail(draft.email), password: draft.password })
    setPending(false)
    setDraft((d) => ({ ...d, password: '' }))

    if (!result.ok) {
      setFailure(result.code)
      return
    }
    navigate(safeNext(next), { replace: true })
  }

  return (
    <form onSubmit={submit} noValidate className="form" aria-label="Log in">
      {failure && <Notice tone="danger" role="alert"><p>{authErrorMessage[failure]}</p></Notice>}
      {failure === 'email_not_confirmed' && <ResendConfirmation service={service} email={normaliseEmail(draft.email)} />}
      <Field label="Email" error={errors.email}>
        {(a) => <input id={a.id} className="input" type="email" value={draft.email} autoComplete="email" maxLength={320} aria-describedby={a.describedBy} aria-invalid={a.invalid} onChange={(e) => set('email', e.target.value)} />}
      </Field>
      <Field label="Password" error={errors.password}>
        {(a) => <input id={a.id} className="input" type="password" value={draft.password} autoComplete="current-password" maxLength={1024} aria-describedby={a.describedBy} aria-invalid={a.invalid} onChange={(e) => set('password', e.target.value)} />}
      </Field>
      <button type="submit" className="btn btn--primary btn--block" disabled={pending}>
        {pending ? 'Logging in…' : 'Log in'}
      </button>
      <p><Link to="/forgot-password">Forgot your password?</Link></p>
      <p>New here? <Link to="/signup">Create an account</Link></p>
    </form>
  )
}

/** Step 1 of a password reset: ask for the email. The answer is the same for every address, so it never reveals who has an account. */
export function ForgotPasswordForm({ service }: { service: AuthService }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [failure, setFailure] = useState<AuthErrorCode | null>(null)
  const [pending, setPending] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pending) return
    const problem = validateResetRequest(email)
    setError(problem ?? undefined)
    setFailure(null)
    if (problem) return

    setPending(true)
    const address = normaliseEmail(email)
    const result = await service.requestPasswordReset(address)
    setPending(false)
    if (!result.ok) {
      setFailure(result.code)
      return
    }
    setSentTo(address)
  }

  if (sentTo) {
    return (
      <div className="stack">
        <h2>Check your email</h2>
        <Notice tone="success" role="status">
          <p>
            If <strong>{sentTo}</strong> has an account, a link to choose a new password is on its way. The link can be used once
            and stops working after a while.
          </p>
        </Notice>
        <p>Nothing after a few minutes? Check your spam folder, or go back and try again.</p>
        <div className="cluster">
          <button type="button" className="btn btn--ghost" onClick={() => setSentTo(null)}>Go back</button>
          <Link className="btn btn--primary" to="/login">Back to log in</Link>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="form" aria-label="Reset your password">
      {failure && <Notice tone="danger" role="alert"><p>{authErrorMessage[failure]}</p></Notice>}
      <Field label="Email" error={error} hint="We’ll email you a link to choose a new password.">
        {(a) => <input id={a.id} className="input" type="email" value={email} autoComplete="email" maxLength={320} aria-describedby={a.describedBy} aria-invalid={a.invalid} onChange={(e) => { setEmail(e.target.value); setError(undefined) }} />}
      </Field>
      <button type="submit" className="btn btn--primary btn--block" disabled={pending}>
        {pending ? 'Sending…' : 'Send reset link'}
      </button>
      <p>Remembered it? <Link to="/login">Log in</Link></p>
    </form>
  )
}

/** Step 2: the person has opened the emailed link (which signs them in temporarily) and now chooses a new password. */
export function ResetPasswordForm({ service, email }: { service: AuthService; email: string }) {
  const [draft, setDraft] = useState({ password: '', confirmPassword: '' })
  const [errors, setErrors] = useState<NewPasswordErrors>({})
  const [failure, setFailure] = useState<AuthErrorCode | null>(null)
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)

  const set = (key: 'password' | 'confirmPassword', value: string) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pending) return
    const found = validateNewPassword(draft, email)
    setErrors(found)
    setFailure(null)
    if (Object.keys(found).length > 0) return

    setPending(true)
    const result = await service.updatePassword(draft.password)
    setPending(false)
    setDraft({ password: '', confirmPassword: '' })
    if (!result.ok) {
      setFailure(result.code)
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <div className="stack">
        <h2>Your password has been changed</h2>
        <Notice tone="success" role="status"><p>You’re signed in with your new password.</p></Notice>
        <div className="cluster">
          <Link className="btn btn--primary" to="/dashboard">Go to my dashboard</Link>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="form" aria-label="Choose a new password">
      {failure && (
        <Notice tone="danger" role="alert">
          <p>{authErrorMessage[failure]}{failure === 'session_expired' && <> <Link to="/forgot-password">Ask for a new link</Link>.</>}</p>
        </Notice>
      )}
      <Field label="New password" error={errors.password} hint={`At least ${PASSWORD_MIN} characters. A few random words works well.`}>
        {(a) => <input id={a.id} className="input" type="password" value={draft.password} autoComplete="new-password" maxLength={PASSWORD_MAX + 20} aria-describedby={a.describedBy} aria-invalid={a.invalid} onChange={(e) => set('password', e.target.value)} />}
      </Field>
      <Field label="Confirm new password" error={errors.confirmPassword}>
        {(a) => <input id={a.id} className="input" type="password" value={draft.confirmPassword} autoComplete="new-password" maxLength={PASSWORD_MAX + 20} aria-describedby={a.describedBy} aria-invalid={a.invalid} onChange={(e) => set('confirmPassword', e.target.value)} />}
      </Field>
      <button type="submit" className="btn btn--primary btn--block" disabled={pending}>
        {pending ? 'Saving…' : 'Save new password'}
      </button>
    </form>
  )
}

/** "Send the confirmation email again". The answer is the same for every address, so it never reveals who has an account. */
function ResendConfirmation({ service, email }: { service: AuthService; email: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'need_email' | AuthErrorCode>('idle')
  async function resend() {
    if (state === 'sending') return
    if (validateResetRequest(email)) {
      setState('need_email')
      return
    }
    setState('sending')
    const r = await service.resendConfirmation(email)
    setState(r.ok ? 'sent' : r.code)
  }
  const failed = state !== 'idle' && state !== 'sending' && state !== 'sent' && state !== 'need_email'
  return (
    <div className="stack">
      <div>
        <button type="button" className="btn btn--ghost btn--sm" disabled={state === 'sending'} onClick={resend}>
          {state === 'sending' ? 'Sending…' : 'Send the confirmation email again'}
        </button>
      </div>
      {state === 'sent' && <Notice tone="success" role="status"><p>If that address has an account waiting to be confirmed, a new link is on its way.</p></Notice>}
      {state === 'need_email' && <Notice tone="warn" role="status"><p>Please enter your email address first.</p></Notice>}
      {failed && <Notice tone="danger" role="alert"><p>{authErrorMessage[state as AuthErrorCode]}</p></Notice>}
    </div>
  )
}
