import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { setToken } from '../api/token'
import type { User } from '../api/types'
import { formatCalendarDate, localToday, parseCalendarDate } from '../dates'
import { admin, ceSem5, collegeOrg, healthy, sessionDetail, teacher } from '../test/fixtures'
import { mockApi, renderAt, sentBody } from '../test/utils'
import { countsText } from './labels'

beforeEach(() => {
  localStorage.clear()
  setToken('valid.token')
})

const sessions = [
  {
    id: 12,
    group_id: 5,
    held_on: '2026-10-26',
    topic: 'Unit 3: Joins',
    closed: false,
    present: 18,
    absent: 2,
    late: 1,
    excused: 0,
    unmarked: 3,
  },
  {
    id: 11,
    group_id: 5,
    held_on: '2026-10-23',
    topic: null,
    closed: true,
    present: 22,
    absent: 2,
    late: 0,
    excused: 0,
    unmarked: 0,
  },
]

function asTeacher(extra: Parameters<typeof mockApi>[0] = {}, user: User = teacher) {
  return mockApi({
    'GET /auth/me': [200, user],
    'GET /organizations/me': [200, collegeOrg],
    'GET /health': [200, healthy],
    'GET /groups/mine': [200, [ceSem5]],
    'GET /groups/5': [200, ceSem5],
    'GET /groups/5/members': [200, []],
    'GET /groups/5/sessions': [200, sessions],
    ...extra,
  })
}

function calls(fetchSpy: ReturnType<typeof mockApi>, key: string): number {
  const [method, path] = key.split(' ')
  return fetchSpy.mock.calls.filter(([input, init]) => {
    const url = new URL(String(input), 'http://localhost')
    return (init?.method ?? 'GET') === method && url.pathname === `/api${path}`
  }).length
}

function row(name: string) {
  return within(screen.getByText(name).closest('li')!)
}

// --- helpers -------------------------------------------------------------------

describe('dates and labels', () => {
  it('treats attendance dates as calendar days, not UTC midnight', () => {
    const d = parseCalendarDate('2026-10-26')
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 9, 26])
    expect(formatCalendarDate('2026-10-26', 'en-GB')).toBe('Mon, 26 Oct 2026')
  })

  it('gives today in the browser time zone', () => {
    expect(localToday(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })

  it('summarises counts, skipping zeros', () => {
    expect(countsText({ present: 18, absent: 2, late: 0, excused: 0, unmarked: 3 })).toBe(
      '18 present · 2 absent · 3 not marked',
    )
    expect(countsText({ present: 0, absent: 0, late: 0, excused: 0, unmarked: 0 })).toBe(
      'Nobody to mark',
    )
  })
})

// --- tabs and session list ------------------------------------------------------

describe('Attendance tab', () => {
  it('switches from Members to Attendance and lists sessions', async () => {
    asTeacher()
    const { router } = renderAt('/groups/5')
    const user = userEvent.setup()

    const tabs = within(await screen.findByRole('navigation', { name: 'Classroom sections' }))
    expect(tabs.getByRole('link', { name: 'Members' })).toHaveAttribute('aria-current', 'page')
    await user.click(tabs.getByRole('link', { name: 'Attendance' }))

    expect(router.state.location.pathname).toBe('/groups/5/attendance')
    const list = within(await screen.findByRole('list', { name: 'Sessions' }))
    const items = list.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByText(/Unit 3: Joins/)).toBeInTheDocument()
    expect(
      within(items[0]).getByText('18 present · 2 absent · 1 late · 3 not marked'),
    ).toBeInTheDocument()
    expect(within(items[0]).getByText('Open')).toBeInTheDocument()
    expect(within(items[1]).getByText('Closed')).toBeInTheDocument()
  })

  it('starts a session without sending a date, so the server uses its own today', async () => {
    const api = asTeacher({
      'POST /groups/5/sessions': [201, sessionDetail()],
      'GET /sessions/12': [200, sessionDetail()],
    })
    const { router } = renderAt('/groups/5/attendance')
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('Topic (optional)'), 'Unit 3: Joins')
    await user.click(screen.getByRole('button', { name: 'Start session' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/groups/5/attendance/12'))
    expect(sentBody(api, 'POST /groups/5/sessions')).toEqual({ topic: 'Unit 3: Joins' })
  })

  it('sends the date only when the teacher changes it', async () => {
    const api = asTeacher({
      'POST /groups/5/sessions': [201, sessionDetail()],
      'GET /sessions/12': [200, sessionDetail()],
    })
    renderAt('/groups/5/attendance')
    const user = userEvent.setup()

    const date = await screen.findByLabelText('Date')
    await user.clear(date)
    await user.type(date, '2026-10-20')
    await user.click(screen.getByRole('button', { name: 'Start session' }))

    await waitFor(() =>
      expect(sentBody(api, 'POST /groups/5/sessions')).toEqual({ held_on: '2026-10-20' }),
    )
  })

  it("shows the server's message when a session can't be started", async () => {
    asTeacher({
      'POST /groups/5/sessions': [
        403,
        { detail: 'Instructors can add sessions from the last 7 days. Ask an admin.' },
      ],
    })
    renderAt('/groups/5/attendance')

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Start session' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('last 7 days')
  })
})

// --- marking ------------------------------------------------------------------------

describe('marking screen', () => {
  it('marks, uses the shortcut, and saves only the changes', async () => {
    const saved = sessionDetail({
      can_close: true,
      roster: sessionDetail().roster.map((e) => ({
        ...e,
        status: e.name === 'Ravi Patel' ? 'present' : 'absent',
      })),
    })
    const api = asTeacher({
      'GET /sessions/12': [200, sessionDetail()],
      'PUT /sessions/12/records': [200, saved],
    })
    renderAt('/groups/5/attendance/12')
    const user = userEvent.setup()

    expect(await screen.findByText('2 not marked')).toBeInTheDocument()
    await user.click(row('Ravi Patel').getByRole('radio', { name: 'Present' }))
    expect(screen.getByRole('button', { name: 'Save 1 change' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Mark everyone else absent' }))
    expect(row('Asha Rao').getByRole('radio', { name: 'Absent' })).toBeChecked()
    expect(screen.getByText('1 present · 1 absent')).toBeInTheDocument()

    // Closing waits until changes are saved.
    expect(screen.getByRole('button', { name: 'Close session' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Save 2 changes' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Saved' })).toBeDisabled())
    expect(sentBody(api, 'PUT /sessions/12/records')).toEqual({
      records: [
        { user_id: 8, status: 'present' },
        { user_id: 11, status: 'absent' },
      ],
    })
    expect(screen.getByRole('button', { name: 'Close session' })).toBeEnabled()
  })

  it('changing a mark back to its saved value is not a change', async () => {
    const marked = sessionDetail({
      roster: sessionDetail().roster.map((e) => ({ ...e, status: 'present' as const })),
    })
    asTeacher({ 'GET /sessions/12': [200, marked] })
    renderAt('/groups/5/attendance/12')
    const user = userEvent.setup()

    await screen.findByText('Ravi Patel') // wait for the session to load
    await user.click(row('Ravi Patel').getByRole('radio', { name: 'Late' }))
    expect(screen.getByRole('button', { name: 'Save 1 change' })).toBeInTheDocument()
    await user.click(row('Ravi Patel').getByRole('radio', { name: 'Present' }))
    expect(screen.getByRole('button', { name: 'Saved' })).toBeDisabled()
  })

  it('closes a fully marked session', async () => {
    const ready = sessionDetail({
      can_close: true,
      roster: sessionDetail().roster.map((e) => ({ ...e, status: 'present' as const })),
    })
    const closed = {
      ...ready,
      closed_at: '2026-10-26T10:00:00Z',
      can_edit: false,
      can_close: false,
      read_only_reason: 'This session is closed.',
    }
    const api = asTeacher({
      'GET /sessions/12': [200, ready],
      'POST /sessions/12/close': [200, closed],
    })
    renderAt('/groups/5/attendance/12')

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Close session' }))

    expect(await screen.findByText('This session is closed.')).toBeInTheDocument()
    expect(calls(api, 'POST /sessions/12/close')).toBe(1)
    expect(row('Ravi Patel').getByRole('radio', { name: 'Present' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Save/ })).not.toBeInTheDocument()
  })

  it('is read-only with the reason when the 7 days have passed', async () => {
    asTeacher({
      'GET /sessions/12': [
        200,
        sessionDetail({
          can_edit: false,
          can_delete: false,
          read_only_reason: 'Sessions can only be changed within 7 days. Ask an admin.',
        }),
      ],
    })
    renderAt('/groups/5/attendance/12')

    expect(await screen.findByText(/within 7 days/)).toBeInTheDocument()
    expect(row('Asha Rao').getByRole('radio', { name: 'Present' })).toBeDisabled()
    expect(
      screen.queryByRole('button', { name: 'Mark everyone else present' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete session' })).not.toBeInTheDocument()
  })

  it('lets admins reopen a closed session', async () => {
    const closed = sessionDetail({
      closed_at: '2026-10-26T10:00:00Z',
      can_edit: false,
      can_reopen: true,
      read_only_reason: 'This session is closed.',
    })
    const api = asTeacher(
      { 'GET /sessions/12': [200, closed], 'POST /sessions/12/reopen': [200, sessionDetail()] },
      admin,
    )
    renderAt('/groups/5/attendance/12')

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Reopen session' }))

    await waitFor(() => expect(calls(api, 'POST /sessions/12/reopen')).toBe(1))
    expect(await screen.findByRole('button', { name: 'Saved' })).toBeInTheDocument()
  })

  it('deletes a session only after confirming', async () => {
    const api = asTeacher({
      'GET /sessions/12': [200, sessionDetail()],
      'DELETE /sessions/12': [204],
    })
    const { router } = renderAt('/groups/5/attendance/12')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Delete session' }))
    expect(calls(api, 'DELETE /sessions/12')).toBe(0)
    const dialog = within(screen.getByRole('alertdialog', { name: 'Confirm delete session' }))
    await user.click(dialog.getByRole('button', { name: 'Delete session' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/groups/5/attendance'))
    expect(calls(api, 'DELETE /sessions/12')).toBe(1)
  })

  it('asks before leaving with unsaved marks', async () => {
    asTeacher({ 'GET /sessions/12': [200, sessionDetail()] })
    const { router } = renderAt('/groups/5/attendance/12')
    const user = userEvent.setup()

    await screen.findByText('Ravi Patel') // wait for the session to load
    await user.click(row('Ravi Patel').getByRole('radio', { name: 'Present' }))
    await user.click(screen.getByRole('link', { name: '← All sessions' }))

    const dialog = within(await screen.findByRole('alertdialog', { name: 'Unsaved changes' }))
    expect(router.state.location.pathname).toBe('/groups/5/attendance/12')
    await user.click(dialog.getByRole('button', { name: 'Stay' }))
    expect(row('Ravi Patel').getByRole('radio', { name: 'Present' })).toBeChecked()

    await user.click(screen.getByRole('link', { name: '← All sessions' }))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Leave without saving',
      }),
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/groups/5/attendance'))
  })

  it('labels students who have left the group', async () => {
    const roster = [
      ...sessionDetail().roster,
      {
        user_id: 20,
        name: 'Old Student',
        email: 'old@svmit.edu',
        is_member: false,
        status: 'present' as const,
        marked_at: '2026-10-26T05:00:00Z',
      },
    ]
    asTeacher({ 'GET /sessions/12': [200, sessionDetail({ roster })] })
    renderAt('/groups/5/attendance/12')

    expect(await screen.findByText('(left the group)')).toBeInTheDocument()
  })

  it("shows not-found for a session from another group's URL", async () => {
    asTeacher({ 'GET /sessions/12': [200, sessionDetail({ group_id: 99 })] })
    renderAt('/groups/5/attendance/12')

    expect(await screen.findByRole('heading', { name: 'Session not found' })).toBeInTheDocument()
  })
})
