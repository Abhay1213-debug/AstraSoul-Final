import { createContext, useContext } from 'react'
import type { AuthService, AuthUser } from './types'

export type AuthState =
  | { status: 'unavailable' } // accounts are not switched on (the default): pages explain this honestly
  | { status: 'loading' }
  | { status: 'signed_out' }
  | { status: 'signed_in'; user: AuthUser }

export interface AuthContextValue {
  state: AuthState
  service: AuthService | null
}

/** Default value = "unavailable", so every page works unchanged when no provider is mounted (and in the existing tests). */
export const AuthContext = createContext<AuthContextValue>({ state: { status: 'unavailable' }, service: null })

export const useAuth = () => useContext(AuthContext)
