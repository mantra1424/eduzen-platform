// One small typed function per backend endpoint. Pages call these, never fetch() directly.

import { apiFetch } from './client'
import type { HealthResponse, Organization, TokenResponse, User } from './types'

export const api = {
  health: (signal?: AbortSignal) => apiFetch<HealthResponse>('/health', { signal }),

  login: (email: string, password: string) =>
    apiFetch<TokenResponse>('/auth/login', { method: 'POST', body: { email, password } }),

  me: (signal?: AbortSignal) => apiFetch<User>('/auth/me', { signal }),

  myOrganization: (signal?: AbortSignal) => apiFetch<Organization>('/organizations/me', { signal }),
}
