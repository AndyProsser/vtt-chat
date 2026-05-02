import type { AdminLogRow, LogSortBy } from '@/types/logs'

interface LogsTableProps {
  rows: AdminLogRow[]
  detailLoadingId: string | null
  onToggleSort: (column: LogSortBy) => void
  sortIndicator: (column: LogSortBy) => string
  onOpenLogDetail: (row: AdminLogRow) => void
}

function renderDetailsPreview(details: AdminLogRow['details']): string {
  if (!details || Object.keys(details).length === 0) return '—'
  try {
    const text = JSON.stringify(details)
    return text.length > 120 ? `${text.slice(0, 117)}...` : text
  } catch {
    return 'details-unavailable'
  }
}

function detailsTitle(details: AdminLogRow['details']): string | undefined {
  if (!details || Object.keys(details).length === 0) return undefined
  try {
    return JSON.stringify(details)
  } catch {
    return undefined
  }
}

export function LogsTable({
  rows,
  detailLoadingId,
  onToggleSort,
  sortIndicator,
  onOpenLogDetail,
}: LogsTableProps) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>
              <button className="table-sort-btn" onClick={() => onToggleSort('timestamp')}>
                Timestamp {sortIndicator('timestamp')}
              </button>
            </th>
            <th>
              <button className="table-sort-btn" onClick={() => onToggleSort('severity')}>
                Severity {sortIndicator('severity')}
              </button>
            </th>
            <th>
              <button className="table-sort-btn" onClick={() => onToggleSort('source')}>
                Source {sortIndicator('source')}
              </button>
            </th>
            <th>
              <button className="table-sort-btn" onClick={() => onToggleSort('message')}>
                Message {sortIndicator('message')}
              </button>
            </th>
            <th>Details</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6}>No logs matched the current filters.</td>
            </tr>
          ) : (
            rows.map((row) => {
              const loading = detailLoadingId === row.id

              return (
                <tr key={row.id}>
                  <td>{new Date(row.timestamp).toLocaleString()}</td>
                  <td>{row.severity}</td>
                  <td>{row.source}</td>
                  <td>{row.message}</td>
                  <td title={detailsTitle(row.details)}>{renderDetailsPreview(row.details)}</td>
                  <td>
                    <button
                      className="admin-btn admin-btn-ghost"
                      disabled={loading}
                      onClick={() => onOpenLogDetail(row)}
                    >
                      {loading ? 'Loading...' : 'View'}
                    </button>
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
