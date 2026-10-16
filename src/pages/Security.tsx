import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Authenticator } from '../components/Authenticator'
import { ButtonLink, Notice, PageHero } from '../components/ui'
import { usePageTitle } from '../hooks/usePageTitle'
import { authErrorMessage, useAuth, type AuthErrorCode, type MfaState } from '../lib/auth'

/**
 * Any logged-in person can set up an authenticator app here. Administrators and experts need one BEFORE the site owner can give
 * them their role (the database refuses a role for a login without a verified authenticator), so this page cannot be behind the
 * admin area. Setting one up grants no access by itself.
 */
export default function Security() {
  const { state, service } = useAuth()
  usePageTitle('Account security')
  const [mfa, setMfa] = useState<MfaState | null>(null)
  const [failure, setFailure] = useState<AuthErrorCode | null>(null)
  const signedIn = state.status === 'signed_in'

  const refresh = useCallback(async () => {
    if (!service) return
    const r = await service.getMfaState()
    if (r.ok) { setMfa(r.data); setFailure(null) } else setFailure(r.code)
  }, [service])
  useEffect(() => { if (signedIn) void refresh() }, [signedIn, refresh])

  if (state.status === 'unavailable' || !service) return <Navigate to="/dashboard" replace />
  if (state.status === 'signed_out') return <Navigate to="/login?next=%2Fdashboard%2Fsecurity" replace />

  return (
    <>
      <PageHero eyebrow="Your account" title="Account security" lede="An authenticator app adds a second step to your login." crumbs={[{ to: '/dashboard', label: 'Dashboard' }, { label: 'Security' }]} />
      <section className="section">
        <div className="container container--narrow stack">
          {state.status === 'loading' || (!mfa && !failure) ? <Notice role="status"><p>Checking…</p></Notice> : null}
          {failure && !mfa && <Notice tone="danger" role="alert"><p>{authErrorMessage[failure]}</p></Notice>}
          {mfa?.verifiedFactorId && mfa.level === 'aal2' && (
            <Notice tone="success" role="status"><p><strong>Your authenticator is set up and verified for this session.</strong> Administrators and experts: tell the site owner your login email so your role can be granted.</p></Notice>
          )}
          {mfa?.verifiedFactorId && mfa.level === 'aal1' && <Authenticator mfa={mfa} onDone={refresh} intro="You already have an authenticator. Enter its current code to verify this session." />}
          {mfa && !mfa.verifiedFactorId && (
            <Authenticator mfa={mfa} onDone={refresh} intro="Customers don’t need this. Administrators and experts must set it up before they can be given access." />
          )}
          <div><ButtonLink to="/dashboard" variant="ghost">Back to my dashboard</ButtonLink></div>
        </div>
      </section>
    </>
  )
}
