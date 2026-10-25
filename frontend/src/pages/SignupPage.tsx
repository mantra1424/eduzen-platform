import { useMutation } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { Link } from 'react-router'

import { api } from '../api/endpoints'
import type { OrgType } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { slugify } from '../auth/slug'
import { useSlowNotice, useWakeServer, WAKING_MESSAGE } from '../wake'

export function SignupPage() {
  const { signIn } = useAuth()

  const [orgName, setOrgName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [orgType, setOrgType] = useState<OrgType>('college')
  const [adminName, setAdminName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  useWakeServer()

  // Not retried automatically: if the first attempt went through, a retry would fail
  // with "already taken", which would be confusing.
  const signup = useMutation({
    mutationFn: () =>
      api.signup({
        org_name: orgName,
        slug,
        type: orgType,
        admin_name: adminName,
        admin_email: email,
        admin_password: password,
      }),
    // GuestOnly then sends the new admin into the app.
    onSuccess: (result) => signIn(result.access_token, result.user),
  })

  const slow = useSlowNotice(signup.isPending)

  function handleOrgNameChange(value: string) {
    setOrgName(value)
    if (!slugEdited) setSlug(slugify(value)) // keep suggesting until the user takes over
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    signup.mutate()
  }

  return (
    <section className="auth-page">
      <h1>Create your organisation</h1>
      <p className="muted">You'll be its first admin, and can add everyone else afterwards.</p>

      <form className="form" onSubmit={handleSubmit}>
        <fieldset>
          <legend>Organisation</legend>

          <label>
            Name
            <input
              name="org_name"
              required
              maxLength={200}
              value={orgName}
              onChange={(e) => handleOrgNameChange(e.target.value)}
            />
          </label>

          <div className="field">
            <label htmlFor="slug">URL name</label>
            <input
              id="slug"
              name="slug"
              required
              minLength={3}
              maxLength={50}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              title="Lowercase letters, numbers and single hyphens, e.g. svmit-college"
              aria-describedby="slug-hint"
              value={slug}
              onChange={(e) => {
                setSlugEdited(true)
                setSlug(e.target.value.toLowerCase())
              }}
            />
            <small id="slug-hint" className="muted">
              Lowercase letters, numbers and hyphens, e.g. svmit-college
            </small>
          </div>

          <div role="radiogroup" aria-label="Type" className="radio-row">
            <label className="radio">
              <input
                type="radio"
                name="type"
                value="college"
                checked={orgType === 'college'}
                onChange={() => setOrgType('college')}
              />
              College
            </label>
            <label className="radio">
              <input
                type="radio"
                name="type"
                value="company"
                checked={orgType === 'company'}
                onChange={() => setOrgType('company')}
              />
              Company
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Your admin account</legend>

          <label>
            Your name
            <input
              name="admin_name"
              autoComplete="name"
              required
              maxLength={200}
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
            />
          </label>

          <label>
            Email
            <input
              type="email"
              name="admin_email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <div className="field">
            <label htmlFor="admin_password">Password</label>
            <input
              id="admin_password"
              type="password"
              name="admin_password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
              aria-describedby="password-hint"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <small id="password-hint" className="muted">
              At least 8 characters
            </small>
          </div>
        </fieldset>

        {slow && (
          <p className="notice" role="status">
            {WAKING_MESSAGE}
          </p>
        )}
        {signup.isError && (
          <p className="error" role="alert">
            {signup.error.message}
          </p>
        )}

        <button type="submit" disabled={signup.isPending}>
          {signup.isPending ? 'Creating…' : 'Create organisation'}
        </button>
      </form>

      <p className="muted">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </section>
  )
}
