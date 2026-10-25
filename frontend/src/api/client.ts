// The one place the frontend talks to the backend.

import { clearToken, getToken } from './token'

// In development Vite forwards /api/* to FastAPI (see vite.config.ts).
// In production set VITE_API_URL to the backend's address.
const API_URL: string = import.meta.env.VITE_API_URL ?? '/api'

/** An HTTP error from the backend, carrying its status and `detail` message. */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// Called when the server rejects our token, so the app can send the user to login.
type UnauthorizedListener = () => void
const unauthorizedListeners = new Set<UnauthorizedListener>()

export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener)
  return () => unauthorizedListeners.delete(listener)
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface RequestOptions {
  method?: Method
  body?: unknown
  signal?: AbortSignal // TanStack Query passes this to cancel requests nobody needs any more
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options
  const token = getToken()

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.")
  }

  if (response.status === 401 && token) {
    // Our saved token is expired or no longer valid.
    clearToken()
    unauthorizedListeners.forEach((listener) => listener())
  }

  if (!response.ok) {
    throw new ApiError(response.status, await readErrorMessage(response))
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/** FastAPI sends `{"detail": "..."}`, or a list of field errors for 422. */
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const data: unknown = await response.json()
    if (data && typeof data === 'object' && 'detail' in data) {
      const { detail } = data as { detail: unknown }
      if (typeof detail === 'string') return detail
      if (Array.isArray(detail) && detail.length > 0) {
        const first = detail[0] as { msg?: unknown; loc?: unknown }
        const field = Array.isArray(first.loc) ? first.loc.at(-1) : undefined
        const message = typeof first.msg === 'string' ? first.msg : 'Invalid input'
        return field ? `${String(field)}: ${message}` : message
      }
    }
  } catch {
    // The body wasn't JSON; fall through.
  }
  return `Request failed (${response.status})`
}
