import { Link, Outlet, useNavigate } from 'react-router'

import { useAuth } from '../auth/AuthContext'

export function Layout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="layout">
      <header className="site-header">
        <Link to="/" className="brand">
          EduZen
        </Link>
        {user && (
          <nav className="header-user" aria-label="Account">
            <span className="muted">{user.name}</span>
            <button type="button" className="secondary small" onClick={handleLogout}>
              Log out
            </button>
          </nav>
        )}
      </header>
      <main className="page">
        <Outlet />
      </main>
    </div>
  )
}
