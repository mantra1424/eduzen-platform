import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'

import { onUnauthorized } from '../api/client'
import { api } from '../api/endpoints'
import { clearToken, getToken, setToken } from '../api/token'
import type { User } from '../api/types'
import { AuthContext, type AuthContextValue, type AuthStatus, ME_QUERY_KEY } from './AuthContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [hasToken, setHasToken] = useState(() => getToken() !== null)
  const [sessionExpired, setSessionExpired] = useState(false)

  // Ask the server who we are, but only if there is a token to ask with.
  const me = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: ({ signal }) => api.me(signal),
    enabled: hasToken,
    staleTime: 5 * 60_000,
  })

  const signOut = useCallback(() => {
    clearToken()
    // Forget every cached response, so the next user on this browser sees none of it.
    queryClient.clear()
    setHasToken(false)
  }, [queryClient])

  // The API client calls this when the server rejects our saved token.
  useEffect(
    () =>
      onUnauthorized(() => {
        setSessionExpired(true)
        signOut()
      }),
    [signOut],
  )

  const signIn = useCallback(
    (token: string, user: User) => {
      setToken(token)
      queryClient.clear() // drop anything cached for a previous user
      queryClient.setQueryData(ME_QUERY_KEY, user) // we already know who this is
      setSessionExpired(false)
      setHasToken(true)
    },
    [queryClient],
  )

  let status: AuthStatus
  if (!hasToken) status = 'anonymous'
  else if (me.data) status = 'authenticated'
  else if (me.isError) status = 'error'
  else status = 'loading'

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: status === 'authenticated' ? (me.data ?? null) : null,
      sessionExpired,
      signIn,
      signOut,
      retry: () => void me.refetch(),
    }),
    [status, me, sessionExpired, signIn, signOut],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
