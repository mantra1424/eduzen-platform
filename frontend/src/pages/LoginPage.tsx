import { useMutation } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { Link } from 'react-router'

import { api } from '../api/endpoints'
import { useAuth } from '../auth/AuthContext'
import { DEMO_ORGS, DEMO_PASSWORD, isDemoMode } from '../demo'
import { isServerWaking, useSlowNotice, useWakeServer, WAKING_MESSAGE } from '../wake'

export function LoginPage() {
  const { signIn, sessionExpired } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  useWakeServer()

  const login = useMutation({
    mutationFn: (credentials: { email: string; password: string }) =>
      api.login(credentials.email, credentials.password),
    // Logging in twice is harmless, so retry while the server is still starting.
    retry: (failureCount, error) => isServerWaking(error) && failureCount < 2,
    retryDelay: 2000,
    // GuestOnly then sends the user on to where they were going.
    onSuccess: (result) => signIn(result.access_token, result.user),
  })

  const slow = useSlowNotice(login.isPending)

  function handleSubmit(event: FormEvent) {
    event.preventDefault() // stop the browser's own form submit (a full page reload)
    login.mutate({ email, password })
  }

  return (
    <section className="auth-page">
      <h1>Log in</h1>

      {sessionExpired && !login.isError && (
        <p className="notice" role="status">
          Your session has expired. Please log in again.
        </p>
      )}

      <form className="form" onSubmit={handleSubmit}>
        <label>
          Email
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label>
          Password
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {slow && (
          <p className="notice" role="status">
            {WAKING_MESSAGE}
          </p>
        )}
        {login.isError && (
          <p className="error" role="alert">
            {login.error.message}
          </p>
        )}

        <button type="submit" disabled={login.isPending}>
          {login.isPending ? 'Logging in…' : 'Log in'}
        </button>
      </form>

      <p className="muted">
        New organisation? <Link to="/signup">Create an account</Link>
      </p>

      {isDemoMode() && (
        <section className="card demo-box" aria-labelledby="demo-heading">
          <h2 id="demo-heading">Try the demo</h2>
          <p className="muted small">
            Sample data, reset every night. Log in with one click as any role:
          </p>
          {DEMO_ORGS.map((org) => (
            <div key={org.name} className="demo-org">
              <span className="demo-org-name">{org.name}</span>
              <div className="button-row start">
                {org.accounts.map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    className="secondary small"
                    aria-label={`Log in to ${org.name} as ${account.label}`}
                    disabled={login.isPending}
                    onClick={() => login.mutate({ email: account.email, password: DEMO_PASSWORD })}
                  >
                    {account.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </section>
  )
}
