// One small typed function per backend endpoint. Pages call these, never fetch() directly.

import { apiFetch } from './client'
import type {
  Group,
  GroupAttendanceSummary,
  MyAttendance,
  RecordIn,
  SessionCreate,
  SessionDetail,
  SessionSummary,
  HealthResponse,
  LearnerDirectoryEntry,
  Organization,
  SignupRequest,
  SignupResponse,
  TokenResponse,
  User,
  UserCreate,
  UserFilters,
  UserUpdate,
} from './types'

function queryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

export const api = {
  health: (signal?: AbortSignal) => apiFetch<HealthResponse>('/health', { signal }),

  // --- auth and organisation ---
  login: (email: string, password: string) =>
    apiFetch<TokenResponse>('/auth/login', { method: 'POST', body: { email, password } }),

  signup: (data: SignupRequest) =>
    apiFetch<SignupResponse>('/organizations', { method: 'POST', body: data }),

  me: (signal?: AbortSignal) => apiFetch<User>('/auth/me', { signal }),

  myOrganization: (signal?: AbortSignal) => apiFetch<Organization>('/organizations/me', { signal }),

  // --- users (admin only) ---
  listUsers: (filters: UserFilters = {}, signal?: AbortSignal) =>
    apiFetch<User[]>(`/users${queryString({ ...filters })}`, { signal }),

  // Admins and instructors: active learners, optionally filtered by name or email.
  learnerDirectory: (q: string, signal?: AbortSignal) =>
    apiFetch<LearnerDirectoryEntry[]>(`/users/directory${queryString({ q: q || undefined })}`, {
      signal,
    }),

  createUser: (data: UserCreate) => apiFetch<User>('/users', { method: 'POST', body: data }),

  updateUser: (id: number, data: UserUpdate) =>
    apiFetch<User>(`/users/${id}`, { method: 'PATCH', body: data }),

  // --- groups ---
  listGroups: (signal?: AbortSignal) => apiFetch<Group[]>('/groups', { signal }),

  myGroups: (signal?: AbortSignal) => apiFetch<Group[]>('/groups/mine', { signal }),

  getGroup: (id: number, signal?: AbortSignal) => apiFetch<Group>(`/groups/${id}`, { signal }),

  createGroup: (name: string) => apiFetch<Group>('/groups', { method: 'POST', body: { name } }),

  renameGroup: (id: number, name: string) =>
    apiFetch<Group>(`/groups/${id}`, { method: 'PATCH', body: { name } }),

  deleteGroup: (id: number) => apiFetch<void>(`/groups/${id}`, { method: 'DELETE' }),

  listMembers: (groupId: number, signal?: AbortSignal) =>
    apiFetch<User[]>(`/groups/${groupId}/members`, { signal }),

  addMember: (groupId: number, userId: number) =>
    apiFetch<void>(`/groups/${groupId}/members`, { method: 'POST', body: { user_id: userId } }),

  removeMember: (groupId: number, userId: number) =>
    apiFetch<void>(`/groups/${groupId}/members/${userId}`, { method: 'DELETE' }),

  // --- attendance ---
  listSessions: (groupId: number, signal?: AbortSignal) =>
    apiFetch<SessionSummary[]>(`/groups/${groupId}/sessions`, { signal }),

  startSession: (groupId: number, data: SessionCreate) =>
    apiFetch<SessionDetail>(`/groups/${groupId}/sessions`, { method: 'POST', body: data }),

  getSession: (id: number, signal?: AbortSignal) =>
    apiFetch<SessionDetail>(`/sessions/${id}`, { signal }),

  saveRecords: (id: number, records: RecordIn[]) =>
    apiFetch<SessionDetail>(`/sessions/${id}/records`, { method: 'PUT', body: { records } }),

  closeSession: (id: number) =>
    apiFetch<SessionDetail>(`/sessions/${id}/close`, { method: 'POST' }),

  reopenSession: (id: number) =>
    apiFetch<SessionDetail>(`/sessions/${id}/reopen`, { method: 'POST' }),

  deleteSession: (id: number) => apiFetch<void>(`/sessions/${id}`, { method: 'DELETE' }),

  groupAttendanceSummary: (groupId: number, signal?: AbortSignal) =>
    apiFetch<GroupAttendanceSummary>(`/groups/${groupId}/attendance-summary`, { signal }),

  myAttendance: (signal?: AbortSignal) => apiFetch<MyAttendance>('/me/attendance', { signal }),
}
