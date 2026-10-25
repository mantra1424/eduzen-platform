import type { RouteObject } from 'react-router'

import { GuestOnly, RequireAuth } from './auth/guards'
import { Layout } from './components/Layout'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { SignupPage } from './pages/SignupPage'

// Exported as plain data so tests can render them with an in-memory router.
export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      {
        // Only for logged-out visitors.
        element: <GuestOnly />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/signup', element: <SignupPage /> },
        ],
      },
      {
        // Everything here needs a logged-in user.
        element: <RequireAuth />,
        children: [{ path: '/', element: <DashboardPage /> }],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
