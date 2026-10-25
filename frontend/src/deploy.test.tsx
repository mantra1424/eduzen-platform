import { act, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ApiError } from './api/client'
import { getToken } from './api/token'
import { DEMO_PASSWORD } from './demo'
import { createQueryClient } from './queryClient'
import { collegeOrg, healthy, teacher } from './test/fixtures'
import { mockApi, renderAt, sentBody } from './test/utils'
import { isServerWaking, resetWakePing, useSlowNotice } from './wake'

beforeEach(() => {
  localStorage.clear()
  resetWakePing()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

function healthCalls(fetchSpy: ReturnType<typeof mockApi>): number {
  return fetchSpy.mock.calls.filter(([input]) => String(input) === '/api/health').length
}

// --- demo logins -----------------------------------------------------------------

describe('demo logins', () => {
  it('are hidden unless the site is built in demo mode', async () => {
    renderAt('/login')
    await screen.findByRole('heading', { name: 'Log in' })
    expect(screen.queryByRole('heading', { name: 'Try the demo' })).not.toBeInTheDocument()
  })

  it('log in with one click', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true')
    const api = mockApi({
      'POST /auth/login': [
        200,
        { access_token: 'demo.token', token_type: 'bearer', user: teacher },
      ],
      'GET /organizations/me': [200, collegeOrg],
    })
    renderAt('/login')

    const teacherButton = await screen.findByRole('button', {
      name: 'Log in to Demo College as Teacher',
    })
    expect(screen.getAllByRole('button', { name: /^Log in to Demo/ })).toHaveLength(6)
    await userEvent.setup().click(teacherButton)

    expect(await screen.findByRole('heading', { name: 'Welcome, Priya Shah' })).toBeInTheDocument()
    expect(sentBody(api, 'POST /auth/login')).toEqual({
      email: 'teacher@college.example.com',
      password: DEMO_PASSWORD,
    })
    expect(getToken()).toBe('demo.token')
  })
})

// --- waking the server -----------------------------------------------------------

describe('waking a sleeping server', () => {
  it('pings the server once when the deployed login page opens', async () => {
    vi.stubEnv('PROD', true)
    const api = mockApi({ 'GET /health': [200, healthy] })
    const first = renderAt('/login')
    await waitFor(() => expect(healthCalls(api)).toBe(1))
    first.unmount()

    renderAt('/signup')
    await screen.findByRole('heading', { name: 'Create your organisation' })
    expect(healthCalls(api)).toBe(1) // once per page load, not per page
  })

  it('does not ping in development or tests', async () => {
    const api = mockApi({})
    renderAt('/login')
    await screen.findByRole('heading', { name: 'Log in' })
    expect(healthCalls(api)).toBe(0)
  })

  it('retries login while the server is starting', async () => {
    let attempts = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url === '/api/auth/login') {
        attempts += 1
        return attempts === 1
          ? new Response(null, { status: 504 })
          : Response.json({ access_token: 't', token_type: 'bearer', user: teacher })
      }
      if (url === '/api/organizations/me') return Response.json(collegeOrg)
      throw new Error(`Unexpected request: ${url}`)
    })
    renderAt('/login')
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('Email'), 'priya@svmit.edu')
    await user.type(screen.getByLabelText('Password'), 'correct-horse')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(
      await screen.findByRole('heading', { name: 'Welcome, Priya Shah' }, { timeout: 5000 }),
    ).toBeInTheDocument()
    expect(attempts).toBe(2)
  })

  it('explains a slow wait after 3 seconds, and resets afterwards', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ active }) => useSlowNotice(active), {
      initialProps: { active: true },
    })
    expect(result.current).toBe(false)

    act(() => vi.advanceTimersByTime(2999))
    expect(result.current).toBe(false)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe(true)

    rerender({ active: false })
    expect(result.current).toBe(false)
    rerender({ active: true }) // a new wait starts fresh
    expect(result.current).toBe(false)
  })
})

describe('retry rules', () => {
  const retry = createQueryClient().getDefaultOptions().queries?.retry as (
    failureCount: number,
    error: unknown,
  ) => boolean

  it.each([
    [0, new ApiError(504, 'Gateway timeout'), true],
    [3, new ApiError(503, 'Unavailable'), true],
    [4, new ApiError(502, 'Bad gateway'), false], // waking: up to 4 retries
    [0, new ApiError(500, 'Server error'), true],
    [2, new ApiError(500, 'Server error'), false], // other errors: 2 retries
    [0, new ApiError(404, 'Not found'), false], // "no" doesn't change
    [0, new ApiError(0, 'Offline'), true],
  ])('after %i failures, %o -> retry %s', (failures, error, expected) => {
    expect(retry(failures, error)).toBe(expected)
  })

  it('recognises a waking server', () => {
    expect(isServerWaking(new ApiError(504, ''))).toBe(true)
    expect(isServerWaking(new ApiError(500, ''))).toBe(false)
    expect(isServerWaking(new Error('x'))).toBe(false)
  })
})
