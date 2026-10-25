import type { UserFilters } from './types'

// Every cache key in one place. Keys are arrays, from general to specific, so
// invalidating ['groups'] also refreshes ['groups', 'mine'] and ['groups', 5, 'members'].
export const queryKeys = {
  organization: ['organization', 'me'] as const,
  health: ['health'] as const,

  users: ['users'] as const,
  userList: (filters: UserFilters) => ['users', 'list', filters] as const,

  groups: ['groups'] as const,
  groupList: ['groups', 'list'] as const,
  myGroups: ['groups', 'mine'] as const,
  group: (id: number) => ['groups', id] as const,
  groupMembers: (id: number) => ['groups', id, 'members'] as const,
}
