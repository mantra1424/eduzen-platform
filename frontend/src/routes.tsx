import type { RouteObject } from 'react-router'

import { GuestOnly, RequireAuth, RequireRole } from './auth/guards'
import { AppLayout } from './components/AppLayout'
import { PublicLayout } from './components/PublicLayout'
import { DashboardPage } from './pages/DashboardPage'
import { GroupDetailPage } from './pages/GroupDetailPage'
import { GroupsPage } from './pages/GroupsPage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { SignupPage } from './pages/SignupPage'
import { UsersPage } from './pages/UsersPage'

// Exported as plain data so tests can render them with an in-memory router.
export const routes: RouteObject[] = [
  {
    // Only for logged-out visitors.
    element: <GuestOnly />,
    children: [
      {
        element: <PublicLayout />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/signup', element: <SignupPage /> },
        ],
      },
    ],
  },
  {
    // Everything here needs a logged-in user.
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <DashboardPage /> },
          { path: '/groups', element: <GroupsPage /> },
          { path: '/groups/:groupId', element: <GroupDetailPage /> },
          {
            element: <RequireRole roles={['admin']} />,
            children: [{ path: '/users', element: <UsersPage /> }],
          },
        ],
      },
    ],
  },
  {
    element: <PublicLayout />,
    children: [{ path: '*', element: <NotFoundPage /> }],
  },
]
