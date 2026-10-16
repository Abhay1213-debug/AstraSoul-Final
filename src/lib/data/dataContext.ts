import { createContext, useContext } from 'react'
import type { DataService, StaffRoleInfo } from './types'

/** What this signed-in account is, as far as the database says: nothing special, an expert (staff) login, or an administrator. */
export type RoleState =
  | { status: 'none' } // not signed in, accounts off, or an ordinary customer
  | { status: 'loading' }
  | { status: 'staff'; info: StaffRoleInfo }
  | { status: 'admin'; info: StaffRoleInfo }

export interface DataContextValue {
  service: DataService | null
  role: RoleState
}

/** Default = "no data service, no role", so every page works unchanged when no provider is mounted (and in the existing tests). */
export const DataContext = createContext<DataContextValue>({ service: null, role: { status: 'none' } })

export const useData = () => useContext(DataContext)
