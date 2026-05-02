import type { AdminLogRow } from './types'

interface LogDetailsPanelProps {
  log: AdminLogRow
  onClose: () => void
}

export function LogDetailsPanel({ log, onClose }: LogDetailsPanelProps) {
  return (
    <section className="admin-card admin-card-nested" aria-label="Log details">
      <div className="admin-detail-header">
        <h3 className="admin-page-title">Log Detail</h3>
        <button className="admin-btn admin-btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="kv-grid">
        <div>
          <strong>ID</strong>
          <p>{log.id}</p>
        </div>
        <div>
          <strong>Timestamp</strong>
          <p>{new Date(log.timestamp).toLocaleString()}</p>
        </div>
        <div>
          <strong>Severity</strong>
          <p>{log.severity}</p>
        </div>
        <div>
          <strong>Source</strong>
          <p>{log.source}</p>
        </div>
      </div>

      <div className="admin-card admin-card-nested">
        <h3>Message</h3>
        <p>{log.message}</p>
      </div>

      <div className="admin-card admin-card-nested">
        <h3>Details</h3>
        <pre className="admin-log-details-json">{JSON.stringify(log.details || {}, null, 2)}</pre>
      </div>
    </section>
  )
}
