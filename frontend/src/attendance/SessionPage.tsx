import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link, useBeforeUnload, useBlocker, useNavigate, useParams } from 'react-router'

import { ApiError } from '../api/client'
import { api } from '../api/endpoints'
import { queryKeys } from '../api/queryKeys'
import type { AttendanceStatus, RosterEntry, SessionDetail } from '../api/types'
import { formatCalendarDate } from '../dates'
import { useGroupContext } from '../pages/groupContext'
import { countsText, STATUS_LABELS, STATUSES } from './labels'

/** Unsaved marks: user id -> status. Only people the teacher changed. */
type Draft = Record<number, AttendanceStatus>

export function SessionPage() {
  const { group } = useGroupContext()
  const sessionId = Number(useParams().sessionId)

  const detail = useQuery({
    queryKey: queryKeys.session(sessionId),
    queryFn: ({ signal }) => api.getSession(sessionId, signal),
    enabled: Number.isInteger(sessionId),
  })

  const backLink = (
    <Link to={`/groups/${group.id}/attendance`} className="back-link">
      ← All sessions
    </Link>
  )

  if (
    !Number.isInteger(sessionId) ||
    (detail.error instanceof ApiError && detail.error.status === 404)
  ) {
    return (
      <div>
        {backLink}
        <h2>Session not found</h2>
      </div>
    )
  }
  if (detail.isPending) return <p>Loading session…</p>
  if (detail.isError) {
    return (
      <p className="error" role="alert">
        {detail.error.message}
      </p>
    )
  }
  if (detail.data.group_id !== group.id) {
    return (
      <div>
        {backLink}
        <h2>Session not found</h2>
      </div>
    )
  }

  // Keyed by session, so the draft resets if the user moves to another session.
  return <MarkingSheet key={detail.data.id} session={detail.data} backLink={backLink} />
}

function MarkingSheet({
  session,
  backLink,
}: {
  session: SessionDetail
  backLink: React.ReactNode
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [draft, setDraft] = useState<Draft>({})
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const statusOf = (entry: RosterEntry) => draft[entry.user_id] ?? entry.status
  const unsaved = Object.keys(draft).length
  const editable = session.can_edit

  const counts = useMemo(() => {
    const result = { present: 0, absent: 0, late: 0, excused: 0, unmarked: 0 }
    for (const entry of session.roster) {
      const status = draft[entry.user_id] ?? entry.status
      if (status) result[status] += 1
      else result.unmarked += 1
    }
    return result
  }, [session.roster, draft])

  // Ask before leaving with unsaved marks: in-app links, then closing or reloading the tab.
  const blocker = useBlocker(unsaved > 0)
  useBeforeUnload((event) => {
    if (unsaved > 0) event.preventDefault()
  })

  /** Server sent a new version of the session: show it and refresh the lists. */
  function applyServerUpdate(updated: SessionDetail) {
    queryClient.setQueryData(queryKeys.session(updated.id), updated)
    void queryClient.invalidateQueries({ queryKey: queryKeys.groupSessions(updated.group_id) })
  }

  const save = useMutation({
    mutationFn: () =>
      api.saveRecords(
        session.id,
        Object.entries(draft).map(([userId, status]) => ({ user_id: Number(userId), status })),
      ),
    onSuccess: (updated) => {
      setDraft({})
      applyServerUpdate(updated)
    },
  })
  const close = useMutation({
    mutationFn: () => api.closeSession(session.id),
    onSuccess: applyServerUpdate,
  })
  const reopen = useMutation({
    mutationFn: () => api.reopenSession(session.id),
    onSuccess: applyServerUpdate,
  })
  const remove = useMutation({
    mutationFn: () => api.deleteSession(session.id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: queryKeys.session(session.id) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.groupSessions(session.group_id) })
      navigate(`/groups/${session.group_id}/attendance`, { replace: true })
    },
  })

  function setStatus(userId: number, status: AttendanceStatus) {
    const saved = session.roster.find((e) => e.user_id === userId)?.status ?? null
    setDraft((current) => {
      const next = { ...current }
      if (status === saved)
        delete next[userId] // back to what's saved: not a change
      else next[userId] = status
      return next
    })
  }

  function markUnmarked(status: AttendanceStatus) {
    setDraft((current) => {
      const next = { ...current }
      for (const entry of session.roster) {
        if ((current[entry.user_id] ?? entry.status) === null) next[entry.user_id] = status
      }
      return next
    })
  }

  const busy = save.isPending || close.isPending || reopen.isPending || remove.isPending
  const mutationError = [save, close, reopen, remove].find((m) => m.isError)?.error

  return (
    <div className="marking">
      {backLink}
      <div className="page-heading">
        <div>
          <h2>{formatCalendarDate(session.held_on)}</h2>
          {session.topic && <p className="muted">{session.topic}</p>}
        </div>
        <span className={session.closed_at ? 'badge' : 'badge success'}>
          {session.closed_at ? 'Closed' : 'Open'}
        </span>
      </div>

      {session.read_only_reason && (
        <p className="notice" role="status">
          {session.read_only_reason}
        </p>
      )}

      <p className="muted" aria-live="polite">
        {countsText(counts)}
      </p>

      {editable && counts.unmarked > 0 && (
        <div className="button-row start">
          <button type="button" className="secondary small" onClick={() => markUnmarked('present')}>
            Mark everyone else present
          </button>
          <button type="button" className="secondary small" onClick={() => markUnmarked('absent')}>
            Mark everyone else absent
          </button>
        </div>
      )}

      {session.roster.length === 0 ? (
        <p className="muted">There are no students in this group yet.</p>
      ) : (
        <ul className="roster" aria-label="Class list">
          {session.roster.map((entry) => (
            <li key={entry.user_id} className={draft[entry.user_id] ? 'changed' : undefined}>
              <div className="roster-name">
                {entry.name}
                {!entry.is_member && <span className="muted"> (left the group)</span>}
                {statusOf(entry) === null && <span className="muted"> · not marked</span>}
              </div>
              <fieldset className="segmented" disabled={!editable || busy}>
                <legend className="visually-hidden">Attendance for {entry.name}</legend>
                {STATUSES.map((status) => (
                  <label key={status} className={`segment ${status}`}>
                    <input
                      type="radio"
                      name={`status-${entry.user_id}`}
                      value={status}
                      checked={statusOf(entry) === status}
                      onChange={() => setStatus(entry.user_id, status)}
                    />
                    <span>{STATUS_LABELS[status]}</span>
                  </label>
                ))}
              </fieldset>
            </li>
          ))}
        </ul>
      )}

      {mutationError && (
        <p className="error" role="alert">
          {mutationError.message}
        </p>
      )}

      <div className="action-bar">
        {editable && (
          <button type="button" disabled={unsaved === 0 || busy} onClick={() => save.mutate()}>
            {save.isPending
              ? 'Saving…'
              : unsaved > 0
                ? `Save ${unsaved} ${unsaved === 1 ? 'change' : 'changes'}`
                : 'Saved'}
          </button>
        )}
        {editable && (
          <button
            type="button"
            className="secondary"
            // The server decides (everyone marked); unsaved changes must be saved first.
            disabled={!session.can_close || unsaved > 0 || busy}
            title={
              unsaved > 0
                ? 'Save your changes first'
                : !session.can_close
                  ? 'Mark everyone before closing'
                  : undefined
            }
            onClick={() => close.mutate()}
          >
            Close session
          </button>
        )}
        {session.can_reopen && (
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => reopen.mutate()}
          >
            Reopen session
          </button>
        )}
        {session.can_delete && !confirmingDelete && (
          <button
            type="button"
            className="danger small"
            disabled={busy}
            onClick={() => setConfirmingDelete(true)}
          >
            Delete session
          </button>
        )}
      </div>

      {confirmingDelete && (
        <div className="confirm" role="alertdialog" aria-label="Confirm delete session">
          <p>Delete this session and all its marks? This can't be undone.</p>
          <div className="button-row start">
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={() => remove.mutate()}
            >
              Delete session
            </button>
            <button type="button" className="secondary" onClick={() => setConfirmingDelete(false)}>
              Keep it
            </button>
          </div>
        </div>
      )}

      {blocker.state === 'blocked' && (
        <div className="confirm" role="alertdialog" aria-label="Unsaved changes">
          <p>
            You have {unsaved} unsaved {unsaved === 1 ? 'change' : 'changes'}. Leave without saving?
          </p>
          <div className="button-row start">
            <button type="button" className="secondary" onClick={() => blocker.reset()}>
              Stay
            </button>
            <button type="button" className="danger" onClick={() => blocker.proceed()}>
              Leave without saving
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
