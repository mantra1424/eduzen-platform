import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <section>
      <h1>Page not found</h1>
      <p className="muted">The page you're looking for doesn't exist.</p>
      <Link to="/">Go to the home page</Link>
    </section>
  )
}
