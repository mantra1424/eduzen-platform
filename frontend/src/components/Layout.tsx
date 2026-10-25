import { Link, Outlet } from 'react-router'

export function Layout() {
  return (
    <div className="layout">
      <header className="site-header">
        <Link to="/" className="brand">
          EduZen
        </Link>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </div>
  )
}
