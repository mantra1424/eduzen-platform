import { useOutletContext } from 'react-router'

import type { Group, OrgType } from '../api/types'

/** What the classroom layout shares with its tabs (via React Router's outlet context). */
export interface GroupContext {
  group: Group
  orgType: OrgType
  isAdmin: boolean
}

export function useGroupContext(): GroupContext {
  return useOutletContext<GroupContext>()
}
