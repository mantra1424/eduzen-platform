import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { ApiError } from '../api/client'
import { api } from '../api/endpoints'
import { queryKeys } from '../api/queryKeys'
import type { Group, OrgType, User } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useOrganization } from '../auth/useOrganization'
import { groupLabel, groupsLabel, roleLabel, withArticle } from '../labels'

export function GroupDetailPage() {
  const groupId = Number(useParams().groupId)
  const { user } = useAuth()
  const orgType = useOrganization().data?.type ?? 'college'
  const isAdmin = user?.role === 'admin'

  // Admins can load the group directly; others learn its name from their own list.
  const group = useQuery({
    queryKey: queryKeys.group(groupId),
    queryFn: async ({ signal }) => {
      if (isAdmin) return api.getGroup(groupId, signal)
      const mine = await api.myGroups(signal)
      const found = mine.find((g) => g.id === groupId)
      if (!found) throw new ApiError(404, 'Not found')
      return found
    },
    enabled: Number.isInteger(groupId),
  })

  const members = useQuery({
    queryKey: queryKeys.groupMembers(groupId),
    queryFn: ({ signal }) => api.listMembers(groupId, signal),
    enabled: group.isSuccess,
  })

  const backLink = (
    <Link to="/groups" className="back-link">
      ← {groupsLabel(orgType)}
    </Link>
  )

  if (
    !Number.isInteger(groupId) ||
    (group.error instanceof ApiError && group.error.status === 404)
  ) {
    return (
      <section>
        {backLink}
        <h1>{groupLabel(orgType)} not found</h1>
      </section>
    )
  }
  if (group.isPending) return <p>Loading…</p>
  if (group.isError) {
    return (
      <p className="error" role="alert">
        {group.error.message}
      </p>
    )
  }

  return (
    <section>
      {backLink}
      {isAdmin ? (
        <GroupHeaderAdmin group={group.data} orgType={orgType} />
      ) : (
        <h1>{group.data.name}</h1>
      )}

      <h2>Members</h2>
      {members.isSuccess && isAdmin && (
        <AddMemberForm
          groupId={groupId}
          memberIds={members.data.map((m) => m.id)}
          orgType={orgType}
        />
      )}
      {members.isSuccess && user?.role === 'instructor' && (
        <AddLearnerSearch
          groupId={groupId}
          memberIds={members.data.map((m) => m.id)}
          orgType={orgType}
        />
      )}

      {members.isPending && <p>Loading members…</p>}
      {members.isError && (
        <p className="error" role="alert">
          {members.error.message}
        </p>
      )}
      {members.isSuccess && members.data.length === 0 && <p className="muted">No members yet.</p>}
      {members.isSuccess && members.data.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {members.data.map((member) => (
                <MemberRow
                  key={member.id}
                  groupId={groupId}
                  member={member}
                  orgType={orgType}
                  // Matches the backend: admins remove anyone, instructors only learners.
                  canRemove={isAdmin || (user?.role === 'instructor' && member.role === 'learner')}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function GroupHeaderAdmin({ group, orgType }: { group: Group; orgType: OrgType }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(group.name)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const rename = useMutation({
    mutationFn: () => api.renameGroup(group.id, name),
    onSuccess: () => {
      setEditing(false)
      return queryClient.invalidateQueries({ queryKey: queryKeys.groups })
    },
  })

  const remove = useMutation({
    mutationFn: () => api.deleteGroup(group.id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: queryKeys.group(group.id) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.groups })
      navigate('/groups', { replace: true })
    },
  })

  function handleRename(event: FormEvent) {
    event.preventDefault()
    rename.mutate()
  }

  return (
    <div className="page-heading">
      {editing ? (
        <form className="inline-row" onSubmit={handleRename} aria-label="Rename">
          <input
            aria-label={`${groupLabel(orgType)} name`}
            required
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" disabled={rename.isPending}>
            Save
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setEditing(false)
              setName(group.name)
              rename.reset()
            }}
          >
            Cancel
          </button>
        </form>
      ) : (
        <h1>{group.name}</h1>
      )}

      {!editing && (
        <div className="button-row start">
          <button type="button" className="secondary small" onClick={() => setEditing(true)}>
            Rename
          </button>
          {!confirmingDelete && (
            <button
              type="button"
              className="danger small"
              onClick={() => setConfirmingDelete(true)}
            >
              Delete
            </button>
          )}
        </div>
      )}

      {confirmingDelete && (
        <div className="confirm" role="alertdialog" aria-label="Confirm delete">
          <p>
            Delete <strong>{group.name}</strong>? Its member list will be removed. People stay in
            your organisation.
          </p>
          <div className="button-row start">
            <button
              type="button"
              className="danger"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              {remove.isPending ? 'Deleting…' : `Delete ${groupLabel(orgType).toLowerCase()}`}
            </button>
            <button type="button" className="secondary" onClick={() => setConfirmingDelete(false)}>
              Keep it
            </button>
          </div>
        </div>
      )}

      {rename.isError && (
        <p className="error" role="alert">
          {rename.error.message}
        </p>
      )}
      {remove.isError && (
        <p className="error" role="alert">
          {remove.error.message}
        </p>
      )}
    </div>
  )
}

function AddMemberForm({
  groupId,
  memberIds,
  orgType,
}: {
  groupId: number
  memberIds: number[]
  orgType: OrgType
}) {
  const queryClient = useQueryClient()
  const [userId, setUserId] = useState('')

  // Active people in the organisation who aren't in this group yet.
  const people = useQuery({
    queryKey: queryKeys.userList({ is_active: true }),
    queryFn: ({ signal }) => api.listUsers({ is_active: true }, signal),
  })
  const candidates = (people.data ?? []).filter((p) => !memberIds.includes(p.id))

  const add = useMutation({
    mutationFn: () => api.addMember(groupId, Number(userId)),
    onSuccess: () => {
      setUserId('')
      // ['groups'] is a prefix of every group key, so this one call refreshes the
      // member list, this group, and the member counts on the list pages.
      return queryClient.invalidateQueries({ queryKey: queryKeys.groups })
    },
  })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    add.mutate()
  }

  return (
    <form className="inline-row" onSubmit={handleSubmit} aria-label="Add member">
      <select
        aria-label="Person to add"
        required
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        disabled={people.isPending}
      >
        <option value="">{people.isPending ? 'Loading people…' : 'Choose a person…'}</option>
        {candidates.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name} ({roleLabel(person.role, orgType)})
          </option>
        ))}
      </select>
      <button type="submit" disabled={add.isPending || userId === ''}>
        {add.isPending ? 'Adding…' : 'Add'}
      </button>
      {add.isError && (
        <p className="error" role="alert">
          {add.error.message}
        </p>
      )}
    </form>
  )
}

/** Instructors: search learners by name or email and add them to this group. */
function AddLearnerSearch({
  groupId,
  memberIds,
  orgType,
}: {
  groupId: number
  memberIds: number[]
  orgType: OrgType
}) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const term = useDebouncedValue(search.trim())
  const learnerWord = roleLabel('learner', orgType).toLowerCase()

  const results = useQuery({
    queryKey: queryKeys.learnerDirectory(term),
    queryFn: ({ signal }) => api.learnerDirectory(term, signal),
    enabled: term.length > 0, // nothing to look up until they type
  })
  const candidates = (results.data ?? []).filter((l) => !memberIds.includes(l.id))

  const add = useMutation({
    mutationFn: (userId: number) => api.addMember(groupId, userId),
    // Refreshes the member list and counts; the result list then hides the new member.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.groups }),
  })

  return (
    <div className="learner-search">
      <label htmlFor="learner-search">Add {withArticle(learnerWord)}</label>
      <input
        id="learner-search"
        type="search"
        placeholder="Search by name or email"
        autoComplete="off"
        maxLength={100}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {add.isError && (
        <p className="error" role="alert">
          {add.error.message}
        </p>
      )}

      {term.length > 0 && (
        <div aria-live="polite">
          {results.isPending && <p className="muted">Searching…</p>}
          {results.isError && (
            <p className="error" role="alert">
              {results.error.message}
            </p>
          )}
          {results.isSuccess && candidates.length === 0 && (
            <p className="muted">No matching {learnerWord}s to add.</p>
          )}
          {candidates.length > 0 && (
            <ul className="search-results" aria-label="Search results">
              {candidates.map((learner) => (
                <li key={learner.id}>
                  <span>
                    {learner.name} <span className="muted">{learner.email}</span>
                  </span>
                  <button
                    type="button"
                    className="secondary small"
                    aria-label={`Add ${learner.name}`}
                    disabled={add.isPending}
                    onClick={() => add.mutate(learner.id)}
                  >
                    Add
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function MemberRow({
  groupId,
  member,
  orgType,
  canRemove,
}: {
  groupId: number
  member: User
  orgType: OrgType
  canRemove: boolean
}) {
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: () => api.removeMember(groupId, member.id),
    // Refreshes the member list and the member counts (see AddMemberForm).
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.groups }),
  })

  return (
    <tr>
      <td>{member.name}</td>
      <td>{member.email}</td>
      <td>{roleLabel(member.role, orgType)}</td>
      <td>
        {canRemove && (
          <button
            type="button"
            className="secondary small"
            aria-label={`Remove ${member.name}`}
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
          >
            Remove
          </button>
        )}
        {remove.isError && (
          <p className="error" role="alert">
            {remove.error.message}
          </p>
        )}
      </td>
    </tr>
  )
}
