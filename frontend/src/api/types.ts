// Response shapes from the backend. Keep in sync with the Pydantic schemas in
// backend/app/*/schemas.py (later these can be generated from the OpenAPI schema).

export type OrgType = 'college' | 'company'
export type UserRole = 'admin' | 'instructor' | 'learner'

export interface User {
  id: number
  org_id: number
  email: string
  name: string
  role: UserRole
  is_active: boolean
  created_at: string // ISO 8601 date-time
}

export interface Organization {
  id: number
  name: string
  slug: string
  type: OrgType
  /** Attendance below this percentage is flagged (0-100, default 75). */
  low_attendance_threshold: number
  created_at: string
}

export interface TokenResponse {
  access_token: string
  token_type: 'bearer'
  user: User
}

export interface HealthResponse {
  status: 'ok'
  database: 'ok'
}

export interface SignupRequest {
  org_name: string
  slug: string
  type: OrgType
  admin_name: string
  admin_email: string
  admin_password: string
}

export interface SignupResponse {
  organization: Organization
  user: User
  access_token: string
  token_type: 'bearer'
}

export interface Group {
  id: number
  name: string
  created_at: string
  member_count: number
}

export interface UserCreate {
  email: string
  name: string
  password: string
  role: UserRole
}

export interface UserUpdate {
  name?: string
  role?: UserRole
  is_active?: boolean
}

export interface UserFilters {
  role?: UserRole
  is_active?: boolean
}

/** What staff see when searching for learners to add to a group. */
export interface LearnerDirectoryEntry {
  id: number
  name: string
  email: string
}

// --- attendance ---

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused'

export interface SessionSummary {
  id: number
  group_id: number
  held_on: string // "2026-10-26" (a calendar date, no time)
  topic: string | null
  closed: boolean
  present: number
  absent: number
  late: number
  excused: number
  unmarked: number
}

export interface RosterEntry {
  user_id: number
  name: string
  email: string
  /** False if they've left the group; their mark still counts. */
  is_member: boolean
  status: AttendanceStatus | null // null = not marked yet
  marked_at: string | null
}

export interface SessionDetail {
  id: number
  group_id: number
  group_name: string
  held_on: string
  topic: string | null
  created_at: string
  closed_at: string | null
  // Worked out by the server with the same rules it enforces.
  can_edit: boolean
  can_close: boolean
  can_reopen: boolean
  can_delete: boolean
  read_only_reason: string | null
  roster: RosterEntry[]
}

export interface SessionCreate {
  held_on?: string // omitted = the server's "today"
  topic?: string
}

export interface RecordIn {
  user_id: number
  status: AttendanceStatus
}
