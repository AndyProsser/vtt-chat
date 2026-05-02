import { useState } from 'react'
import type { UserImportPreviewResponse } from './types'

interface UserExportImportPanelProps {
  exportBusy: boolean
  importPreview: UserImportPreviewResponse | null
  importBusy: boolean
  importError: string | null
  onExport: (format: 'json' | 'csv') => void
  onPreviewImport: (jsonText: string) => void
  onClearImport: () => void
}

export function UserExportImportPanel({
  exportBusy,
  importPreview,
  importBusy,
  importError,
  onExport,
  onPreviewImport,
  onClearImport,
}: UserExportImportPanelProps) {
  const [importText, setImportText] = useState('')
  const [showImport, setShowImport] = useState(false)

  const handlePreview = () => {
    if (importText.trim()) {
      onPreviewImport(importText.trim())
    }
  }

  const handleClear = () => {
    setImportText('')
    onClearImport()
  }

  return (
    <div className="admin-panel">
      <h3 className="admin-panel-title">Data Export / Import</h3>

      <div className="admin-row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
        <button className="admin-btn" disabled={exportBusy} onClick={() => onExport('json')}>
          {exportBusy ? 'Exporting...' : 'Export JSON'}
        </button>
        <button
          className="admin-btn admin-btn-ghost"
          disabled={exportBusy}
          onClick={() => onExport('csv')}
        >
          {exportBusy ? 'Exporting...' : 'Export CSV'}
        </button>
        <button
          className="admin-btn admin-btn-ghost"
          onClick={() => {
            setShowImport((s) => !s)
            if (showImport) handleClear()
          }}
        >
          {showImport ? 'Cancel Import' : 'Import Users'}
        </button>
      </div>

      {showImport && !importPreview && (
        <div className="admin-panel-section">
          <p className="admin-hint">
            Paste a JSON array of user objects or a previously exported users file. Only new
            usernames (no conflicts) will be importable. Import is preview-only — contact your
            deployment team to commit.
          </p>
          <textarea
            className="admin-textarea"
            rows={8}
            placeholder={'[{ "username": "...", "email": "...", "role": "PLAYER" }]'}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          {importError && <p className="admin-inline-error">{importError}</p>}
          <div className="admin-row" style={{ marginTop: '0.5rem' }}>
            <button
              className="admin-btn"
              disabled={importBusy || !importText.trim()}
              onClick={handlePreview}
            >
              {importBusy ? 'Analysing...' : 'Preview Import'}
            </button>
          </div>
        </div>
      )}

      {importPreview && (
        <div className="admin-panel-section">
          <p className="admin-hint">
            Preview: {importPreview.importable} of {importPreview.total} rows are importable (valid,
            no conflicts).
          </p>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {importPreview.preview.map((row) => (
                  <tr key={row.index} className={row.conflict || !row.valid ? 'row-warning' : ''}>
                    <td>{row.index + 1}</td>
                    <td>{row.username || '—'}</td>
                    <td>{row.email || '—'}</td>
                    <td>{row.role}</td>
                    <td>{!row.valid ? 'Invalid' : row.conflict ? 'Conflict' : 'Importable'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="admin-row" style={{ marginTop: '0.5rem' }}>
            <button className="admin-btn admin-btn-ghost" onClick={handleClear}>
              Clear Preview
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
