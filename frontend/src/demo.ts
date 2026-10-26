/**
 * One-click logins for the public demo (only when VITE_DEMO_MODE=true at build time).
 *
 * The password is public on purpose: it only opens the sample organisations, which are
 * recreated every night. It must match DEMO_PASSWORD in backend/app/demo.py
 * (a backend test checks this file).
 */
export const DEMO_PASSWORD = 'demo-pass-2026'

export interface DemoAccount {
  label: string
  email: string
}

export const DEMO_ORGS: { name: string; accounts: DemoAccount[] }[] = [
  {
    name: 'Demo College',
    accounts: [
      { label: 'Admin', email: 'admin@college.example.com' },
      { label: 'Teacher', email: 'teacher@college.example.com' },
      { label: 'Student', email: 'student@college.example.com' },
    ],
  },
  {
    name: 'Demo Company',
    accounts: [
      { label: 'Admin', email: 'admin@company.example.com' },
      { label: 'Trainer', email: 'trainer@company.example.com' },
      { label: 'Employee', email: 'employee@company.example.com' },
    ],
  },
]

export function isDemoMode(): boolean {
  return import.meta.env.VITE_DEMO_MODE === 'true'
}
