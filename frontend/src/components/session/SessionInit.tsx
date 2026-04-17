/**
 * Session Initialization
 * Component for creating a new session and transitioning to active state.
 * Tests the full UI → Event → Store pipeline.
 */

import { useState } from 'react'
import type { UUID, Role } from '@shared'
import { useStore } from '../../hooks/useStore'
import { useWebSocket } from '../../hooks/useWebSocket'

interface SessionInitProps {
  apiUrl: string
  wsUrl: string
  token: string
  user: { id: UUID; username: string; role: Role }
  onSessionCreated?: (sessionId: UUID) => void
}

export function SessionInit({ apiUrl, wsUrl, token, user, onSessionCreated }: SessionInitProps) {
  const [sessionName, setSessionName] = useState('')
  const [sessionDescription, setSessionDescription] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // WebSocket connection
  const { state: wsState, isConnected, error: wsError, send } = useWebSocket({
    url: wsUrl,
    token,
    enabled: !!token,
  })

  // Store
  const store = useStore()
  const { sessions, currentSessionId } = store
  const sessionList = Object.values(sessions)
  const currentSession = currentSessionId ? sessions[currentSessionId] : null

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsCreating(true)

    try {
      const response = await fetch(`${apiUrl}/api/session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: sessionName,
          description: sessionDescription || undefined,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to create session')
      }

      const session = await response.json()
      console.log('Session created:', session)

      // Set as current session
      store.setCurrentSession(session.id)
      onSessionCreated?.(session.id)

      setSessionName('')
      setSessionDescription('')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred'
      setError(message)
      console.error('Session creation error:', err)
    } finally {
      setIsCreating(false)
    }
  }

  const handleStartSession = async (sessionId: UUID) => {
    setError(null)

    try {
      const response = await fetch(`${apiUrl}/api/session/${sessionId}/state`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          state: 'ACTIVE',
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to start session')
      }

      const updatedSession = await response.json()
      console.log('Session started:', updatedSession)
      store.updateSession(sessionId, { state: updatedSession.state })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred'
      setError(message)
      console.error('Session start error:', err)
    }
  }

  return (
    <div
      style={{
        maxWidth: '600px',
        margin: '0 auto',
        padding: '2rem 1rem',
      }}
    >
      {/* User Info & WS Status */}
      <div
        style={{
          marginBottom: '2rem',
          padding: '1rem',
          backgroundColor: '#f1f5f9',
          borderRadius: '8px',
        }}
      >
        <p style={{ margin: '0.5rem 0' }}>
          <strong>User:</strong> {user.username} ({user.role})
        </p>
        <p style={{ margin: '0.5rem 0' }}>
          <strong>WebSocket:</strong>{' '}
          <span
            style={{
              color: isConnected ? '#22c55e' : wsState === 'connecting' ? '#f59e0b' : '#ef4444',
              fontWeight: '500',
            }}
          >
            {wsState}
          </span>
        </p>
        {wsError && (
          <p style={{ margin: '0.5rem 0', color: '#dc2626' }}>
            <strong>WS Error:</strong> {wsError.message}
          </p>
        )}
      </div>

      {/* Create Session Form */}
      <form
        onSubmit={handleCreateSession}
        style={{
          marginBottom: '2rem',
          padding: '1.5rem',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          backgroundColor: '#fff',
        }}
      >
        <h3 style={{ marginTop: 0 }}>Create New Session</h3>

        {error && (
          <div
            style={{
              padding: '0.75rem',
              marginBottom: '1rem',
              backgroundColor: '#fee2e2',
              color: '#991b1b',
              borderRadius: '4px',
              fontSize: '0.875rem',
            }}
          >
            {error}
          </div>
        )}

        <div style={{ marginBottom: '1rem' }}>
          <label
            htmlFor="sessionName"
            style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: '500',
              fontSize: '0.875rem',
            }}
          >
            Session Name *
          </label>
          <input
            id="sessionName"
            type="text"
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            placeholder="e.g., Dragon's Lair Campaign"
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #cbd5e1',
              borderRadius: '4px',
              fontSize: '0.875rem',
              boxSizing: 'border-box',
            }}
            disabled={isCreating}
            required
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label
            htmlFor="sessionDescription"
            style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: '500',
              fontSize: '0.875rem',
            }}
          >
            Description (optional)
          </label>
          <textarea
            id="sessionDescription"
            value={sessionDescription}
            onChange={(e) => setSessionDescription(e.target.value)}
            placeholder="Add session details..."
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #cbd5e1',
              borderRadius: '4px',
              fontSize: '0.875rem',
              boxSizing: 'border-box',
              minHeight: '80px',
              fontFamily: 'inherit',
            }}
            disabled={isCreating}
          />
        </div>

        <button
          type="submit"
          disabled={isCreating || !sessionName.trim() || !isConnected}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor:
              isCreating || !sessionName.trim() || !isConnected ? '#cbd5e1' : '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontWeight: '500',
            cursor:
              isCreating || !sessionName.trim() || !isConnected ? 'not-allowed' : 'pointer',
            fontSize: '0.875rem',
          }}
        >
          {isCreating ? 'Creating...' : 'Create Session'}
        </button>
      </form>

      {/* Session List */}
      {sessionList.length > 0 && (
        <div
          style={{
            padding: '1.5rem',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            backgroundColor: '#fff',
          }}
        >
          <h3 style={{ marginTop: 0 }}>Sessions ({sessionList.length})</h3>

          {sessionList.map((session) => (
            <div
              key={session.id}
              style={{
                marginBottom: '1rem',
                padding: '1rem',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                backgroundColor: currentSession?.id === session.id ? '#dbeafe' : '#f9fafb',
              }}
            >
              <p style={{ margin: '0.25rem 0', fontWeight: '500' }}>
                {session.name} {currentSession?.id === session.id && '(current)'}
              </p>
              <p style={{ margin: '0.25rem 0', fontSize: '0.875rem', color: '#64748b' }}>
                Status: <strong>{session.state}</strong>
              </p>
              {session.description && (
                <p style={{ margin: '0.25rem 0', fontSize: '0.875rem', color: '#64748b' }}>
                  {session.description}
                </p>
              )}
              <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                {session.state === 'IDLE' && user.role === 'DM' && (
                  <button
                    onClick={() => handleStartSession(session.id)}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                    }}
                  >
                    Start Session
                  </button>
                )}
                {user.role === 'DM' && (
                  <button
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
