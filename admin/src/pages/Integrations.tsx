import { useEffect, useState } from 'react'
import { requestJson } from '../utils/api'

type AuthorizationState = 'AUTHORIZED' | 'LOG_ONLY' | 'BLOCKED'

type Scope = 'auth' | 'log_ingestion' | 'metadata_sync'

interface IntegrationSystem {
  system: string
  displayName: string
  authCapable: boolean
  logIngestionCapable: boolean
  metadataSyncCapable: boolean
  authorizationState: AuthorizationState
  allowedScopes: Scope[]
  notes: string
  lastUpdatedAt: string
  metrics: {
    linkedUsers: number
    requests24h: number
    lastSeenAt: string | null
  }
}

export default function Integrations() {
  const [systems, setSystems] = useState<IntegrationSystem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busySystem, setBusySystem] = useState<string | null>(null)
  const [notesDrafts, setNotesDrafts] = useState<Record<string, string>>({})

  const loadSystems = async (showSpinner: boolean = true) => {
    if (showSpinner) {
      setLoading(true)
      setError(null)
    }

    try {
      const result = await requestJson<{ systems: IntegrationSystem[] }>('/integrations/systems', {
        method: 'GET',
      })
      setSystems(result.systems)
      setNotesDrafts(
        Object.fromEntries(result.systems.map((system) => [system.system, system.notes || '']))
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load integration systems')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const loadOnMount = async () => {
      try {
        const result = await requestJson<{ systems: IntegrationSystem[] }>(
          '/integrations/systems',
          {
            method: 'GET',
          }
        )
        setSystems(result.systems)
        setNotesDrafts(
          Object.fromEntries(result.systems.map((system) => [system.system, system.notes || '']))
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load integration systems')
      } finally {
        setLoading(false)
      }
    }

    void loadOnMount()
  }, [])

  const runMutation = async (system: string, path: string, init: RequestInit) => {
    setBusySystem(system)
    setError(null)

    try {
      await requestJson(path, init)
      await loadSystems(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update integration system')
    } finally {
      setBusySystem(null)
    }
  }

  return (
    <section className="admin-page">
      <h2 className="admin-page-title">Integrations</h2>
      <p className="admin-page-subtitle">
        Authorize, restrict, or block external VTT systems for guest auth and log ingestion.
      </p>

      {loading && <p className="admin-inline-status">Loading integration systems...</p>}
      {error && <p className="admin-inline-error">{error}</p>}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>System</th>
              <th>State</th>
              <th>Allowed Scopes</th>
              <th>Activity</th>
              <th>Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {systems.length === 0 ? (
              <tr>
                <td colSpan={6}>No integration systems found.</td>
              </tr>
            ) : (
              systems.map((system) => {
                const busy = busySystem === system.system

                return (
                  <tr key={system.system}>
                    <td>
                      <strong>{system.displayName}</strong>
                      <div className="admin-page-subtitle">{system.system}</div>
                    </td>
                    <td>{system.authorizationState}</td>
                    <td>{system.allowedScopes.join(', ') || 'none'}</td>
                    <td>
                      <div>Linked users: {system.metrics.linkedUsers}</div>
                      <div>Requests (24h): {system.metrics.requests24h}</div>
                      <div>
                        Last seen:{' '}
                        {system.metrics.lastSeenAt
                          ? new Date(system.metrics.lastSeenAt).toLocaleString()
                          : 'n/a'}
                      </div>
                    </td>
                    <td>
                      <input
                        type="text"
                        aria-label={`Notes for ${system.system}`}
                        value={notesDrafts[system.system] || ''}
                        onChange={(event) =>
                          setNotesDrafts((current) => ({
                            ...current,
                            [system.system]: event.target.value,
                          }))
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
                              system.system,
                              `/integrations/systems/${system.system}/authorize`,
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
                            void runMutation(
                              system.system,
                              `/integrations/systems/${system.system}`,
                              {
                                method: 'PATCH',
                                body: JSON.stringify({
                                  authorizationState: 'LOG_ONLY',
                                  notes: notesDrafts[system.system] || '',
                                }),
                              }
                            )
                          }
                        >
                          Log Only
                        </button>
                        <button
                          className="admin-btn admin-btn-danger"
                          disabled={busy}
                          onClick={() =>
                            void runMutation(
                              system.system,
                              `/integrations/systems/${system.system}/block`,
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
                            void runMutation(
                              system.system,
                              `/integrations/systems/${system.system}`,
                              {
                                method: 'PATCH',
                                body: JSON.stringify({
                                  notes: notesDrafts[system.system] || '',
                                }),
                              }
                            )
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
    </section>
  )
}
