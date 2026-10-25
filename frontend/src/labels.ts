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
