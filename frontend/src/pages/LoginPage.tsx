import { useMutation } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { Link } from 'react-router'

import { api } from '../api/endpoints'
import { useAuth } from '../auth/AuthContext'

export function LoginPage() {
  const { signIn, sessionExpired } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const login = useMutation({
    mutationFn: () => api.login(email, password),
    // GuestOnly then sends the user on to where they were going.
    onSuccess: (result) => signIn(result.access_token, result.user),
  })

  function handleSubmit(event: FormEvent) {
    event.preventDefault() // stop the browser's own form submit (a full page reload)
    login.mutate()
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
    </section>
  )
}
