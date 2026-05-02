import type { AdminUserRow } from '@/types/users'
import { roleLabel } from '@/types/users'

interface UserTableProps {
  rows: AdminUserRow[]
  actionBusyUserId: string | null
  onRunAction: (
    userId: string,
    method: 'PATCH' | 'POST',
    path: string,
    defaultReason: string
  ) => void
}

export function UserTable({ rows, actionBusyUserId, onRunAction }: UserTableProps) {
  return (
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
                            onRunAction(
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
                            onRunAction(
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
                          onRunAction(
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
  )
}
