import { mockFetch } from '../test/utils'
import { ApiError, apiFetch, onUnauthorized } from './client'
import { getToken, setToken } from './token'

beforeEach(() => localStorage.clear())

function sentHeaders(fetchSpy: ReturnType<typeof mockFetch>): Record<string, string> {
  const init = fetchSpy.mock.calls[0][1] as RequestInit
  return init.headers as Record<string, string>
}

describe('apiFetch', () => {
  it('calls the backend through /api and returns the JSON body', async () => {
    const fetchSpy = mockFetch(200, { status: 'ok' })

    await expect(apiFetch('/health')).resolves.toEqual({ status: 'ok' })
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/health')
  })

  it('sends the saved token as a Bearer header', async () => {
    setToken('abc.def.ghi')
    const fetchSpy = mockFetch(200, {})

    await apiFetch('/auth/me')

    expect(sentHeaders(fetchSpy).Authorization).toBe('Bearer abc.def.ghi')
  })

  it('sends no Authorization header when logged out', async () => {
    const fetchSpy = mockFetch(200, {})
    await apiFetch('/health')
    expect(sentHeaders(fetchSpy).Authorization).toBeUndefined()
  })

  it('sends a JSON body for POST requests', async () => {
    const fetchSpy = mockFetch(200, {})

    await apiFetch('/auth/login', { method: 'POST', body: { email: 'a@b.co', password: 'x' } })

    const init = fetchSpy.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"email":"a@b.co","password":"x"}')
    expect(sentHeaders(fetchSpy)['Content-Type']).toBe('application/json')
  })

  it("turns an error response into an ApiError with the backend's message", async () => {
    mockFetch(409, { detail: 'An account with that email already exists.' })

    const error = await apiFetch('/users').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 409,
      message: 'An account with that email already exists.',
    })
  })

  it('shows the first field error for 422 responses', async () => {
    mockFetch(422, { detail: [{ loc: ['body', 'email'], msg: 'value is not a valid email' }] })

    await expect(apiFetch('/users')).rejects.toThrow('email: value is not a valid email')
  })

  it('returns undefined for 204 No Content', async () => {
    mockFetch(204)
    await expect(apiFetch('/groups/1', { method: 'DELETE' })).resolves.toBeUndefined()
  })

  it('reports a friendly message when the server is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(apiFetch('/health')).rejects.toMatchObject({
      status: 0,
      message: "Can't reach the server. Check your connection and try again.",
    })
  })

  it('on 401 with a saved token: clears it and notifies listeners', async () => {
    setToken('expired.token.here')
    const listener = vi.fn()
    const unsubscribe = onUnauthorized(listener)
    mockFetch(401, { detail: 'Not authenticated' })

    await expect(apiFetch('/auth/me')).rejects.toMatchObject({ status: 401 })

    expect(getToken()).toBeNull()
    expect(listener).toHaveBeenCalledOnce()
    unsubscribe()
  })

  it('on 401 without a token (e.g. wrong password): does not notify', async () => {
    const listener = vi.fn()
    const unsubscribe = onUnauthorized(listener)
    mockFetch(401, { detail: 'Invalid email or password' })

    await expect(apiFetch('/auth/login', { method: 'POST', body: {} })).rejects.toThrow(
      'Invalid email or password',
    )
    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
  })
})
