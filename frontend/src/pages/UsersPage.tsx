import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'

import { api } from '../api/endpoints'
import { queryKeys } from '../api/queryKeys'
import type { OrgType, User, UserFilters, UserRole } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { useOrganization } from '../auth/useOrganization'
import { roleLabel } from '../labels'

const ROLES: UserRole[] = ['admin', 'instructor', 'learner']

export function UsersPage() {
  const { user: me } = useAuth()
  const orgType = useOrganization().data?.type ?? 'college'
  const [filters, setFilters] = useState<UserFilters>({})

  const users = useQuery({
    queryKey: queryKeys.userList(filters),
    queryFn: ({ signal }) => api.listUsers(filters, signal),
  })

  return (
    <section>
      <div className="page-heading">
        <h1>People</h1>
      </div>

      <AddPersonForm orgType={orgType} />

      <div className="filters" role="group" aria-label="Filters">
        <label>
          Role
          <select
            value={filters.role ?? ''}
            onChange={(e) =>
              setFilters({
                ...filters,
                role: (e.target.value || undefined) as UserRole | undefined,
              })
            }
          >
            <option value="">All roles</option>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {roleLabel(role, orgType)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            value={filters.is_active === undefined ? '' : String(filters.is_active)}
            onChange={(e) =>
              setFilters({
                ...filters,
                is_active: e.target.value === '' ? undefined : e.target.value === 'true',
              })
            }
          >
            <option value="">Everyone</option>
            <option value="true">Active</option>
            <option value="false">Deactivated</option>
          </select>
        </label>
      </div>

      {users.isPending && <p>Loading people…</p>}
      {users.isError && (
        <p className="error" role="alert">
          {users.error.message}
        </p>
      )}
      {users.isSuccess && users.data.length === 0 && (
        <p className="muted">No one matches these filters.</p>
      )}
      {users.isSuccess && users.data.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {users.data.map((person) => (
                <UserRow
                  key={person.id}
                  person={person}
                  isMe={person.id === me?.id}
                  orgType={orgType}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function UserRow({ person, isMe, orgType }: { person: User; isMe: boolean; orgType: OrgType }) {
  const queryClient = useQueryClient()
  const update = useMutation({
    mutationFn: (changes: { role?: UserRole; is_active?: boolean }) =>
      api.updateUser(person.id, changes),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.users }),
  })

  return (
    <tr className={person.is_active ? undefined : 'inactive'}>
      <td>
        {person.name}
        {isMe && <span className="muted"> (you)</span>}
      </td>
      <td>{person.email}</td>
      <td>
        <select
          aria-label={`Role for ${person.name}`}
          value={person.role}
          // The backend refuses to let admins change their own role (lockout protection).
          disabled={isMe || update.isPending}
          onChange={(e) => update.mutate({ role: e.target.value as UserRole })}
        >
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {roleLabel(role, orgType)}
            </option>
          ))}
        </select>
      </td>
      <td>
        <span className={person.is_active ? 'badge success' : 'badge'}>
          {person.is_active ? 'Active' : 'Deactivated'}
        </span>{' '}
        {!isMe && (
          <button
            type="button"
            className="secondary small"
            disabled={update.isPending}
            onClick={() => update.mutate({ is_active: !person.is_active })}
          >
            {person.is_active ? 'Deactivate' : 'Reactivate'}
          </button>
        )}
        {update.isError && (
          <p className="error" role="alert">
            {update.error.message}
          </p>
        )}
      </td>
    </tr>
  )
}

function AddPersonForm({ orgType }: { orgType: OrgType }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<UserRole>('learner')
  const [password, setPassword] = useState('')
  const [added, setAdded] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () => api.createUser({ name, email, role, password }),
    onSuccess: (user) => {
      setAdded(`${user.name} was added. Share their temporary password with them.`)
      setName('')
      setEmail('')
      setPassword('')
      return queryClient.invalidateQueries({ queryKey: queryKeys.users })
    },
  })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setAdded(null)
    create.mutate()
  }

  if (!open) {
    return (
      <div className="toolbar">
        <button type="button" onClick={() => setOpen(true)}>
          Add person
        </button>
        {added && (
          <p className="success" role="status">
            {added}
          </p>
        )}
      </div>
    )
  }

  return (
    <form className="form card inline-form" onSubmit={handleSubmit} aria-label="Add person">
      <h2>Add person</h2>
      <label>
        Name
        <input required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Email
        <input
          type="email"
          required
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label>
        Role
        <select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {roleLabel(r, orgType)}
            </option>
          ))}
        </select>
      </label>
      <div className="field">
        <label htmlFor="new-user-password">Temporary password</label>
        <input
          id="new-user-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          aria-describedby="new-user-password-hint"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <small id="new-user-password-hint" className="muted">
          At least 8 characters. Share it with them privately.
        </small>
      </div>

      {create.isError && (
        <p className="error" role="alert">
          {create.error.message}
        </p>
      )}
      {added && (
        <p className="success" role="status">
          {added}
        </p>
      )}

      <div className="button-row start">
        <button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Adding…' : 'Add person'}
        </button>
        <button type="button" className="secondary" onClick={() => setOpen(false)}>
          Done
        </button>
      </div>
    </form>
  )
}
