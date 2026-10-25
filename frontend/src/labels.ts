import type { OrgType, UserRole } from './api/types'

// The database uses neutral role names; people see words that fit their organisation.
const ROLE_LABELS: Record<OrgType, Record<UserRole, string>> = {
  college: { admin: 'Admin', instructor: 'Teacher', learner: 'Student' },
  company: { admin: 'Admin', instructor: 'Trainer', learner: 'Employee' },
}

export function roleLabel(role: UserRole, orgType: OrgType): string {
  return ROLE_LABELS[orgType][role]
}

export function groupLabel(orgType: OrgType): string {
  return orgType === 'college' ? 'Classroom' : 'Team'
}

export function groupsLabel(orgType: OrgType): string {
  return orgType === 'college' ? 'Classrooms' : 'Teams'
}

export interface NavItem {
  to: string
  label: string
}

/** Sidebar links for a role. The pages themselves are still protected by the backend. */
export function navItems(role: UserRole, orgType: OrgType): NavItem[] {
  if (role === 'admin') {
    return [
      { to: '/', label: 'Dashboard' },
      { to: '/users', label: 'People' },
      { to: '/groups', label: groupsLabel(orgType) },
    ]
  }
  return [
    { to: '/', label: 'Dashboard' },
    { to: '/groups', label: `My ${groupsLabel(orgType).toLowerCase()}` },
  ]
}
