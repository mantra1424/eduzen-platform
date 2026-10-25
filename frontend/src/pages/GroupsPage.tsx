import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { Link } from 'react-router'

import { api } from '../api/endpoints'
import { queryKeys } from '../api/queryKeys'
import type { Group, OrgType } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { useOrganization } from '../auth/useOrganization'
import { groupLabel, groupsLabel } from '../labels'

export function GroupsPage() {
  const { user } = useAuth()
  const orgType = useOrganization().data?.type ?? 'college'
  const isAdmin = user?.role === 'admin'

  // Admins manage every group; everyone else sees the groups they belong to.
  const groups = useQuery({
    queryKey: isAdmin ? queryKeys.groupList : queryKeys.myGroups,
    queryFn: ({ signal }) => (isAdmin ? api.listGroups(signal) : api.myGroups(signal)),
  })

  // Learners can't open member lists (the backend returns 403), so their rows aren't links.
  const canOpen = user?.role !== 'learner'

  return (
    <section>
      <div className="page-heading">
        <h1>{isAdmin ? groupsLabel(orgType) : `My ${groupsLabel(orgType).toLowerCase()}`}</h1>
      </div>

      {isAdmin && <NewGroupForm orgType={orgType} />}

      {groups.isPending && <p>Loading…</p>}
      {groups.isError && (
        <p className="error" role="alert">
          {groups.error.message}
        </p>
      )}
      {groups.isSuccess && groups.data.length === 0 && (
        <p className="muted">
          {isAdmin
            ? `No ${groupsLabel(orgType).toLowerCase()} yet. Create the first one above.`
            : `You haven't been added to any ${groupsLabel(orgType).toLowerCase()} yet.`}
        </p>
      )}
      {groups.isSuccess && groups.data.length > 0 && (
        <ul className="group-list">
          {groups.data.map((group) => (
            <GroupListItem key={group.id} group={group} canOpen={canOpen} />
          ))}
        </ul>
      )}
    </section>
  )
}

function GroupListItem({ group, canOpen }: { group: Group; canOpen: boolean }) {
  const count = `${group.member_count} ${group.member_count === 1 ? 'member' : 'members'}`
  return (
    <li className="card group-item">
      {canOpen ? <Link to={`/groups/${group.id}`}>{group.name}</Link> : <span>{group.name}</span>}
      <span className="muted">{count}</span>
    </li>
  )
}

function NewGroupForm({ orgType }: { orgType: OrgType }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')

  const create = useMutation({
    mutationFn: () => api.createGroup(name),
    onSuccess: () => {
      setName('')
      return queryClient.invalidateQueries({ queryKey: queryKeys.groups })
    },
  })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    create.mutate()
  }

  const label = `New ${groupLabel(orgType).toLowerCase()}`
  return (
    <form className="inline-row" onSubmit={handleSubmit} aria-label={label}>
      <input
        aria-label={`${groupLabel(orgType)} name`}
        placeholder={orgType === 'college' ? 'e.g. CE Sem 5' : 'e.g. Onboarding 2026'}
        required
        maxLength={200}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button type="submit" disabled={create.isPending}>
        {create.isPending ? 'Creating…' : `Create ${groupLabel(orgType).toLowerCase()}`}
      </button>
      {create.isError && (
        <p className="error" role="alert">
          {create.error.message}
        </p>
      )}
    </form>
  )
}
