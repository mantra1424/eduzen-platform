import type { Organization, User } from '../api/types'

export const collegeOrg: Organization = {
  id: 1,
  name: 'SVMIT',
  slug: 'svmit',
  type: 'college',
  created_at: '2026-10-25T10:00:00Z',
}

export const companyOrg: Organization = {
  ...collegeOrg,
  name: 'Acme',
  slug: 'acme',
  type: 'company',
}

export const teacher: User = {
  id: 7,
  org_id: 1,
  email: 'priya@svmit.edu',
  name: 'Priya Shah',
  role: 'instructor',
  is_active: true,
  created_at: '2026-10-25T10:00:00Z',
}

export const healthy = { status: 'ok', database: 'ok' }
