import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Navigate, NavLink } from 'react-router-dom'
import { authErrorMessage, useAuth, type AuthErrorCode, type MfaState } from '../lib/auth'
import { useData } from '../lib/data'
import { usePageTitle } from '../hooks/usePageTitle'
import { Authenticator } from './Authenticator'
import { Notice, PageHero } from './ui'

/** Shows the children only once the session is at authenticator level 2; otherwise asks for the code (or the set-up). */
function MfaGate({ children }: { children: ReactNode }) {
  const { service } = useAuth()
  const [mfa, setMfa] = useState<MfaState | null>(null)
  const [failure, setFailure] = useState<AuthErrorCode | null>(null)

  const refresh = useCallback(async () => {
    if (!service) return
    const r = await service.getMfaState()
    if (r.ok) {
      setMfa(r.data)
      setFailure(null)
    } else setFailure(r.code)
  }, [service])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (!service) return null
  if (failure && !mfa) return <Notice tone="danger" role="alert"><p>{authErrorMessage[failure]}</p></Notice>
  if (!mfa) return <Notice role="status"><p>Checking your sign-in level…</p></Notice>
  if (mfa.level === 'aal2') return <>{children}</>
  return (
    <Authenticator
      mfa={mfa}
      onDone={refresh}
      intro="Administrator and expert logins need a second step. Until you complete it, the database shows you nothing from the admin area, even though you are logged in."
    />
  )
}

const adminLinks = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/requests', label: 'Requests' },
  { to: '/admin/services', label: 'Services & prices' },
  { to: '/admin/experts', label: 'Experts' },
  { to: '/admin/settings', label: 'Payment settings' },
  { to: '/admin/audit', label: 'Activity log' },
]
const staffLinks = [{ to: '/staff', label: 'My assigned requests', end: true }]

/**
 * Wraps every admin / expert screen: you must be logged in, the database must say your login has that role, and you must have
 * passed the authenticator step. NOTE: this is a convenience for honest users. What actually protects the data is the database:
 * even if someone bypassed this screen, it would return nothing for an account without the role and the authenticator.
 */
export function AdminShell({ area, title, children }: { area: 'admin' | 'staff'; title: string; children: ReactNode }) {
  const { state } = useAuth()
  const { service, role } = useData()
  usePageTitle(title)

  if (state.status === 'unavailable' || !service) return <Navigate to="/dashboard" replace />
  if (state.status === 'signed_out') return <Navigate to={`/login?next=${encodeURIComponent(area === 'admin' ? '/admin' : '/staff')}`} replace />

  const wrong = role.status === 'none' || (area === 'admin' && role.status === 'staff') || (area === 'staff' && role.status === 'admin')
  const links = area === 'admin' ? adminLinks : staffLinks

  return (
    <>
      <PageHero eyebrow={area === 'admin' ? 'Administrator area' : 'Expert area'} title={title} />
      <section className="section">
        <div className="container stack">
          {state.status === 'loading' || role.status === 'loading' ? (
            <Notice role="status"><p>Checking your access…</p></Notice>
          ) : wrong ? (
            <Notice tone="warn" role="status">
              <p><strong>This area is not available to your account.</strong> If you should have access, please ask the person who manages the site. Access is granted by the site owner directly in the database and can’t be requested here.</p>
            </Notice>
          ) : (
            <>
              <nav aria-label={area === 'admin' ? 'Admin sections' : 'Expert sections'} className="cluster">
                {links.map((l) => (
                  <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `btn btn--sm ${isActive ? 'btn--dark' : 'btn--ghost'}`}>{l.label}</NavLink>
                ))}
              </nav>
              <MfaGate>{children}</MfaGate>
            </>
          )}
        </div>
      </section>
    </>
  )
}
