import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { setToken } from '../api/token'
import { ceSem5, collegeOrg, companyOrg, healthy, student, teacher } from '../test/fixtures'
import { mockApi, renderAt, sentBody } from '../test/utils'

beforeEach(() => {
  localStorage.clear()
  setToken('valid.token')
})

const asha = { id: 12, name: 'Asha Rao', email: 'asha@svmit.edu' }
const raviEntry = { id: student.id, name: student.name, email: student.email }

function teacherApi(extra: Parameters<typeof mockApi>[0] = {}, org = collegeOrg) {
  return mockApi({
    'GET /auth/me': [200, teacher],
    'GET /organizations/me': [200, org],
    'GET /health': [200, healthy],
    'GET /groups/mine': [200, [ceSem5]],
    'GET /groups/5/members': [200, [teacher, student]],
    'GET /users/directory': [200, [asha, raviEntry]],
    'POST /groups/5/members': [204],
    ...extra,
  })
}

function directoryUrls(fetchSpy: ReturnType<typeof mockApi>): string[] {
  return fetchSpy.mock.calls
    .map(([input]) => String(input))
    .filter((url) => url.startsWith('/api/users/directory'))
}

describe('instructor learner search', () => {
  it('searches once the instructor stops typing, then adds a learner', async () => {
    const api = teacherApi()
    renderAt('/groups/5')
    const user = userEvent.setup()
    const search = await screen.findByRole('searchbox', { name: 'Add a student' })
    expect(directoryUrls(api)).toEqual([]) // nothing requested before typing

    await user.type(search, 'ravi')

    const results = within(await screen.findByRole('list', { name: 'Search results' }))
    // One request for the whole word, not one per letter.
    expect(directoryUrls(api)).toEqual(['/api/users/directory?q=ravi'])
    // Ravi is already a member, so only Asha can be added.
    expect(results.getByText('Asha Rao')).toBeInTheDocument()
    expect(results.queryByText('Ravi Patel')).not.toBeInTheDocument()

    await user.click(results.getByRole('button', { name: 'Add Asha Rao' }))

    await waitFor(() => expect(sentBody(api, 'POST /groups/5/members')).toEqual({ user_id: 12 }))
  })

  it('says so when nobody new matches', async () => {
    teacherApi({ 'GET /users/directory': [200, [raviEntry]] })
    renderAt('/groups/5')

    await userEvent.setup().type(await screen.findByRole('searchbox'), 'ravi')

    expect(await screen.findByText('No matching students to add.')).toBeInTheDocument()
  })

  it('uses company wording', async () => {
    teacherApi({}, companyOrg)
    renderAt('/groups/5')

    expect(await screen.findByRole('searchbox', { name: 'Add an employee' })).toBeInTheDocument()
  })
})
