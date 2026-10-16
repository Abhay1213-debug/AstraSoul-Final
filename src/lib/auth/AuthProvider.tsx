import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AuthContext, type AuthState } from './authContext'
import { accountsEnabled, loadDefaultAuthService } from './createAuthService'
import type { AuthService } from './types'

/**
 * Keeps track of who is signed in. `service` is only passed by tests; in the real site the service is chosen from the
 * configuration and is null - "unavailable" - unless accounts are explicitly switched on.
 */
export function AuthProvider({ service, children }: { service?: AuthService | null; children: ReactNode }) {
  // undefined = not decided yet (the real service is being loaded); null = accounts unavailable
  const [svc, setSvc] = useState<AuthService | null | undefined>(service)
  const [state, setState] = useState<AuthState>(() => {
    if (service === null) return { status: 'unavailable' }
    if (service !== undefined) return { status: 'loading' }
    return accountsEnabled() ? { status: 'loading' } : { status: 'unavailable' }
  })

  // Step 1: decide which service to use
  useEffect(() => {
    if (service !== undefined) {
      setSvc(service)
      return
    }
    if (!accountsEnabled()) {
      setSvc(null)
      return
    }
    let cancelled = false
    void loadDefaultAuthService().then((s) => {
      if (!cancelled) setSvc(s)
    })
    return () => {
      cancelled = true
    }
  }, [service])

  // Step 2: find out who is signed in, and keep listening
  useEffect(() => {
    if (svc === undefined) return
    if (svc === null) {
      setState({ status: 'unavailable' })
      return
    }
    let cancelled = false
    const apply = (user: Awaited<ReturnType<AuthService['getUser']>>) => {
      if (!cancelled) setState(user ? { status: 'signed_in', user } : { status: 'signed_out' })
    }
    void svc.getUser().then(apply)
    const unsubscribe = svc.onChange(apply)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [svc])

  const value = useMemo(() => ({ state, service: svc ?? null }), [state, svc])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
