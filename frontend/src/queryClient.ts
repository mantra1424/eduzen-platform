import { QueryClient } from '@tanstack/react-query'

import { ApiError } from './api/client'
import { isServerWaking, WAKING_RETRIES, wakingRetryDelay } from './wake'

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000, // reuse fetched data for 30s before refetching in the background
        retry: (failureCount, error) => {
          // 4xx means "no" (not found, not allowed...): asking again won't change the answer.
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false
          // A sleeping server can take most of a minute to start: keep trying.
          if (isServerWaking(error)) return failureCount < WAKING_RETRIES
          return failureCount < 2 // network blips and other 5xx: try twice more
        },
        retryDelay: (attemptIndex, error) =>
          isServerWaking(error)
            ? wakingRetryDelay(attemptIndex)
            : Math.min(1000 * 2 ** attemptIndex, 30_000),
      },
    },
  })
}
