import { useQuery } from '@tanstack/react-query'

import { api } from '../api/endpoints'

export function HomePage() {
  // queryKey identifies this data in the cache; queryFn fetches it.
  const health = useQuery({ queryKey: ['health'], queryFn: ({ signal }) => api.health(signal) })

  return (
    <section>
      <h1>EduZen</h1>
      <p className="muted">Learning platform for colleges and companies.</p>

      <div className="card" role="status" aria-live="polite">
        <h2>System status</h2>
        {health.isPending && <p>Checking the server…</p>}
        {health.isError && <p className="error">API unavailable: {health.error.message}</p>}
        {health.isSuccess && <p className="success">API and database are running.</p>}
      </div>
    </section>
  )
}
