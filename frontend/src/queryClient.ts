import { QueryClient } from '@tanstack/react-query'

import { ApiError } from './api/client'

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000, // reuse fetched data for 30s before refetching in the background
        retry: (failureCount, error) => {
          // 4xx means "no" (not found, not allowed...): asking again won't change the answer.
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false
          return failureCount < 2 // network blips and 5xx: try twice more
        },
      },
    },
  })
}
