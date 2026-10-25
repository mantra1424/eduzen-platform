import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { api } from '../api/endpoints'
import { queryKeys } from '../api/queryKeys'
import type { StudentAttendance } from '../api/types'
import { percentageText } from './stats'

type SortOrder = 'name' | 'lowest'

function byLowestFirst(a: StudentAttendance, b: StudentAttendance): number {
  // Students with no data go last: there's nothing to act on yet.
  if (a.percentage === null) return b.percentage === null ? a.name.localeCompare(b.name) : 1
  if (b.percentage === null) return -1
  return a.percentage - b.percentage || a.name.localeCompare(b.name)
}

/** Every student's attendance in one group, with low attendance flagged. */
export function ClassSummary({ groupId }: { groupId: number }) {
  const [sort, setSort] = useState<SortOrder>('lowest')
  const summary = useQuery({
    queryKey: queryKeys.groupAttendanceSummary(groupId),
    queryFn: ({ signal }) => api.groupAttendanceSummary(groupId, signal),
  })

  if (summary.isPending) return <p>Loading summary…</p>
  if (summary.isError) {
    return (
      <p className="error" role="alert">
        {summary.error.message}
      </p>
    )
  }

  const { students, threshold, session_count } = summary.data
  if (students.length === 0)
    return <p className="muted">There are no students in this group yet.</p>

  const below = students.filter((s) => s.below_threshold).length
  const sorted = [...students].sort(
    sort === 'lowest' ? byLowestFirst : (a, b) => a.name.localeCompare(b.name),
  )

  return (
    <div>
      <p className={below > 0 ? 'summary-headline warning' : 'summary-headline'}>
        {below === 0
          ? `Everyone is at or above ${threshold}%.`
          : `${below} of ${students.length} ${students.length === 1 ? 'student' : 'students'} ${below === 1 ? 'is' : 'are'} below ${threshold}%.`}{' '}
        <span className="muted">
          Based on {session_count} {session_count === 1 ? 'session' : 'sessions'}. Late counts as
          present; excused doesn't count.
        </span>
      </p>

      <label className="inline-field sort-field">
        Sort
        <select value={sort} onChange={(e) => setSort(e.target.value as SortOrder)}>
          <option value="lowest">Lowest attendance first</option>
          <option value="name">Name</option>
        </select>
      </label>

      <div className="table-wrap">
        <table>
          <caption className="visually-hidden">Attendance summary</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col" className="num">
                Present
              </th>
              <th scope="col" className="num">
                Late
              </th>
              <th scope="col" className="num">
                Absent
              </th>
              <th scope="col" className="num">
                Excused
              </th>
              <th scope="col" className="num">
                Attendance
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr key={s.user_id} className={s.below_threshold ? 'below' : undefined}>
                <th scope="row">
                  {s.name}
                  {!s.is_member && <span className="muted"> (left the group)</span>}
                </th>
                <td className="num">{s.present}</td>
                <td className="num">{s.late}</td>
                <td className="num">{s.absent}</td>
                <td className="num">{s.excused}</td>
                <td className="num">
                  <span className={s.percentage === null ? 'muted' : undefined}>
                    {percentageText(s.percentage)}
                  </span>
                  {s.below_threshold && <span className="badge danger">Below {threshold}%</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
