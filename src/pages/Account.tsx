import { CalendarClock, FileText, History, UserRound } from 'lucide-react'
import { ButtonLink, Notice, PageHero, StatusBadge } from '../components/ui'
import { featureStatus } from '../config/site'
import { usePageTitle } from '../hooks/usePageTitle'

const planned = [
  { icon: UserRound, t: 'Profile & saved details', d: 'Save your details once so you don’t re-enter them for each request.' },
  { icon: CalendarClock, t: 'Consultation requests & status', d: 'See whether a request is submitted, awaiting confirmation, confirmed, completed, cancelled or refunded.' },
  { icon: History, t: 'Consultation history', d: 'Look back at past consultations and request another.' },
  { icon: FileText, t: 'Your guidance reports', d: 'Download the PDF report from each completed consultation — visible only to you.' },
]

export function AuthUnavailable({ mode }: { mode: 'login' | 'signup' }) {
  usePageTitle(mode === 'login' ? 'Log in' : 'Sign up')
  const isLogin = mode === 'login'
  return (
    <>
      <PageHero eyebrow="Your account" title={isLogin ? 'Log in' : 'Create an account'} lede="Customer accounts are the next stage of development." />
      <section className="section">
        <div className="container container--narrow stack">
          <Notice tone="warn" role="status">
            <p><strong>{isLogin ? 'Logging in' : 'Registration'} isn’t available yet.</strong> Accounts need secure authentication and a database, which are not connected in this version. We haven’t built a fake form, because nothing you typed could be saved or kept safe.</p>
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

export const Login = () => <AuthUnavailable mode="login" />
export const Signup = () => <AuthUnavailable mode="signup" />

export function Dashboard() {
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
