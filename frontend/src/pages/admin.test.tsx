import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { setToken } from '../api/token'
import type { User } from '../api/types'
import { navItems } from '../labels'
import {
  admin,
  ceSem5,
  collegeOrg,
  companyOrg,
  formerStudent,
  healthy,
  itSem3,
  student,
  teacher,
} from '../test/fixtures'
import { mockApi, renderAt, sentBody } from '../test/utils'

beforeEach(() => {
  localStorage.clear()
  setToken('valid.token')
})

/** Fake backend for a logged-in user, plus any extra replies a test needs. */
function loggedInAs(user: User, extra: Parameters<typeof mockApi>[0] = {}, org = collegeOrg) {
  return mockApi({
    'GET /auth/me': [200, user],
    'GET /organizations/me': [200, org],
    'GET /health': [200, healthy],
    ...extra,
  })
}

function sidebar() {
  return within(screen.getByRole('navigation', { name: 'Main' }))
}

function requestCount(fetchSpy: ReturnType<typeof mockApi>, key: string): number {
  const [method, path] = key.split(' ')
  return fetchSpy.mock.calls.filter(([input, init]) => {
    const url = new URL(String(input), 'http://localhost')
    return (init?.method ?? 'GET') === method && url.pathname === `/api${path}`
  }).length
}

// --- sidebar --------------------------------------------------------------------

describe('navItems', () => {
  it('gives admins the management pages', () => {
    expect(navItems('admin', 'college').map((i) => i.label)).toEqual([
      'Dashboard',
      'People',
      'Classrooms',
    ])
  })

  it('gives everyone else only their own groups, in company wording for companies', () => {
    expect(navItems('learner', 'company').map((i) => i.label)).toEqual(['Dashboard', 'My teams'])
  })
})

describe('sidebar', () => {
  it('shows admins People and Classrooms', async () => {
    loggedInAs(admin)
    renderAt('/')
    await screen.findByRole('heading', { name: 'Welcome, Dean Mehta' })

    expect(sidebar().getByRole('link', { name: 'People' })).toBeInTheDocument()
    expect(sidebar().getByRole('link', { name: 'Classrooms' })).toBeInTheDocument()
    expect(sidebar().getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('shows learners only their own groups, with no People link', async () => {
    loggedInAs(student, { 'GET /me/attendance': [200, { threshold: 75, groups: [] }] }, companyOrg)
    renderAt('/')
    await screen.findByRole('heading', { name: 'Welcome, Ravi Patel' })

    expect(await sidebar().findByRole('link', { name: 'My teams' })).toBeInTheDocument()
    expect(sidebar().queryByRole('link', { name: 'People' })).not.toBeInTheDocument()
  })

  it("tells non-admins they can't open admin pages", async () => {
    loggedInAs(student)
    renderAt('/users')

    expect(
      await screen.findByRole('heading', { name: "You don't have access to this page" }),
    ).toBeInTheDocument()
  })
})

// --- People ---------------------------------------------------------------------

describe('People page', () => {
  const everyone = [admin, student, formerStudent]

  it('lists everyone, and protects the admin from changing their own role or status', async () => {
    loggedInAs(admin, { 'GET /users': [200, everyone] })
    renderAt('/users')

    const myRow = (await screen.findByText('(you)')).closest('tr')!
    expect(within(myRow).getByRole('combobox')).toBeDisabled()
    expect(within(myRow).queryByRole('button', { name: 'Deactivate' })).not.toBeInTheDocument()

    const ravi = screen.getByText('Ravi Patel').closest('tr')!
    expect(within(ravi).getByRole('combobox')).toBeEnabled()
    expect(within(ravi).getByText('Active')).toBeInTheDocument()

    const old = screen.getByText('Old Student').closest('tr')!
    expect(within(old).getByText('Deactivated')).toBeInTheDocument()
    expect(within(old).getByRole('button', { name: 'Reactivate' })).toBeInTheDocument()
  })

  it('deactivates a user and refreshes the list', async () => {
    const api = loggedInAs(admin, {
      'GET /users': [200, everyone],
      'PATCH /users/8': [200, { ...student, is_active: false }],
    })
    renderAt('/users')
    const ravi = (await screen.findByText('Ravi Patel')).closest('tr')!

    await userEvent.setup().click(within(ravi).getByRole('button', { name: 'Deactivate' }))

    await waitFor(() => expect(requestCount(api, 'GET /users')).toBe(2))
    expect(sentBody(api, 'PATCH /users/8')).toEqual({ is_active: false })
  })

  it('changes a role, shown in organisation wording', async () => {
    const api = loggedInAs(admin, {
      'GET /users': [200, everyone],
      'PATCH /users/8': [200, { ...student, role: 'instructor' }],
    })
    renderAt('/users')

    const select = await screen.findByRole('combobox', { name: 'Role for Ravi Patel' })
    expect(within(select).getByRole('option', { name: 'Teacher' })).toBeInTheDocument()
    await userEvent.setup().selectOptions(select, 'instructor')

    await waitFor(() => expect(sentBody(api, 'PATCH /users/8')).toEqual({ role: 'instructor' }))
  })

  it('filters by role and status', async () => {
    const api = loggedInAs(admin, { 'GET /users': [200, everyone] })
    renderAt('/users')
    await screen.findByText('Ravi Patel')
    const user = userEvent.setup()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Role' }), 'learner')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'false')

    await waitFor(() => {
      const urls = api.mock.calls.map(([input]) => String(input))
      expect(urls).toContain('/api/users?role=learner&is_active=false')
    })
  })

  it('adds a person and confirms it', async () => {
    const newcomer = { ...student, id: 10, name: 'Asha', email: 'asha@svmit.edu' }
    const api = loggedInAs(admin, {
      'GET /users': [200, everyone],
      'POST /users': [201, newcomer],
    })
    renderAt('/users')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Add person' }))
    const form = within(screen.getByRole('form', { name: 'Add person' }))
    await user.type(form.getByLabelText('Name'), 'Asha')
    await user.type(form.getByLabelText('Email'), 'asha@svmit.edu')
    await user.selectOptions(form.getByLabelText('Role'), 'learner')
    await user.type(form.getByLabelText('Temporary password'), 'temp-pass-123')
    await user.click(form.getByRole('button', { name: 'Add person' }))

    expect(await screen.findByText(/Asha was added/)).toBeInTheDocument()
    expect(sentBody(api, 'POST /users')).toEqual({
      name: 'Asha',
      email: 'asha@svmit.edu',
      role: 'learner',
      password: 'temp-pass-123',
    })
  })

  it("shows the backend's message when the email is taken", async () => {
    loggedInAs(admin, {
      'GET /users': [200, everyone],
      'POST /users': [409, { detail: 'An account with that email already exists.' }],
    })
    renderAt('/users')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Add person' }))
    const form = within(screen.getByRole('form', { name: 'Add person' }))
    await user.type(form.getByLabelText('Name'), 'Ravi again')
    await user.type(form.getByLabelText('Email'), 'ravi@svmit.edu')
    await user.type(form.getByLabelText('Temporary password'), 'temp-pass-123')
    await user.click(form.getByRole('button', { name: 'Add person' }))

    expect(await form.findByRole('alert')).toHaveTextContent(
      'An account with that email already exists.',
    )
  })
})

// --- Groups list ----------------------------------------------------------------

describe('groups list', () => {
  it('admins see every group with member counts and can create one', async () => {
    const api = loggedInAs(admin, {
      'GET /groups': [200, [ceSem5, itSem3]],
      'POST /groups': [201, { ...itSem3, id: 7, name: 'ME Sem 1' }],
    })
    renderAt('/groups')

    expect(await screen.findByRole('link', { name: 'CE Sem 5' })).toBeInTheDocument()
    expect(screen.getByText('2 members')).toBeInTheDocument()
    expect(screen.getByText('0 members')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Classroom name'), 'ME Sem 1')
    await user.click(screen.getByRole('button', { name: 'Create classroom' }))

    await waitFor(() => expect(sentBody(api, 'POST /groups')).toEqual({ name: 'ME Sem 1' }))
    await waitFor(() => expect(requestCount(api, 'GET /groups')).toBe(2))
  })

  it('learners see only their groups, without links to member lists', async () => {
    loggedInAs(student, { 'GET /groups/mine': [200, [ceSem5]] })
    renderAt('/groups')

    expect(await screen.findByText('CE Sem 5')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'CE Sem 5' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Classroom name')).not.toBeInTheDocument()
  })

  it('instructors can open their groups', async () => {
    loggedInAs(teacher, { 'GET /groups/mine': [200, [ceSem5]] })
    renderAt('/groups')

    expect(await screen.findByRole('link', { name: 'CE Sem 5' })).toHaveAttribute(
      'href',
      '/groups/5',
    )
  })
})

// --- Group detail ---------------------------------------------------------------

describe('group detail', () => {
  const members = [teacher, student]

  it('admins add a member from people not already in the group', async () => {
    const newcomer = { ...student, id: 11, name: 'Asha', email: 'asha@svmit.edu' }
    const api = loggedInAs(admin, {
      'GET /groups/5': [200, ceSem5],
      'GET /groups/5/members': [200, members],
      'GET /users': [200, [admin, teacher, student, newcomer]],
      'POST /groups/5/members': [204],
    })
    renderAt('/groups/5')

    const select = await screen.findByRole('combobox', { name: 'Person to add' })
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(3))
    const optionNames = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent)
    // Teacher and Ravi are already members; inactive people aren't requested at all.
    expect(optionNames).toEqual(['Choose a person…', 'Dean Mehta (Admin)', 'Asha (Student)'])

    const user = userEvent.setup()
    await user.selectOptions(select, '11')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(sentBody(api, 'POST /groups/5/members')).toEqual({ user_id: 11 }))
    await waitFor(() => expect(requestCount(api, 'GET /groups/5/members')).toBe(2))
  })

  it('admins remove a member', async () => {
    const api = loggedInAs(admin, {
      'GET /groups/5': [200, ceSem5],
      'GET /groups/5/members': [200, members],
      'GET /users': [200, [admin, teacher, student]],
      'DELETE /groups/5/members/8': [204],
    })
    renderAt('/groups/5')

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Remove Ravi Patel' }))

    await waitFor(() => expect(requestCount(api, 'DELETE /groups/5/members/8')).toBe(1))
  })

  it('admins rename a group', async () => {
    const api = loggedInAs(admin, {
      'GET /groups/5': [200, ceSem5],
      'GET /groups/5/members': [200, []],
      'GET /users': [200, [admin]],
      'PATCH /groups/5': [200, { ...ceSem5, name: 'CE Sem 6' }],
    })
    renderAt('/groups/5')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Rename' }))
    const input = screen.getByRole('textbox', { name: 'Classroom name' })
    await user.clear(input)
    await user.type(input, 'CE Sem 6')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(sentBody(api, 'PATCH /groups/5')).toEqual({ name: 'CE Sem 6' }))
  })

  it('admins delete a group only after confirming, then return to the list', async () => {
    const api = loggedInAs(admin, {
      'GET /groups/5': [200, ceSem5],
      'GET /groups/5/members': [200, members],
      'GET /users': [200, [admin, teacher, student]],
      'DELETE /groups/5': [204],
      'GET /groups': [200, [itSem3]],
    })
    const { router } = renderAt('/groups/5')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(requestCount(api, 'DELETE /groups/5')).toBe(0) // nothing deleted yet
    const dialog = within(screen.getByRole('alertdialog', { name: 'Confirm delete' }))
    await user.click(dialog.getByRole('button', { name: 'Delete classroom' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/groups'))
    expect(requestCount(api, 'DELETE /groups/5')).toBe(1)
    expect(await screen.findByRole('link', { name: 'IT Sem 3' })).toBeInTheDocument()
  })

  it('instructors can remove learners only, and cannot rename or delete', async () => {
    loggedInAs(teacher, {
      'GET /groups/mine': [200, [ceSem5]],
      'GET /groups/5/members': [200, members],
    })
    renderAt('/groups/5')

    expect(await screen.findByRole('button', { name: 'Remove Ravi Patel' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove Priya Shah' })).not.toBeInTheDocument()
    // Instructors get the learner search, not the admin's all-people dropdown.
    expect(screen.queryByRole('combobox', { name: 'Person to add' })).not.toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Add a student' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it("shows not-found for a group that doesn't exist or isn't visible", async () => {
    loggedInAs(admin, { 'GET /groups/99': [404, { detail: 'Not found' }] })
    renderAt('/groups/99')

    expect(await screen.findByRole('heading', { name: 'Classroom not found' })).toBeInTheDocument()
  })
})
