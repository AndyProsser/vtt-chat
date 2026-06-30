import { useEffect, useState } from 'react'
import { Alert, Box, Typography } from '@mui/material'
import { requestJson } from '../../utils/api'
import type { IntegrationSystem } from '@/types/integrations'

interface IntegrationsResponse {
  systems: IntegrationSystem[]
}

/** External Systems — formerly the standalone Integrations page. */
export function ExternalSystemsSection() {
  const [systems, setSystems] = useState<IntegrationSystem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busySystem, setBusySystem] = useState<string | null>(null)
  const [notesDrafts, setNotesDrafts] = useState<Record<string, string>>({})

  const loadSystems = async (showSpinner = true) => {
    if (showSpinner) setLoading(true)
    setError(null)
    try {
      const result = await requestJson<IntegrationsResponse>('/integrations/systems', { method: 'GET' })
      setSystems(result.systems)
      setNotesDrafts(
        Object.fromEntries(result.systems.map((s) => [s.system, s.notes ?? '']))
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load integration systems')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadSystems() }, [])

  const runMutation = async (system: string, path: string, init: RequestInit) => {
    setBusySystem(system)
    setError(null)
    try {
      await requestJson(path, init)
      await loadSystems(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update integration system')
    } finally {
      setBusySystem(null)
    }
  }

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Box>
        <Typography variant="h6">External Systems</Typography>
        <Typography variant="body2" color="text.secondary">
          Authorized Guilds — third-party systems permitted to authenticate players or push event logs.
        </Typography>
      </Box>

      {loading && <Typography color="text.secondary" variant="body2">Loading integration systems…</Typography>}
      {error && <Alert severity="error">{error}</Alert>}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>System</th>
              <th>State</th>
              <th>Scopes</th>
              <th>Activity</th>
              <th>Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {!loading && systems.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                  No external systems registered.
                </td>
              </tr>
            ) : (
              systems.map((sys) => {
                const busy = busySystem === sys.system
                return (
                  <tr key={sys.system}>
                    <td>
                      <strong>{sys.displayName}</strong>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{sys.system}</div>
                    </td>
                    <td>{sys.authorizationState}</td>
                    <td>{sys.allowedScopes.join(', ') || 'none'}</td>
                    <td>
                      <div>Linked users: {sys.metrics.linkedUsers}</div>
                      <div>Requests (24h): {sys.metrics.requests24h}</div>
                      <div>
                        Last seen:{' '}
                        {sys.metrics.lastSeenAt
                          ? new Date(sys.metrics.lastSeenAt).toLocaleString()
                          : 'n/a'}
                      </div>
                    </td>
                    <td>
                      <input
                        type="text"
                        aria-label={`Notes for ${sys.system}`}
                        value={notesDrafts[sys.system] ?? ''}
                        onChange={(e) =>
                          setNotesDrafts((prev) => ({ ...prev, [sys.system]: e.target.value }))
                        }
                        placeholder="Operational notes"
                      />
                    </td>
                    <td>
                      <div className="cell-actions">
                        <button
                          className="admin-btn"
                          disabled={busy}
                          onClick={() =>
                            void runMutation(
                              sys.system,
                              `/integrations/systems/${sys.system}/authorize`,
                              { method: 'POST' }
                            )
                          }
                        >
                          Authorize
                        </button>
                        <button
                          className="admin-btn admin-btn-ghost"
                          disabled={busy}
                          onClick={() =>
                            void runMutation(sys.system, `/integrations/systems/${sys.system}`, {
                              method: 'PATCH',
                              body: JSON.stringify({
                                authorizationState: 'LOG_ONLY',
                                notes: notesDrafts[sys.system] ?? '',
                              }),
                            })
                          }
                        >
                          Log Only
                        </button>
                        <button
                          className="admin-btn admin-btn-danger"
                          disabled={busy}
                          onClick={() =>
                            void runMutation(
                              sys.system,
                              `/integrations/systems/${sys.system}/block`,
                              { method: 'POST' }
                            )
                          }
                        >
                          Block
                        </button>
                        <button
                          className="admin-btn admin-btn-ghost"
                          disabled={busy}
                          onClick={() =>
                            void runMutation(sys.system, `/integrations/systems/${sys.system}`, {
                              method: 'PATCH',
                              body: JSON.stringify({ notes: notesDrafts[sys.system] ?? '' }),
                            })
                          }
                        >
                          Save Notes
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
    </Box>
  )
}
