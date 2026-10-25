import { Link, Navigate, Outlet, useLocation } from 'react-router'

import type { UserRole } from '../api/types'

import { useSlowNotice, WAKING_MESSAGE } from '../wake'
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

/** "Loading…", then an explanation if it takes long (the server may be waking up). */
function LoadingMessage() {
  const slow = useSlowNotice(true)
  return <FullPageMessage>{slow ? WAKING_MESSAGE : 'Loading…'}</FullPageMessage>
}

/** Pages inside this need a logged-in user; everyone else is sent to /login. */
export function RequireAuth() {
  const { status, signedOutByUser } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <LoadingMessage />
  if (status === 'error') return <ServerUnreachable />
  if (status === 'anonymous') {
    // Remember the page for visitors and expired sessions, so they can carry on after
    // logging in. Not after "Log out": the next person may not even be allowed there.
    const state: RedirectState | undefined = signedOutByUser
      ? undefined
      : { from: location.pathname + location.search }
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

  if (status === 'loading') return <LoadingMessage />
  if (status === 'authenticated') {
    const from = (location.state as RedirectState | null)?.from
    return <Navigate to={safeRedirectPath(from)} replace />
  }
  return <Outlet />
}

/** Pages inside this are only for some roles. Use inside RequireAuth. */
export function RequireRole({ roles }: { roles: UserRole[] }) {
  const { user } = useAuth()
  if (!user || !roles.includes(user.role)) {
    return (
      <section>
        <h1>You don't have access to this page</h1>
        <p className="muted">Ask your organisation's admin if you think you should.</p>
        <Link to="/">Go to the dashboard</Link>
      </section>
    )
  }
  return <Outlet />
}
