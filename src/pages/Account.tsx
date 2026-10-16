import { CalendarClock, History, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { ForgotPasswordForm, LoginForm, ResetPasswordForm, SignupForm } from '../components/AuthForms'
import { ProfileCard } from '../components/ProfileCard'
import { RequestRow, dashboardUpdates } from '../components/RequestParts'
import { siteConfig } from '../config/site'
import { ButtonLink, Notice, PageHero, StatusBadge } from '../components/ui'
import { featureStatus } from '../config/site'
import { usePageTitle } from '../hooks/usePageTitle'
import { useLoad } from '../hooks/useLoad'
import { firstName, safeNext as safeNextFrom, useAuth } from '../lib/auth'
import { dataErrorMessage, useData } from '../lib/data'

const planned = [
  { icon: UserRound, t: 'Profile & saved details', d: 'Save your details once so you don’t re-enter them for each request.' },
  { icon: CalendarClock, t: 'Consultation requests & status', d: 'See whether a request is submitted, awaiting confirmation, confirmed, completed or cancelled.' },
  { icon: History, t: 'Consultation history', d: 'Look back at past consultations and request another.' },
]

const unavailableCopy = {
  login: { title: 'Log in', doing: 'Logging in' },
  signup: { title: 'Create an account', doing: 'Registration' },
  reset: { title: 'Reset your password', doing: 'Password reset' },
} as const

export function AuthUnavailable({ mode }: { mode: 'login' | 'signup' | 'reset' }) {
  const copy = unavailableCopy[mode]
  usePageTitle(mode === 'signup' ? 'Sign up' : copy.title)
  return (
    <>
      <PageHero eyebrow="Your account" title={copy.title} lede="Customer accounts are the next stage of development." />
      <section className="section">
        <div className="container container--narrow stack">
          <Notice tone="warn" role="status">
            <p><strong>{copy.doing} isn’t available yet.</strong> Accounts need secure authentication and a database, which are not connected in this version. We haven’t built a fake form, because nothing you typed could be saved or kept safe.</p>
          </Notice>
          <StatusBadge status={featureStatus.accounts} />
          <p>In the meantime you can try the free insight or prepare a consultation request without an account.</p>
          <div className="cluster">
            <ButtonLink to="/free-insight" variant="ghost">Free insight</ButtonLink>
            <ButtonLink to="/consultation/request" arrow>Start a consultation request</ButtonLink>
          </div>
        </div>
      </section>
    </>
  )
}

function CheckingAccount({ title }: { title: string }) {
  usePageTitle(title)
  return (
    <>
      <PageHero eyebrow="Your account" title={title} lede="One moment." />
      <section className="section">
        <div className="container container--narrow">
          <Notice role="status"><p>Checking your account…</p></Notice>
        </div>
      </section>
    </>
  )
}

/** Log in. When accounts are not switched on (the default) this is the honest "not available yet" page. */
export function Login() {
  const { state, service } = useAuth()
  const [params] = useSearchParams()
  usePageTitle('Log in')
  if (state.status === 'unavailable' || !service) return <AuthUnavailable mode="login" />
  if (state.status === 'loading') return <CheckingAccount title="Log in" />
  if (state.status === 'signed_in') return <Navigate to={safeNextFrom(params.get('next'))} replace />
  return (
    <>
      <PageHero eyebrow="Your account" title="Log in" lede="Welcome back." />
      <section className="section">
        <div className="container container--narrow">
          <div className="card card--flat">
            <LoginForm service={service} next={params.get('next')} />
          </div>
        </div>
      </section>
    </>
  )
}

/** Create an account. Same rule: honest "not available yet" unless accounts are switched on. */
export function Signup() {
  const { state, service } = useAuth()
  usePageTitle('Sign up')
  if (state.status === 'unavailable' || !service) return <AuthUnavailable mode="signup" />
  if (state.status === 'loading') return <CheckingAccount title="Create an account" />
  if (state.status === 'signed_in') return <Navigate to="/dashboard" replace />
  return (
    <>
      <PageHero eyebrow="Your account" title="Create an account" lede="Save your details once and keep track of your consultation requests." />
      <section className="section">
        <div className="container container--narrow">
          <div className="card card--flat">
            <SignupForm service={service} />
          </div>
        </div>
      </section>
    </>
  )
}

/** Ask for a reset email. Not available unless accounts are switched on. */
export function ForgotPassword() {
  const { state, service } = useAuth()
  usePageTitle('Reset your password')
  if (state.status === 'unavailable' || !service) return <AuthUnavailable mode="reset" />
  if (state.status === 'loading') return <CheckingAccount title="Reset your password" />
  if (state.status === 'signed_in') return <Navigate to="/dashboard" replace />
  return (
    <>
      <PageHero eyebrow="Your account" title="Reset your password" lede="Forgotten your password? We’ll email you a link." />
      <section className="section">
        <div className="container container--narrow">
          <div className="card card--flat">
            <ForgotPasswordForm service={service} />
          </div>
        </div>
      </section>
    </>
  )
}

/**
 * Where the emailed link lands. Opening the link signs the person in temporarily (the sign-in library does this before the page
 * looks), so "signed in" here means "may choose a new password". Anyone else just sees that the link isn’t valid.
 */
export function ResetPassword() {
  const { state, service } = useAuth()
  usePageTitle('Choose a new password')
  if (state.status === 'unavailable' || !service) return <AuthUnavailable mode="reset" />
  if (state.status === 'loading') return <CheckingAccount title="Choose a new password" />
  return (
    <>
      <PageHero eyebrow="Your account" title="Choose a new password" lede="Pick something new that you don’t use anywhere else." />
      <section className="section">
        <div className="container container--narrow">
          {state.status === 'signed_in' ? (
            <div className="card card--flat">
              <ResetPasswordForm service={service} email={state.user.email} />
            </div>
          ) : (
            <div className="stack">
              <Notice tone="warn" role="status">
                <p><strong>This link isn’t valid any more.</strong> It may have expired or already been used, or this page was opened without the link from the email.</p>
              </Notice>
              <div className="cluster">
                <ButtonLink to="/forgot-password" arrow>Ask for a new link</ButtonLink>
                <ButtonLink to="/login" variant="ghost">Log in</ButtonLink>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  )
}

function DashboardUnavailable() {
  usePageTitle('Dashboard')
  return (
    <>
      <PageHero eyebrow="Customer dashboard" title="Your dashboard" lede="This is what your dashboard will contain once accounts are available.">
        <StatusBadge status={featureStatus.dashboard} />
      </PageHero>
      <section className="section">
        <div className="container stack">
          <Notice tone="warn" role="status">
            <p><strong>The dashboard isn’t available yet.</strong> There is no login, so there are no requests, bookings or reports to show, and we don’t display sample data as if it were yours. Below is what is planned.</p>
          </Notice>
          <div className="grid grid--2">
            {planned.map(({ icon: Icon, t, d }) => (
              <div className="card card--flat" key={t}>
                <span className="card__icon"><Icon size={24} strokeWidth={1.6} aria-hidden="true" /></span>
                <h3>{t}</h3>
                <p>{d}</p>
                <div className="card__foot"><span className="badge badge--planned">Planned</span></div>
              </div>
            ))}
          </div>
          <div className="cluster">
            <ButtonLink to="/consultation/request" arrow>Start a consultation request</ButtonLink>
          </div>
        </div>
      </section>
    </>
  )
}

function SignedInDashboard({ fullName, email, onSignOut }: { fullName: string; email: string; onSignOut: () => Promise<void> }) {
  usePageTitle('Dashboard')
  const { service, role } = useData()
  const [leaving, setLeaving] = useState(false)
  const profile = useLoad(service ? () => service.getMyProfile() : null, [service])
  const requests = useLoad(service ? () => service.listMyRequests() : null, [service])

  return (
    <>
      <PageHero eyebrow="Customer dashboard" title={`Welcome, ${firstName(fullName)}`} lede="Your requests, payments and details in one place." />
      <section className="section">
        <div className="container stack">
          <p className="hint" style={{ margin: 0 }}>Signed in as {email}.</p>

          {(role.status === 'admin' || role.status === 'staff') && (
            <Notice role="status">
              <p>
                <strong>{role.status === 'admin' ? 'You have an administrator login.' : 'You have an expert login.'}</strong>{' '}
                <Link to={role.status === 'admin' ? '/admin' : '/staff'}>{role.status === 'admin' ? 'Open the admin area' : 'Open your assigned requests'}</Link>
              </p>
            </Notice>
          )}

          <div className="cluster">
            <ButtonLink to="/consultation/request" arrow>Start a consultation request</ButtonLink>
          </div>

          {requests.state.status === 'done' && dashboardUpdates(requests.state.data).length > 0 && (
            <section className="stack" aria-labelledby="updates-heading">
              <h2 id="updates-heading" style={{ fontSize: 'var(--fs-h3)' }}>Updates for you</h2>
              {dashboardUpdates(requests.state.data).map((u) => (
                <Notice key={u.key} tone={u.tone} role="status"><p>{u.text} <Link to={u.to}>Open</Link></p></Notice>
              ))}
            </section>
          )}

          <section className="stack" aria-labelledby="requests-heading">
            <h2 id="requests-heading" style={{ fontSize: 'var(--fs-h3)' }}>Your requests</h2>
            {!service && <Notice tone="warn" role="status"><p>Online requests aren’t switched on yet, so there is nothing to show here. You can still prepare a request and send it to us by email.</p></Notice>}
            {requests.state.status === 'loading' && service && <Notice role="status"><p>Loading your requests…</p></Notice>}
            {requests.state.status === 'error' && <Notice tone="danger" role="alert"><p>{dataErrorMessage[requests.state.code]}</p></Notice>}
            {requests.state.status === 'done' && requests.state.data.length === 0 && (
              <Notice role="status">
                <p><strong>You haven’t sent a request yet.</strong> When you do, you’ll see it here with its status, payment and your expert, once assigned.</p>
              </Notice>
            )}
            {requests.state.status === 'done' && requests.state.data.length > 0 && (
              <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {requests.state.data.map((r) => <RequestRow key={r.id} r={r} />)}
              </ul>
            )}
          </section>

          {service && profile.state.status === 'done' && profile.state.data && (
            <ProfileCard profile={profile.state.data} service={service} onSaved={profile.reload} />
          )}
          {service && profile.state.status === 'done' && !profile.state.data && (
            <Notice tone="warn" role="status"><p>Your profile isn’t ready yet. Please log out and log in again.</p></Notice>
          )}

          <section className="card card--flat" aria-labelledby="help-heading">
            <h2 id="help-heading" style={{ fontSize: 'var(--fs-h3)' }}>Privacy and account help</h2>
            <p style={{ margin: 0 }}>
              To correct your details, ask about your data, or ask us to close your account and remove your personal details, please{' '}
              {siteConfig.contactEmail ? <a href={`mailto:${siteConfig.contactEmail}?subject=${encodeURIComponent('Account or privacy request')}`}>email us</a> : <Link to="/contact">contact us</Link>}.
              Closing an account does not happen automatically from this page. Some records, such as payments, may be kept in a form that no longer identifies you; our <Link to="/privacy">Privacy Policy</Link> explains what we keep.
            </p>
          </section>

          <div className="cluster">
            <ButtonLink to="/dashboard/security" variant="ghost">Account security</ButtonLink>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={leaving}
              onClick={async () => {
                setLeaving(true)
                await onSignOut()
                setLeaving(false)
              }}
            >
              {leaving ? 'Logging out…' : 'Log out'}
            </button>
          </div>
        </div>
      </section>
    </>
  )
}

/**
 * The customer dashboard. The "send people to log in" step below is a CONVENIENCE for honest visitors; it is not what
 * keeps data private. Privacy is enforced by the database (Row Level Security), whatever this screen does.
 */
export function Dashboard() {
  const { state, service } = useAuth()
  const navigate = useNavigate()
  if (state.status === 'unavailable' || !service) return <DashboardUnavailable />
  if (state.status === 'loading') return <CheckingAccount title="Your dashboard" />
  if (state.status === 'signed_out') return <Navigate to="/login?next=%2Fdashboard" replace />
  return (
    <SignedInDashboard
      fullName={state.user.fullName}
      email={state.user.email}
      onSignOut={async () => {
        const result = await service.signOut()
        if (result.ok) navigate('/', { replace: true })
      }}
    />
  )
}
