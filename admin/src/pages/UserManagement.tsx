import { useEffect, useMemo, useState } from 'react'
import { requestJson } from '../utils/api'

type UserRole = 'DM' | 'PLAYER' | 'SPECTATOR'
type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'CAMPAIGN_DM' | 'READ_ONLY'

interface AdminUserRow {
  id: string
  username: string
  email: string | null
  displayName: string
  role: UserRole
  adminRole: AdminRole | null
  effectiveAdminRole: AdminRole | null
  isActive: boolean
  tokenInvalidBefore: string | null
  createdAt: string
  updatedAt: string
}

interface UserListResponse {
  users: AdminUserRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

function roleLabel(role: UserRole, adminRole: AdminRole | null): string {
  if (adminRole) return `${role} / ${adminRole}`
  return role
}

export default function UserManagement() {
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [rows, setRows] = useState<AdminUserRow[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionBusyUserId, setActionBusyUserId] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'ADMIN' | 'CAMPAIGN_DM' | 'READ_ONLY'>('ADMIN')
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [creatingInvite, setCreatingInvite] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      search,
      role: roleFilter,
      status: statusFilter,
      page: String(page),
      pageSize: String(pageSize),
    })
    return params.toString()
  }, [search, roleFilter, statusFilter, page, pageSize])

  useEffect(() => {
    const loadUsers = async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await requestJson<UserListResponse>(`/users?${queryString}`, {
          method: 'GET',
        })
        setRows(result.users)
        setTotal(result.total)
        setTotalPages(result.totalPages)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load users')
      } finally {
        setLoading(false)
      }
    }

    void loadUsers()
  }, [queryString, reloadToken])

  const runAction = async (
    userId: string,
    method: 'PATCH' | 'POST',
    path: string,
    defaultReason: string
  ) => {
    const reason = window.prompt('Provide a reason for this moderation action', defaultReason)
    if (reason === null) return

    setActionBusyUserId(userId)
    setError(null)
    try {
      await requestJson<{ message: string }>(path, {
        method,
        body: JSON.stringify({ reason }),
      })
      setReloadToken((current) => current + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Moderation action failed')
    } finally {
      setActionBusyUserId(null)
    }
  }

  const createInvite = async () => {
    setCreatingInvite(true)
    setError(null)
    setInviteUrl(null)
    try {
      const result = await requestJson<{ inviteUrl: string }>('/invites', {
        method: 'POST',
        body: JSON.stringify({
          email: inviteEmail.trim() || undefined,
          adminRole: inviteRole,
        }),
      })
      setInviteUrl(result.inviteUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invite')
    } finally {
      setCreatingInvite(false)
    }
  }

  return (
    <section className="admin-page">
      <h2 className="admin-page-title">Users</h2>
      <p className="admin-page-subtitle">Search, filter, and moderate user accounts.</p>

      {loading && <p className="admin-inline-status">Loading users...</p>}
      {error && <p className="admin-inline-error">{error}</p>}

      <div className="admin-toolbar-row wrap">
        <input
          type="search"
          placeholder="Search username, email, or display name"
          aria-label="Search users"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
        />
        <select
          aria-label="Filter by role"
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value)
            setPage(1)
          }}
        >
          <option value="all">All roles</option>
          <option value="dm">DM</option>
          <option value="player">Player</option>
          <option value="spectator">Spectator</option>
          <option value="admin">Admin-capable</option>
        </select>
        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            setPage(1)
          }}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
        <select
          aria-label="Rows per page"
          value={String(pageSize)}
          onChange={(e) => {
            setPageSize(Number(e.target.value))
            setPage(1)
          }}
        >
          <option value="10">10 / page</option>
          <option value="25">25 / page</option>
          <option value="50">50 / page</option>
        </select>
      </div>

      <section className="admin-card">
        <h3>Create Admin Invite</h3>
        <p className="admin-page-subtitle">Invite non-existing users with scoped admin access.</p>
        <div className="admin-toolbar-row wrap">
          <input
            type="email"
            placeholder="Optional email restriction"
            aria-label="Invite email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as 'ADMIN' | 'CAMPAIGN_DM' | 'READ_ONLY')}
          >
            <option value="ADMIN">ADMIN</option>
            <option value="CAMPAIGN_DM">CAMPAIGN_DM</option>
            <option value="READ_ONLY">READ_ONLY</option>
          </select>
          <button
            className="admin-btn"
            onClick={() => void createInvite()}
            disabled={creatingInvite}
          >
            {creatingInvite ? 'Creating...' : 'Generate Invite Link'}
          </button>
        </div>
        {inviteUrl && (
          <div className="admin-card admin-card-nested">
            <p className="admin-page-subtitle">Invite URL</p>
            <p>{inviteUrl}</p>
          </div>
        )}
      </section>

      <p className="admin-page-subtitle">
        Showing {rows.length} of {total} users (page {page}/{totalPages})
      </p>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Email</th>
              <th>Role</th>
              <th>Updated</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6}>No users matched the current filter.</td>
              </tr>
            ) : (
              rows.map((row) => {
                const busy = actionBusyUserId === row.id
                return (
                  <tr key={row.id}>
                    <td>{row.username}</td>
                    <td>{row.email || '—'}</td>
                    <td>{roleLabel(row.role, row.effectiveAdminRole)}</td>
                    <td>{new Date(row.updatedAt).toLocaleString()}</td>
                    <td>{row.isActive ? 'Active' : 'Suspended'}</td>
                    <td>
                      <div className="cell-actions">
                        {row.isActive ? (
                          <button
                            className="admin-btn admin-btn-ghost"
                            disabled={busy}
                            onClick={() =>
                              void runAction(
                                row.id,
                                'PATCH',
                                `/users/${row.id}/suspend`,
                                'Policy or moderation breach'
                              )
                            }
                          >
                            {busy ? 'Working...' : 'Suspend'}
                          </button>
                        ) : (
                          <button
                            className="admin-btn"
                            disabled={busy}
                            onClick={() =>
                              void runAction(
                                row.id,
                                'PATCH',
                                `/users/${row.id}/restore`,
                                'Issue resolved'
                              )
                            }
                          >
                            {busy ? 'Working...' : 'Restore'}
                          </button>
                        )}
                        <button
                          className="admin-btn admin-btn-ghost"
                          disabled={busy}
                          onClick={() =>
                            void runAction(
                              row.id,
                              'POST',
                              `/users/${row.id}/force-logout`,
                              'Security policy refresh'
                            )
                          }
                        >
                          Force Logout
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="admin-pagination">
        <button
          className="admin-btn admin-btn-ghost"
          disabled={page <= 1 || loading}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Previous
        </button>
        <span>
          Page {page} of {totalPages}
        </span>
        <button
          className="admin-btn admin-btn-ghost"
          disabled={page >= totalPages || loading}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
        >
          Next
        </button>
      </div>
    </section>
  )
}
