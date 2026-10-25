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

export const admin: User = {
  ...teacher,
  id: 1,
  email: 'dean@svmit.edu',
  name: 'Dean Mehta',
  role: 'admin',
}

export const student: User = {
  ...teacher,
  id: 8,
  email: 'ravi@svmit.edu',
  name: 'Ravi Patel',
  role: 'learner',
}

export const formerStudent: User = {
  ...student,
  id: 9,
  email: 'old@svmit.edu',
  name: 'Old Student',
  is_active: false,
}

export const ceSem5 = {
  id: 5,
  name: 'CE Sem 5',
  created_at: '2026-10-25T10:00:00Z',
  member_count: 2,
}
export const itSem3 = {
  id: 6,
  name: 'IT Sem 3',
  created_at: '2026-10-25T10:00:00Z',
  member_count: 0,
}
