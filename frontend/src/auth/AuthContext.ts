import { createContext, useContext } from 'react'

import type { User } from '../api/types'

export type AuthStatus = 'anonymous' | 'loading' | 'authenticated' | 'error'

export interface AuthContextValue {
  status: AuthStatus
  /** The logged-in user, or null unless status is 'authenticated'. */
  user: User | null
  /** True after the server rejected a saved token; the login page explains why. */
  sessionExpired: boolean
  /** True after the user clicked "Log out", until the next login. */
  signedOutByUser: boolean
  /** Save a token and user returned by login or signup. */
  signIn: (token: string, user: User) => void
  signOut: () => void
  /** After an 'error' status (server unreachable), try loading the user again. */
  retry: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (value === null) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}

export const ME_QUERY_KEY = ['me'] as const
