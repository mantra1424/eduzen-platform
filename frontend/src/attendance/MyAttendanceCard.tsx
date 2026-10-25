import { useQuery } from '@tanstack/react-query'

import { api } from '../api/endpoints'
import { queryKeys } from '../api/queryKeys'
import type { MyGroupAttendance, OrgType } from '../api/types'
import { groupLabel, groupsLabel } from '../labels'
import { percentageText, sessionsNeeded } from './stats'

/** The student's own attendance in each class, with the low-attendance warning. */
export function MyAttendanceCard({ orgType }: { orgType: OrgType }) {
  const mine = useQuery({
    queryKey: queryKeys.myAttendance,
    queryFn: ({ signal }) => api.myAttendance(signal),
  })
  const groupsWord = groupsLabel(orgType).toLowerCase()

  return (
    <section className="card my-attendance" aria-labelledby="my-attendance-heading">
      <h2 id="my-attendance-heading">My attendance</h2>

      {mine.isPending && <p>Loading…</p>}
      {mine.isError && (
        <p className="error" role="alert">
          {mine.error.message}
        </p>
      )}
      {mine.isSuccess && mine.data.groups.length === 0 && (
        <p className="muted">You haven't been added to any {groupsWord} yet.</p>
      )}
      {mine.isSuccess && mine.data.groups.length > 0 && (
        <>
          <Headline
            groups={mine.data.groups}
            threshold={mine.data.threshold}
            // "1 of 1 classroom", "1 of 3 classrooms"
            noun={mine.data.groups.length === 1 ? groupLabel(orgType).toLowerCase() : groupsWord}
          />
          <ul className="attendance-list">
            {mine.data.groups.map((g) => (
              <GroupRow key={g.group_id} group={g} threshold={mine.data.threshold} />
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function Headline({
  groups,
  threshold,
  noun,
}: {
  groups: MyGroupAttendance[]
  threshold: number
  noun: string
}) {
  const below = groups.filter((g) => g.below_threshold).length
  if (below === 0) {
    return <p className="muted">You're at or above {threshold}% everywhere it's been recorded.</p>
  }
  return (
    <p className="summary-headline warning" role="status">
      You're below {threshold}% in {below} of {groups.length} {noun}.
    </p>
  )
}

function GroupRow({ group, threshold }: { group: MyGroupAttendance; threshold: number }) {
  const attended = group.present + group.late
  const width = group.percentage === null ? 0 : Math.min(group.percentage, 100)

  return (
    <li className={group.below_threshold ? 'below' : undefined}>
      <div className="attendance-row-top">
        <span className="attendance-group">{group.group_name}</span>
        <span className="attendance-pct">{percentageText(group.percentage)}</span>
      </div>

      {/* Decoration only: the percentage is already written out above. */}
      <div className="bar" aria-hidden="true">
        <div className="bar-fill" style={{ width: `${width}%` }} />
        <div className="bar-threshold" style={{ left: `${threshold}%` }} />
      </div>

      {group.counted > 0 || group.excused > 0 ? (
        <p className="muted small">
          {group.present} present · {group.late} late · {group.absent} absent
          {group.excused > 0 && ` · ${group.excused} excused`}
        </p>
      ) : (
        <p className="muted small">No attendance recorded yet.</p>
      )}

      {group.below_threshold && (
        <BelowMessage attended={attended} counted={group.counted} threshold={threshold} />
      )}
    </li>
  )
}

function BelowMessage({
  attended,
  counted,
  threshold,
}: {
  attended: number
  counted: number
  threshold: number
}) {
  const needed = sessionsNeeded(attended, counted, threshold)
  return (
    <p className="warning-text">
      <span className="badge danger">Below {threshold}%</span>{' '}
      {needed === null
        ? `Missed sessions can't be made up to reach ${threshold}%. Talk to your teacher.`
        : `Attend the next ${needed} ${needed === 1 ? 'session' : 'sessions'} in a row to get back to ${threshold}%.`}
    </p>
  )
}
