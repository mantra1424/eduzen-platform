import { useQuery } from '@tanstack/react-query'

import { api } from '../api/endpoints'
import { queryKeys } from '../api/queryKeys'
import { useAuth } from '../auth/AuthContext'
import { useOrganization } from '../auth/useOrganization'
import { roleLabel } from '../labels'

export function DashboardPage() {
  const { user } = useAuth()
  const organization = useOrganization()
  const health = useQuery({
    queryKey: queryKeys.health,
    queryFn: ({ signal }) => api.health(signal),
  })

  if (!user) return null // RequireAuth guarantees a user; this keeps TypeScript happy

  const org = organization.data
  return (
    <section>
      <h1>Welcome, {user.name}</h1>
      {org && (
        <p className="muted">
          {roleLabel(user.role, org.type)} at <strong>{org.name}</strong>
        </p>
      )}
      {organization.isError && <p className="error">{organization.error.message}</p>}

      <div className="card" role="status" aria-live="polite">
        <h2>System status</h2>
        {health.isPending && <p>Checking the server…</p>}
        {health.isError && <p className="error">API unavailable: {health.error.message}</p>}
        {health.isSuccess && <p className="success">API and database are running.</p>}
      </div>
    </section>
  )
}
