import { Navigate, Outlet, useLocation } from 'react-router'

import { useAuth } from './AuthContext'
import { safeRedirectPath } from './redirect'

/** Where RequireAuth was heading, passed to the login page in router state. */
export interface RedirectState {
  from?: string
}

function FullPageMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="full-page-message" role="status" aria-live="polite">
      {children}
    </div>
  )
}

function ServerUnreachable() {
  const { retry, signOut } = useAuth()
  return (
    <FullPageMessage>
      <p>We can't reach the server right now.</p>
      <div className="button-row">
        <button type="button" onClick={retry}>
          Try again
        </button>
        <button type="button" className="secondary" onClick={signOut}>
          Log out
        </button>
      </div>
    </FullPageMessage>
  )
}

/** Pages inside this need a logged-in user; everyone else is sent to /login. */
export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <FullPageMessage>Loading…</FullPageMessage>
  if (status === 'error') return <ServerUnreachable />
  if (status === 'anonymous') {
    const state: RedirectState = { from: location.pathname + location.search }
    return <Navigate to="/login" replace state={state} />
  }
  return <Outlet />
}

/**
 * Login and signup: logged-in users are sent into the app instead, to the page
 * RequireAuth remembered (or home). This is also what moves the user on right
 * after they log in or sign up, so the pages themselves never navigate.
 */
export function GuestOnly() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <FullPageMessage>Loading…</FullPageMessage>
  if (status === 'authenticated') {
    const from = (location.state as RedirectState | null)?.from
    return <Navigate to={safeRedirectPath(from)} replace />
  }
  return <Outlet />
}
