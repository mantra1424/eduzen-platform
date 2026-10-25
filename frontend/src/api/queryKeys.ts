import type { UserFilters } from './types'

// Every cache key in one place. Keys are arrays, from general to specific, so
// invalidating ['groups'] also refreshes ['groups', 'mine'] and ['groups', 5, 'members'].
export const queryKeys = {
  organization: ['organization', 'me'] as const,
  health: ['health'] as const,

  users: ['users'] as const,
  userList: (filters: UserFilters) => ['users', 'list', filters] as const,
  learnerDirectory: (q: string) => ['users', 'directory', q] as const,

  groups: ['groups'] as const,
  groupList: ['groups', 'list'] as const,
  myGroups: ['groups', 'mine'] as const,
  group: (id: number) => ['groups', id] as const,
  groupMembers: (id: number) => ['groups', id, 'members'] as const,
  // Under the group, so refreshing ['groups'] (or this group) refreshes the counts too.
  groupSessions: (groupId: number) => ['groups', groupId, 'sessions'] as const,
  groupAttendanceSummary: (groupId: number) => ['groups', groupId, 'attendance-summary'] as const,

  session: (id: number) => ['sessions', id] as const,
  myAttendance: ['me', 'attendance'] as const,
}
