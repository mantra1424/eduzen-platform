import { useQuery } from '@tanstack/react-query'

import { api } from '../api/endpoints'
import { queryKeys } from '../api/queryKeys'

/** The logged-in user's organisation (name and college/company type). */
export function useOrganization() {
  return useQuery({
    queryKey: queryKeys.organization,
    queryFn: ({ signal }) => api.myOrganization(signal),
    staleTime: 10 * 60_000, // rarely changes
  })
}
