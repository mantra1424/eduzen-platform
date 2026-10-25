import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { api } from '../api/endpoints'
import { queryKeys } from '../api/queryKeys'
import { formatCalendarDate, localToday } from '../dates'
import { useGroupContext } from '../pages/groupContext'
import { countsText } from './labels'

/** The classroom's Attendance tab: start a session, and the list of past sessions. */
export function AttendanceTab() {
  const { group } = useGroupContext()

  const sessions = useQuery({
    queryKey: queryKeys.groupSessions(group.id),
    queryFn: ({ signal }) => api.listSessions(group.id, signal),
  })

  return (
    <div>
      <h2 className="visually-hidden">Attendance</h2>
      <StartSessionForm groupId={group.id} />

      {sessions.isPending && <p>Loading sessions…</p>}
      {sessions.isError && (
        <p className="error" role="alert">
          {sessions.error.message}
        </p>
      )}
      {sessions.isSuccess && sessions.data.length === 0 && (
        <p className="muted">No sessions yet. Start one above when the class meets.</p>
      )}
      {sessions.isSuccess && sessions.data.length > 0 && (
        <ul className="session-list" aria-label="Sessions">
          {sessions.data.map((s) => (
            <li key={s.id} className="card session-item">
              <div>
                <Link to={`/groups/${group.id}/attendance/${s.id}`}>
                  {formatCalendarDate(s.held_on)}
                </Link>
                {s.topic && <span className="muted"> · {s.topic}</span>}
              </div>
              <div className="session-meta">
                <span className="muted">{countsText(s)}</span>
                <span className={s.closed ? 'badge' : 'badge success'}>
                  {s.closed ? 'Closed' : 'Open'}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function StartSessionForm({ groupId }: { groupId: number }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const today = localToday()
  const [date, setDate] = useState(today)
  const [dateChanged, setDateChanged] = useState(false)
  const [topic, setTopic] = useState('')

  const start = useMutation({
    mutationFn: () =>
      api.startSession(groupId, {
        // Only send a date the teacher picked. Otherwise the server uses its own
        // "today", which avoids time-zone mismatches just after midnight.
        held_on: dateChanged ? date : undefined,
        topic: topic.trim() || undefined,
      }),
    onSuccess: (detail) => {
      queryClient.setQueryData(queryKeys.session(detail.id), detail)
      void queryClient.invalidateQueries({ queryKey: queryKeys.groupSessions(groupId) })
      navigate(`/groups/${groupId}/attendance/${detail.id}`)
    },
  })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    start.mutate()
  }

  return (
    <form className="inline-row start-session" onSubmit={handleSubmit} aria-label="Start a session">
      <label className="inline-field">
        Date
        <input
          type="date"
          required
          max={today}
          value={date}
          onChange={(e) => {
            setDate(e.target.value)
            setDateChanged(e.target.value !== today)
          }}
        />
      </label>
      <label className="inline-field grow">
        Topic (optional)
        <input
          maxLength={200}
          placeholder="e.g. Unit 3: Joins"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
      </label>
      <button type="submit" disabled={start.isPending}>
        {start.isPending ? 'Starting…' : 'Start session'}
      </button>
      {start.isError && (
        <p className="error" role="alert">
          {start.error.message}
        </p>
      )}
    </form>
  )
}
