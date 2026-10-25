import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'

import { AuthProvider } from '../auth/AuthProvider'
import { createQueryClient } from '../queryClient'
import { routes } from '../routes'

/** Render the real app (auth + routes) at a URL, with a fresh cache for each test. */
export function renderAt(path: string) {
  const queryClient = createQueryClient()
  queryClient.setDefaultOptions({
    queries: { ...queryClient.getDefaultOptions().queries, retry: false },
  })
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const view = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  )
  return { ...view, router }
}

/** A fake fetch that always returns the given status and JSON body. */
export function mockFetch(status: number, body?: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(status, body))
}

type Reply = readonly [status: number, body?: unknown]

/** Requests a test made that its mockApi didn't list. Checked after every test (setup.ts). */
export const unexpectedRequests: string[] = []

/**
 * A fake backend: replies per "METHOD /path" (path without the /api prefix).
 * Any request not listed fails the test, so typos in URLs can't hide. (Throwing
 * here isn't enough on its own: the API client would treat it as a network error.)
 */
export function mockApi(replies: Readonly<Record<string, Reply>>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost')
    const key = `${init?.method ?? 'GET'} ${url.pathname.replace(/^\/api/, '')}`
    const reply = replies[key]
    if (!reply) {
      unexpectedRequests.push(key)
      throw new Error(`Unexpected request in test: ${key}`)
    }
    return jsonResponse(...reply)
  })
}

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** The JSON body sent in the fetch call matching "METHOD /path". */
export function sentBody(fetchSpy: ReturnType<typeof mockApi>, key: string): unknown {
  const call = fetchSpy.mock.calls.find(([input, init]) => {
    const url = new URL(String(input), 'http://localhost')
    return `${init?.method ?? 'GET'} ${url.pathname.replace(/^\/api/, '')}` === key
  })
  if (!call) throw new Error(`No request sent for ${key}`)
  return JSON.parse(String(call[1]?.body))
}
