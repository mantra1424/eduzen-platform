import { NavLink, Outlet, useNavigate } from 'react-router'

import { useAuth } from '../auth/AuthContext'
import { useOrganization } from '../auth/useOrganization'
import { navItems, roleLabel } from '../labels'

/** Layout for logged-in pages: header, role-based sidebar, and the page. */
export function AppLayout() {
  const { user, signOut } = useAuth()
  const organization = useOrganization()
  const navigate = useNavigate()

  if (!user) return null // RequireAuth guarantees a user

  const org = organization.data
  const links = navItems(user.role, org?.type ?? 'college')

  function handleLogout() {
    signOut() // marks this as a deliberate logout, so the page isn't remembered
    navigate('/login', { replace: true })
  }

  return (
    <div className="app-layout">
      <header className="site-header">
        <span className="brand">EduZen</span>
        <div className="header-user">
          <span className="muted">
            {user.name}
            {org && ` · ${roleLabel(user.role, org.type)}, ${org.name}`}
          </span>
          <button type="button" className="secondary small" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      <nav className="sidebar" aria-label="Main">
        <ul>
          {links.map((link) => (
            <li key={link.to}>
              {/* "end" so "/" is only active on the dashboard itself */}
              <NavLink to={link.to} end={link.to === '/'}>
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
