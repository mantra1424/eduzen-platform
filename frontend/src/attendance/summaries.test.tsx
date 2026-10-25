import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { setToken } from '../api/token'
import type { MyGroupAttendance, StudentAttendance, User } from '../api/types'
import { admin, ceSem5, collegeOrg, companyOrg, healthy, student, teacher } from '../test/fixtures'
import { mockApi, renderAt } from '../test/utils'
import { percentageText, sessionsNeeded } from './stats'

beforeEach(() => {
  localStorage.clear()
  setToken('valid.token')
})

function stats(present: number, late: number, absent: number, excused: number, threshold = 75) {
  const attended = present + late
  const counted = attended + absent
  const percentage = counted === 0 ? null : Math.floor((attended * 1000) / counted) / 10
  return {
    present,
    late,
    absent,
    excused,
    counted,
    percentage,
    below_threshold: counted > 0 && attended * 100 < threshold * counted,
  }
}

function studentRow(
  id: number,
  name: string,
  s: ReturnType<typeof stats>,
  isMember = true,
): StudentAttendance {
  return {
    user_id: id,
    name,
    email: `${name.split(' ')[0].toLowerCase()}@svmit.edu`,
    is_member: isMember,
    ...s,
  }
}

function myGroup(id: number, name: string, s: ReturnType<typeof stats>): MyGroupAttendance {
  return { group_id: id, group_name: name, ...s }
}

function loggedInAs(user: User, extra: Parameters<typeof mockApi>[0] = {}, org = collegeOrg) {
  return mockApi({
    'GET /auth/me': [200, user],
    'GET /organizations/me': [200, org],
    ...extra,
  })
}

// --- maths -----------------------------------------------------------------------

describe('sessionsNeeded', () => {
  it.each([
    [9, 15, 75, 9], // 18/24 = 75%
    [0, 1, 75, 3], // 3/4 = 75%
    [2, 3, 75, 1], // 3/4
    [3, 4, 75, 0], // already exactly 75%
    [10, 10, 75, 0],
    [0, 0, 75, 0], // no data: nothing to make up
    [7, 10, 80, 5], // 12/15 = 80%
  ])('%i of %i at %i%% needs %i', (attended, counted, threshold, expected) => {
    expect(sessionsNeeded(attended, counted, threshold)).toBe(expected)
  })

  it('reports that 100% cannot be reached after an absence', () => {
    expect(sessionsNeeded(1, 2, 100)).toBeNull()
    expect(sessionsNeeded(2, 2, 100)).toBe(0)
  })

  it('formats percentages', () => {
    expect(percentageText(74.9)).toBe('74.9%')
    expect(percentageText(100)).toBe('100.0%')
    expect(percentageText(null)).toBe('No data yet')
  })
})

// --- class summary --------------------------------------------------------------

describe('class summary', () => {
  const summary = {
    group_id: 5,
    group_name: 'CE Sem 5',
    threshold: 75,
    session_count: 4,
    // Chosen so "lowest first" and "by name" give different orders.
    students: [
      studentRow(1, 'Asha Rao', stats(1, 0, 2, 1)), // 33.3%, below
      studentRow(2, 'Ravi Patel', stats(2, 1, 1, 0)), // 75.0%, not below
      studentRow(3, 'Zoya Khan', stats(1, 0, 4, 0)), // 20.0%, below (lowest)
      studentRow(4, 'Old Student', stats(1, 0, 1, 0), false), // 50%, below, left
      studentRow(5, 'Ali Shaikh', stats(0, 0, 0, 0)), // no data
    ],
  }

  function summaryApi() {
    return loggedInAs(teacher, {
      'GET /groups/mine': [200, [ceSem5]],
      'GET /groups/5/sessions': [200, []],
      'GET /groups/5/attendance-summary': [200, summary],
    })
  }

  function tableRows() {
    return within(screen.getByRole('table', { name: 'Attendance summary' }))
      .getAllByRole('row')
      .slice(1) // skip the header row
      .map((row) => within(row).getAllByRole('rowheader')[0].textContent)
  }

  it('switches to the summary, kept in the URL', async () => {
    summaryApi()
    const { router } = renderAt('/groups/5/attendance')

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Summary' }))

    expect(router.state.location.search).toBe('?view=summary')
    expect(screen.getByRole('button', { name: 'Summary' })).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByText('3 of 5 students are below 75%.')).toBeInTheDocument()
    expect(screen.getByText(/Based on 4 sessions/)).toBeInTheDocument()
  })

  it('lists lowest attendance first, with no-data students last', async () => {
    summaryApi()
    renderAt('/groups/5/attendance?view=summary')

    await screen.findByRole('table', { name: 'Attendance summary' })
    expect(tableRows()).toEqual([
      'Zoya Khan',
      'Asha Rao',
      'Old Student (left the group)',
      'Ravi Patel',
      'Ali Shaikh',
    ])
  })

  it('can sort by name', async () => {
    summaryApi()
    renderAt('/groups/5/attendance?view=summary')
    await screen.findByRole('table', { name: 'Attendance summary' })

    await userEvent.setup().selectOptions(screen.getByRole('combobox', { name: 'Sort' }), 'name')

    expect(tableRows()).toEqual([
      'Ali Shaikh',
      'Asha Rao',
      'Old Student (left the group)',
      'Ravi Patel',
      'Zoya Khan',
    ])
  })

  it('flags only students below the threshold, in words', async () => {
    summaryApi()
    renderAt('/groups/5/attendance?view=summary')
    const table = await screen.findByRole('table', { name: 'Attendance summary' })

    const row = (name: RegExp) =>
      within(within(table).getByRole('rowheader', { name }).closest('tr')!)
    expect(row(/Asha Rao/).getByText('33.3%')).toBeInTheDocument()
    expect(row(/Asha Rao/).getByText('Below 75%')).toBeInTheDocument()
    expect(row(/Ravi Patel/).getByText('75.0%')).toBeInTheDocument()
    expect(row(/Ravi Patel/).queryByText('Below 75%')).not.toBeInTheDocument()
    expect(row(/Zoya Khan/).getByText('20.0%')).toBeInTheDocument()
    expect(row(/Ali Shaikh/).getByText('No data yet')).toBeInTheDocument()
    expect(row(/Ali Shaikh/).queryByText(/Below/)).not.toBeInTheDocument()
  })

  it('says when everyone is fine', async () => {
    loggedInAs(teacher, {
      'GET /groups/mine': [200, [ceSem5]],
      'GET /groups/5/attendance-summary': [
        200,
        { ...summary, students: [studentRow(2, 'Ravi Patel', stats(3, 0, 1, 0))] },
      ],
    })
    renderAt('/groups/5/attendance?view=summary')

    expect(await screen.findByText('Everyone is at or above 75%.')).toBeInTheDocument()
  })
})

// --- student dashboard --------------------------------------------------------------

describe('student dashboard card', () => {
  it('shows each class and how many sessions are needed to recover', async () => {
    loggedInAs(student, {
      'GET /me/attendance': [
        200,
        {
          threshold: 75,
          groups: [
            myGroup(5, 'CE Sem 5', stats(9, 0, 6, 0)), // 60.0%: needs 9 in a row
            myGroup(6, 'DBMS Lab', stats(4, 1, 0, 1)), // 100%
            myGroup(7, 'Electives', stats(0, 0, 0, 0)), // no data
          ],
        },
      ],
    })
    renderAt('/')

    const card = within(await screen.findByRole('region', { name: 'My attendance' }))
    expect(await card.findByText("You're below 75% in 1 of 3 classrooms.")).toBeInTheDocument()

    const ce = within(card.getByText('CE Sem 5').closest('li')!)
    expect(ce.getByText('60.0%')).toBeInTheDocument()
    expect(ce.getByText('Below 75%')).toBeInTheDocument()
    expect(
      ce.getByText(/Attend the next 9 sessions in a row to get back to 75%/),
    ).toBeInTheDocument()

    const lab = within(card.getByText('DBMS Lab').closest('li')!)
    expect(lab.getByText('100.0%')).toBeInTheDocument()
    expect(lab.getByText(/4 present · 1 late · 0 absent · 1 excused/)).toBeInTheDocument()
    expect(lab.queryByText(/Below/)).not.toBeInTheDocument()

    const electives = within(card.getByText('Electives').closest('li')!)
    expect(electives.getByText('No attendance recorded yet.')).toBeInTheDocument()
  })

  it('uses the singular for a single class', async () => {
    loggedInAs(student, {
      'GET /me/attendance': [
        200,
        { threshold: 75, groups: [myGroup(5, 'CE Sem 5', stats(1, 0, 2, 1))] },
      ],
    })
    renderAt('/')

    expect(await screen.findByText("You're below 75% in 1 of 1 classroom.")).toBeInTheDocument()
    expect(screen.getByText(/Attend the next 5 sessions in a row/)).toBeInTheDocument()
  })

  it("explains when a 100% requirement can't be reached", async () => {
    loggedInAs(student, {
      'GET /me/attendance': [
        200,
        { threshold: 100, groups: [myGroup(5, 'CE Sem 5', stats(3, 0, 1, 0, 100))] },
      ],
    })
    renderAt('/')

    expect(await screen.findByText(/can't be made up to reach 100%/)).toBeInTheDocument()
  })

  it('uses company wording and handles no groups', async () => {
    loggedInAs(student, { 'GET /me/attendance': [200, { threshold: 75, groups: [] }] }, companyOrg)
    renderAt('/')

    expect(await screen.findByText("You haven't been added to any teams yet.")).toBeInTheDocument()
  })

  it('is only shown to learners; the status card only to admins', async () => {
    loggedInAs(teacher)
    const first = renderAt('/')
    await screen.findByRole('heading', { name: 'Welcome, Priya Shah' })
    expect(screen.queryByRole('region', { name: 'My attendance' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'System status' })).not.toBeInTheDocument()
    first.unmount()

    loggedInAs(admin, { 'GET /health': [200, healthy] })
    renderAt('/')
    expect(await screen.findByRole('heading', { name: 'System status' })).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByText('API and database are running.')).toBeInTheDocument(),
    )
    expect(screen.queryByRole('region', { name: 'My attendance' })).not.toBeInTheDocument()
  })
})
