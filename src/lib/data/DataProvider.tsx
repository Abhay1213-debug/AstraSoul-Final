import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '../auth'
import { accountsEnabled } from '../auth/createAuthService'
import { DataContext, type RoleState } from './dataContext'
import { loadDefaultDataService } from './createDataService'
import type { DataService } from './types'

/**
 * Provides the data service and the signed-in account's role. `service` is only passed by tests; in the real site the service
 * is chosen from the configuration and is null unless accounts are explicitly switched on.
 * The role is for SHOWING the right menu. It decides nothing: the database refuses anything the account is not allowed to do.
 */
export function DataProvider({ service, children }: { service?: DataService | null; children: ReactNode }) {
  const { state } = useAuth()
  const [svc, setSvc] = useState<DataService | null>(service ?? null)
  const [role, setRole] = useState<RoleState>({ status: 'none' })
  const userId = state.status === 'signed_in' ? state.user.id : null

  useEffect(() => {
    if (service !== undefined) {
      setSvc(service)
      return
    }
    if (!accountsEnabled()) return
    let cancelled = false
    void loadDefaultDataService().then((s) => {
      if (!cancelled) setSvc(s)
    })
    return () => {
      cancelled = true
    }
  }, [service])

  useEffect(() => {
    if (!svc || !userId) {
      setRole({ status: 'none' })
      return
    }
    let cancelled = false
    setRole({ status: 'loading' })
    void svc.getMyStaffRole().then((r) => {
      if (cancelled) return
      if (r.ok && r.data && r.data.active) setRole({ status: r.data.role, info: r.data })
      else setRole({ status: 'none' })
    })
    return () => {
      cancelled = true
    }
  }, [svc, userId])

  const value = useMemo(() => ({ service: svc, role }), [svc, role])
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}
