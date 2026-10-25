import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { getToken, setToken } from '../api/token'
import { collegeOrg, companyOrg, healthy, teacher } from '../test/fixtures'
import { mockApi, renderAt, sentBody } from '../test/utils'

beforeEach(() => localStorage.clear())

const loggedInApi = {
  'GET /auth/me': [200, teacher],
  'GET /organizations/me': [200, collegeOrg],
  'GET /health': [200, healthy],
} as const

async function logIn(email = 'priya@svmit.edu', password = 'correct-horse') {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Email'), email)
  await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: 'Log in' }))
}

describe('logging in', () => {
  it('sends logged-out visitors to the login page, then into the app', async () => {
    mockApi({
      'POST /auth/login': [
        200,
        { access_token: 'new.jwt.token', token_type: 'bearer', user: teacher },
      ],
      'GET /organizations/me': [200, collegeOrg],
      'GET /health': [200, healthy],
    })
    renderAt('/')

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
    await logIn()

    expect(await screen.findByRole('heading', { name: 'Welcome, Priya Shah' })).toBeInTheDocument()
    expect(await screen.findByText(/Teacher at/)).toBeInTheDocument() // instructor, college
    expect(getToken()).toBe('new.jwt.token')
  })

  it('returns to the page the user originally asked for', async () => {
    mockApi({
      'POST /auth/login': [200, { access_token: 't', token_type: 'bearer', user: teacher }],
      'GET /organizations/me': [200, collegeOrg],
      'GET /health': [200, healthy],
    })
    const { router } = renderAt('/?tab=overview')

    await screen.findByRole('heading', { name: 'Log in' })
    await logIn()

    await screen.findByRole('heading', { name: 'Welcome, Priya Shah' })
    expect(router.state.location.search).toBe('?tab=overview')
  })

  it("shows the backend's message for a wrong password and stays logged out", async () => {
    mockApi({ 'POST /auth/login': [401, { detail: 'Invalid email or password' }] })
    renderAt('/login')

    await logIn('priya@svmit.edu', 'wrong-password')

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password')
    expect(screen.getByRole('heading', { name: 'Log in' })).toBeInTheDocument()
    expect(getToken()).toBeNull()
  })

  it('sends already logged-in users from /login into the app', async () => {
    setToken('valid.token')
    mockApi(loggedInApi)
    renderAt('/login')

    expect(await screen.findByRole('heading', { name: 'Welcome, Priya Shah' })).toBeInTheDocument()
  })

  it('uses company wording for company users', async () => {
    setToken('valid.token')
    mockApi({ ...loggedInApi, 'GET /organizations/me': [200, companyOrg] })
    renderAt('/')

    expect(await screen.findByText(/Trainer at/)).toBeInTheDocument()
  })
})

describe('expired sessions', () => {
  it('a rejected saved token sends the user to login with an explanation', async () => {
    setToken('expired.token')
    mockApi({ 'GET /auth/me': [401, { detail: 'Not authenticated' }] })
    renderAt('/')

    expect(
      await screen.findByText('Your session has expired. Please log in again.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Log in' })).toBeInTheDocument()
    expect(getToken()).toBeNull()
  })

  it('a 401 on any request mid-session also logs out', async () => {
    setToken('valid.token')
    mockApi({ ...loggedInApi, 'GET /organizations/me': [401, { detail: 'Not authenticated' }] })
    renderAt('/')

    expect(
      await screen.findByText('Your session has expired. Please log in again.'),
    ).toBeInTheDocument()
    expect(getToken()).toBeNull()
  })

  it('does not log out when the server is unreachable', async () => {
    setToken('valid.token')
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    renderAt('/')

    expect(await screen.findByText("We can't reach the server right now.")).toBeInTheDocument()
    expect(getToken()).toBe('valid.token')
  })
})

describe('logging out', () => {
  it('clears the token and returns to the login page', async () => {
    setToken('valid.token')
    mockApi(loggedInApi)
    renderAt('/')
    await screen.findByRole('heading', { name: 'Welcome, Priya Shah' })

    await userEvent.setup().click(screen.getByRole('button', { name: 'Log out' }))

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
    expect(getToken()).toBeNull()
    // A deliberate logout is not an "expired session".
    expect(screen.queryByText(/session has expired/)).not.toBeInTheDocument()
  })
})

describe('unknown URLs', () => {
  it('show the not-found page', async () => {
    renderAt('/no-such-page')
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})

describe('signup', () => {
  it('suggests a URL name from the organisation name until edited', async () => {
    renderAt('/signup')
    const user = userEvent.setup()
    const name = await screen.findByLabelText('Name')
    const slug = screen.getByLabelText('URL name')

    await user.type(name, 'SVMIT College!')
    expect(slug).toHaveValue('svmit-college')

    await user.clear(slug)
    await user.type(slug, 'svmit')
    await user.type(name, ' Ahmedabad')
    expect(slug).toHaveValue('svmit') // the user's own choice is kept
  })

  it('creates the organisation and logs the admin in', async () => {
    const admin = { ...teacher, role: 'admin' as const, name: 'Dean' }
    const api = mockApi({
      'POST /organizations': [
        201,
        {
          organization: companyOrg,
          user: admin,
          access_token: 'signup.token',
          token_type: 'bearer',
        },
      ],
      'GET /organizations/me': [200, companyOrg],
      'GET /health': [200, healthy],
    })
    renderAt('/signup')
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('Name'), 'Acme')
    await user.click(screen.getByLabelText('Company'))
    await user.type(screen.getByLabelText('Your name'), 'Dean')
    await user.type(screen.getByLabelText('Email'), 'dean@acme.com')
    await user.type(screen.getByLabelText('Password'), 'a-strong-password')
    await user.click(screen.getByRole('button', { name: 'Create organisation' }))

    expect(await screen.findByRole('heading', { name: 'Welcome, Dean' })).toBeInTheDocument()
    expect(getToken()).toBe('signup.token')
    expect(sentBody(api, 'POST /organizations')).toEqual({
      org_name: 'Acme',
      slug: 'acme',
      type: 'company',
      admin_name: 'Dean',
      admin_email: 'dean@acme.com',
      admin_password: 'a-strong-password',
    })
  })

  it("shows the backend's message when the URL name is taken", async () => {
    mockApi({
      'POST /organizations': [409, { detail: 'That organisation URL is already taken.' }],
    })
    renderAt('/signup')
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('Name'), 'SVMIT')
    await user.type(screen.getByLabelText('Your name'), 'Dean')
    await user.type(screen.getByLabelText('Email'), 'dean@svmit.edu')
    await user.type(screen.getByLabelText('Password'), 'a-strong-password')
    await user.click(screen.getByRole('button', { name: 'Create organisation' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'That organisation URL is already taken.',
      ),
    )
    expect(getToken()).toBeNull()
  })
})
