/**
 * Session Initialization
 * Component for creating a new session and transitioning to active state.
 * Tests the full UI → Event → Store pipeline.
 */

import { useEffect, useState } from 'react'
import { SessionState } from '@shared'
import type { UUID, Role } from '@shared'
import { PresenceState, RoomType } from '@shared'
import { useStore } from '../../hooks/useStore'
import { useWebSocket } from '../../hooks/useWebSocket'
import { ChatWindow } from '../chat/ChatWindow'
import { NotesPanel } from '../notes/NotesPanel'
import type { Session as SessionRecord } from '../../state/sessionSlice'
import type {
  Room as RoomRecord,
  RoomUser as RoomMember,
  SessionPresence as PresenceRecord,
} from '../../state/roomSlice'

interface SessionInitProps {
  apiUrl: string
  wsUrl: string
  token: string
  user: { id: UUID; username: string; role: Role }
  onSessionCreated?: (sessionId: UUID) => void
}

interface CampaignSummary {
  id: UUID
  name: string
  description?: string | null
  inviteCode: string
  currentDmId: UUID
}

interface ApiRoom {
  id: UUID
  sessionId: UUID
  name: string
  type: RoomType
  createdBy: UUID
  createdAt: number
}

interface ApiPresence {
  sessionId: UUID
  userId: UUID
  username: string
  primaryRoomId?: UUID
  privateRoomId?: UUID
  state: PresenceState
  lastSeenAt: number
}

function formatTransitionNotice(params: {
  nextState: SessionState
  movedUsers: number
  targetRoomName: string
  targetState: PresenceState
}): string {
  const stateLabel = params.nextState.toLowerCase()
  const usersLabel = params.movedUsers === 1 ? '1 user' : `${params.movedUsers} users`
  const targetStateLabel = params.targetState.toLowerCase()
  return `Session ${stateLabel}: moved ${usersLabel} to ${params.targetRoomName} (${targetStateLabel}).`
}

export function SessionInit({ apiUrl, wsUrl, token, user, onSessionCreated }: SessionInitProps) {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([])
  const [selectedCampaignId, setSelectedCampaignId] = useState<UUID | ''>('')
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(true)
  const [isCreatingCampaign, setIsCreatingCampaign] = useState(false)
  const [newCampaignName, setNewCampaignName] = useState('')
  const [newCampaignDescription, setNewCampaignDescription] = useState('')
  const [joinCampaignId, setJoinCampaignId] = useState('')
  const [joinInviteCode, setJoinInviteCode] = useState('')
  const [isJoiningCampaign, setIsJoiningCampaign] = useState(false)
  const [sessionName, setSessionName] = useState('')
  const [sessionDescription, setSessionDescription] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [isLoadingSessions, setIsLoadingSessions] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dismissedTransitionEventId, setDismissedTransitionEventId] = useState<string | null>(null)
  const [activeTransitionEventId, setActiveTransitionEventId] = useState<string | null>(null)
  const [isTransitionToastVisible, setIsTransitionToastVisible] = useState(false)

  // WebSocket connection
  const {
    state: wsState,
    isConnected,
    error: wsError,
  } = useWebSocket({
    url: wsUrl,
    token,
    enabled: !!token,
  })

  // Store
  const store = useStore()
  const { sessions, currentSessionId } = store
  const typedSessions = sessions as Record<UUID, SessionRecord>
  const sessionList: SessionRecord[] = Object.values(typedSessions)
  const currentSession = currentSessionId ? sessions[currentSessionId] : null
  const typedRoomsBySession = store.rooms as Record<UUID, Record<UUID, RoomRecord>>
  const typedPresenceBySession = store.sessionPresence as Record<UUID, Record<UUID, PresenceRecord>>
  const typedRoomMembers = store.roomMembers as Record<UUID, RoomMember[]>
  const currentRooms: RoomRecord[] = currentSession
    ? Object.values(typedRoomsBySession[currentSession.id] || {})
    : []
  const currentPresence: PresenceRecord[] = currentSession
    ? Object.values(typedPresenceBySession[currentSession.id] || {})
    : []
  const currentTransitionNotice = currentSession
    ? store.sessionTransitionNotice[currentSession.id]
    : undefined

  const activeTransitionNotice =
    currentTransitionNotice && currentTransitionNotice.eventId === activeTransitionEventId
      ? currentTransitionNotice
      : undefined

  const hideTransitionToast = () => {
    setIsTransitionToastVisible(false)

    const closingEventId = activeTransitionEventId
    if (!closingEventId) {
      return
    }

    setTimeout(() => {
      setDismissedTransitionEventId(closingEventId)
      setActiveTransitionEventId((prev) => (prev === closingEventId ? null : prev))
    }, 180)
  }

  useEffect(() => {
    if (!currentTransitionNotice) {
      return
    }

    if (currentTransitionNotice.eventId === dismissedTransitionEventId) {
      return
    }

    setDismissedTransitionEventId((prev) =>
      prev === currentTransitionNotice.eventId ? prev : null
    )
    setActiveTransitionEventId(currentTransitionNotice.eventId)

    const enterId = requestAnimationFrame(() => {
      setIsTransitionToastVisible(true)
    })

    const timeoutId = setTimeout(() => {
      hideTransitionToast()
    }, 6000)

    return () => {
      cancelAnimationFrame(enterId)
      clearTimeout(timeoutId)
    }
  }, [currentTransitionNotice, dismissedTransitionEventId, activeTransitionEventId])

  useEffect(() => {
    const loadCampaigns = async () => {
      setIsLoadingCampaigns(true)
      setError(null)

      try {
        const response = await fetch(`${apiUrl}/api/campaigns`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.message || 'Failed to load sessions')
        }

        const data = await response.json()
        const nextCampaigns = (data.campaigns || []) as CampaignSummary[]
        setCampaigns(nextCampaigns)

        if (nextCampaigns.length > 0) {
          setSelectedCampaignId((prev) => prev || (nextCampaigns[0].id as UUID))
        } else {
          setSelectedCampaignId('')
          store.clearSessions()
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An error occurred'
        setError(message)
      } finally {
        setIsLoadingCampaigns(false)
      }
    }

    void loadCampaigns()
  }, [apiUrl, token, store])

  useEffect(() => {
    const loadCampaignSessions = async () => {
      if (!selectedCampaignId) {
        store.clearSessions()
        setIsLoadingSessions(false)
        return
      }

      setIsLoadingSessions(true)
      setError(null)

      try {
        const response = await fetch(`${apiUrl}/api/campaigns/${selectedCampaignId}/sessions`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.message || 'Failed to load campaign sessions')
        }

        const data = await response.json()
        store.replaceSessions(data.sessions || [])
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An error occurred'
        setError(message)
      } finally {
        setIsLoadingSessions(false)
      }
    }

    void loadCampaignSessions()
  }, [apiUrl, selectedCampaignId, token, store])

  useEffect(() => {
    if (!currentSession || wsState !== 'connected') {
      return
    }

    const loadPresenceAndRooms = async () => {
      try {
        const [roomsResponse, presenceResponse] = await Promise.all([
          fetch(`${apiUrl}/api/rooms/${currentSession.id}`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }),
          fetch(`${apiUrl}/api/presence/${currentSession.id}`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }),
        ])

        if (!roomsResponse.ok || !presenceResponse.ok) {
          return
        }

        const roomsPayload = (await roomsResponse.json()) as { rooms?: ApiRoom[] }
        const presencePayload = (await presenceResponse.json()) as { presence?: ApiPresence[] }

        store.replaceSessionRooms(
          currentSession.id,
          (roomsPayload.rooms || []).map((room) => ({
            id: room.id,
            sessionId: room.sessionId,
            name: room.name,
            type: room.type,
            createdAt: room.createdAt,
            createdBy: room.createdBy,
          }))
        )

        store.replaceSessionPresence(
          currentSession.id,
          (presencePayload.presence || []).map((entry) => ({
            userId: entry.userId,
            username: entry.username,
            state: entry.state,
            primaryRoomId: entry.primaryRoomId,
            privateRoomId: entry.privateRoomId,
            lastSeenAt: entry.lastSeenAt,
          }))
        )
      } catch {
        // Event-driven websocket updates continue to flow even if this refresh fails.
      }
    }

    void loadPresenceAndRooms()
  }, [apiUrl, currentSession, token, wsState, store])

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsCreatingCampaign(true)

    try {
      const response = await fetch(`${apiUrl}/api/campaigns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newCampaignName,
          description: newCampaignDescription || undefined,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to create campaign')
      }

      const data = await response.json()
      const campaign = data.campaign as CampaignSummary
      const nextCampaigns = [campaign, ...campaigns]
      setCampaigns(nextCampaigns)
      setSelectedCampaignId(campaign.id)
      setNewCampaignName('')
      setNewCampaignDescription('')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred'
      setError(message)
    } finally {
      setIsCreatingCampaign(false)
    }
  }

  const handleJoinCampaign = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsJoiningCampaign(true)

    try {
      const response = await fetch(`${apiUrl}/api/campaigns/${joinCampaignId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ inviteCode: joinInviteCode }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to join campaign')
      }

      const campaignsResponse = await fetch(`${apiUrl}/api/campaigns`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!campaignsResponse.ok) {
        const errorData = await campaignsResponse.json().catch(() => ({}))
        throw new Error(errorData.message || 'Joined campaign but failed to reload campaigns')
      }

      const campaignsData = await campaignsResponse.json()
      const nextCampaigns = (campaignsData.campaigns || []) as CampaignSummary[]
      setCampaigns(nextCampaigns)
      setSelectedCampaignId(joinCampaignId as UUID)
      setJoinCampaignId('')
      setJoinInviteCode('')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred'
      setError(message)
    } finally {
      setIsJoiningCampaign(false)
    }
  }

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!selectedCampaignId) {
      setError('Select a campaign before creating a session')
      return
    }

    setIsCreating(true)

    try {
      const response = await fetch(`${apiUrl}/api/campaigns/${selectedCampaignId}/sessions/start`, {
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
      store.createSession(session.session)
      // Set as current session
      store.setCurrentSession(session.session.id)
      onSessionCreated?.(session.session.id)

      setSessionName('')
      setSessionDescription('')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred'
      setError(message)
    } finally {
      setIsCreating(false)
    }
  }

  const handleStartSession = async (sessionId: UUID) => {
    await handleTransitionSession(sessionId, SessionState.ACTIVE)
  }

  const handlePauseSession = async (sessionId: UUID) => {
    await handleTransitionSession(sessionId, SessionState.PAUSED)
  }

  const handleResumeSession = async (sessionId: UUID) => {
    await handleTransitionSession(sessionId, SessionState.ACTIVE)
  }

  const handleEndSession = async (sessionId: UUID) => {
    await handleTransitionSession(sessionId, SessionState.ENDED)
  }

  const handleDeleteSession = async (sessionId: UUID) => {
    setError(null)

    try {
      const response = await fetch(`${apiUrl}/api/session/${sessionId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to delete session')
      }

      store.removeSession(sessionId)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred'
      setError(message)
    }
  }

  const handleTransitionSession = async (sessionId: UUID, state: SessionState) => {
    setError(null)

    try {
      const response = await fetch(`${apiUrl}/api/session/${sessionId}/state`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ state }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || `Failed to transition session to ${state}`)
      }

      const updatedSession = await response.json()
      store.updateSession(sessionId, updatedSession)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred'
      setError(message)
    }
  }

  const showChat = currentSession !== null && currentSession.state === SessionState.ACTIVE

  return (
    <div
      style={{
        maxWidth: showChat ? '1100px' : '600px',
        margin: '0 auto',
        padding: '2rem 1rem',
        display: showChat ? 'grid' : 'block',
        gridTemplateColumns: showChat ? '1fr 1fr' : undefined,
        gap: showChat ? '1.5rem' : undefined,
        alignItems: 'start',
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

        <div
          style={{
            marginTop: '0.75rem',
            height: '52px',
            position: 'relative',
          }}
        >
          {activeTransitionNotice && (
            <div
              role="status"
              style={{
                position: 'absolute',
                inset: 0,
                padding: '0.65rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid #7dd3fc',
                backgroundColor: '#e0f2fe',
                color: '#0c4a6e',
                display: 'flex',
                justifyContent: 'space-between',
                gap: '0.75rem',
                alignItems: 'center',
                fontSize: '0.82rem',
                opacity: isTransitionToastVisible ? 1 : 0,
                transform: isTransitionToastVisible ? 'translateY(0px)' : 'translateY(-6px)',
                transition: 'opacity 180ms ease, transform 180ms ease',
              }}
            >
              <span>
                {formatTransitionNotice({
                  nextState: activeTransitionNotice.nextState,
                  movedUsers: activeTransitionNotice.movedUsers,
                  targetRoomName: activeTransitionNotice.targetRoomName,
                  targetState: activeTransitionNotice.targetState,
                })}
              </span>
              <button
                type="button"
                onClick={hideTransitionToast}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#0c4a6e',
                  cursor: 'pointer',
                  fontWeight: 600,
                  padding: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          marginBottom: '2rem',
          padding: '1.5rem',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          backgroundColor: '#fff',
        }}
      >
        <h3 style={{ marginTop: 0 }}>Campaign Context</h3>

        <div style={{ marginBottom: '1rem' }}>
          <label
            htmlFor="campaignSelect"
            style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: '500',
              fontSize: '0.875rem',
            }}
          >
            Active Campaign
          </label>
          <select
            id="campaignSelect"
            value={selectedCampaignId}
            onChange={(e) => setSelectedCampaignId(e.target.value as UUID)}
            disabled={isLoadingCampaigns || campaigns.length === 0}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #cbd5e1',
              borderRadius: '4px',
              fontSize: '0.875rem',
              boxSizing: 'border-box',
            }}
          >
            {campaigns.length === 0 ? (
              <option value="">No campaigns yet</option>
            ) : (
              campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))
            )}
          </select>
        </div>

        <div
          style={{
            display: 'grid',
            gap: '0.75rem',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          }}
        >
          <form onSubmit={handleCreateCampaign}>
            <p style={{ margin: '0 0 0.5rem 0', fontWeight: '500', fontSize: '0.875rem' }}>
              Create Campaign
            </p>
            <input
              type="text"
              value={newCampaignName}
              onChange={(e) => setNewCampaignName(e.target.value)}
              placeholder="Campaign name"
              style={{
                width: '100%',
                marginBottom: '0.5rem',
                padding: '0.5rem',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                fontSize: '0.875rem',
                boxSizing: 'border-box',
              }}
              disabled={isCreatingCampaign}
              required
            />
            <input
              type="text"
              value={newCampaignDescription}
              onChange={(e) => setNewCampaignDescription(e.target.value)}
              placeholder="Description (optional)"
              style={{
                width: '100%',
                marginBottom: '0.5rem',
                padding: '0.5rem',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                fontSize: '0.875rem',
                boxSizing: 'border-box',
              }}
              disabled={isCreatingCampaign}
            />
            <button
              type="submit"
              disabled={isCreatingCampaign || !newCampaignName.trim()}
              style={{
                padding: '0.5rem 0.75rem',
                backgroundColor:
                  isCreatingCampaign || !newCampaignName.trim() ? '#cbd5e1' : '#0284c7',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: isCreatingCampaign || !newCampaignName.trim() ? 'not-allowed' : 'pointer',
                fontSize: '0.8rem',
              }}
            >
              {isCreatingCampaign ? 'Creating...' : 'Create Campaign'}
            </button>
          </form>

          <form onSubmit={handleJoinCampaign}>
            <p style={{ margin: '0 0 0.5rem 0', fontWeight: '500', fontSize: '0.875rem' }}>
              Join Campaign
            </p>
            <input
              type="text"
              value={joinCampaignId}
              onChange={(e) => setJoinCampaignId(e.target.value)}
              placeholder="Campaign ID"
              style={{
                width: '100%',
                marginBottom: '0.5rem',
                padding: '0.5rem',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                fontSize: '0.875rem',
                boxSizing: 'border-box',
              }}
              disabled={isJoiningCampaign}
              required
            />
            <input
              type="text"
              value={joinInviteCode}
              onChange={(e) => setJoinInviteCode(e.target.value)}
              placeholder="Invite code"
              style={{
                width: '100%',
                marginBottom: '0.5rem',
                padding: '0.5rem',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                fontSize: '0.875rem',
                boxSizing: 'border-box',
              }}
              disabled={isJoiningCampaign}
              required
            />
            <button
              type="submit"
              disabled={isJoiningCampaign || !joinCampaignId.trim() || !joinInviteCode.trim()}
              style={{
                padding: '0.5rem 0.75rem',
                backgroundColor:
                  isJoiningCampaign || !joinCampaignId.trim() || !joinInviteCode.trim()
                    ? '#cbd5e1'
                    : '#6366f1',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor:
                  isJoiningCampaign || !joinCampaignId.trim() || !joinInviteCode.trim()
                    ? 'not-allowed'
                    : 'pointer',
                fontSize: '0.8rem',
              }}
            >
              {isJoiningCampaign ? 'Joining...' : 'Join Campaign'}
            </button>
          </form>
        </div>
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
        <p style={{ marginTop: '0.25rem', color: '#64748b', fontSize: '0.875rem' }}>
          Sessions are created inside the selected campaign.
        </p>

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
          disabled={isCreating || !sessionName.trim() || !isConnected || !selectedCampaignId}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor:
              isCreating || !sessionName.trim() || !isConnected || !selectedCampaignId
                ? '#cbd5e1'
                : '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontWeight: '500',
            cursor:
              isCreating || !sessionName.trim() || !isConnected || !selectedCampaignId
                ? 'not-allowed'
                : 'pointer',
            fontSize: '0.875rem',
          }}
        >
          {isCreating ? 'Creating...' : 'Create Session'}
        </button>
      </form>

      {/* Session List */}
      {isLoadingSessions ? (
        <div
          style={{
            padding: '1rem',
            color: '#64748b',
            fontSize: '0.875rem',
          }}
        >
          Loading sessions...
        </div>
      ) : sessionList.length > 0 ? (
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
                {session.state === SessionState.IDLE && user.role === 'DM' && (
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
                {session.state === SessionState.ACTIVE && user.role === 'DM' && (
                  <button
                    onClick={() => handlePauseSession(session.id)}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: '#f59e0b',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                    }}
                  >
                    Pause Session
                  </button>
                )}
                {session.state === SessionState.PAUSED && user.role === 'DM' && (
                  <button
                    onClick={() => handleResumeSession(session.id)}
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
                    Resume Session
                  </button>
                )}
                {session.state !== SessionState.ENDED && user.role === 'DM' && (
                  <button
                    onClick={() => handleEndSession(session.id)}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: '#7c3aed',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                    }}
                  >
                    End Session
                  </button>
                )}
                {user.role === 'DM' && (
                  <button
                    onClick={() => handleDeleteSession(session.id)}
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
                {!currentSession || currentSession.id !== session.id ? (
                  <button
                    onClick={() => store.setCurrentSession(session.id)}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: '#6b7280',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                    }}
                  >
                    Select
                  </button>
                ) : null}
                {user.role !== 'DM' && (
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>DM-only controls</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            padding: '1rem',
            color: '#64748b',
            fontSize: '0.875rem',
          }}
        >
          No sessions available yet.
        </div>
      )}

      {currentSession && (
        <div
          style={{
            padding: '1.5rem',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            backgroundColor: '#fff',
            marginTop: '1rem',
          }}
        >
          <h3 style={{ marginTop: 0 }}>Presence and Rooms</h3>
          <p style={{ marginTop: '0.25rem', fontSize: '0.875rem', color: '#64748b' }}>
            Live updates from room/presence websocket events. Auto-refresh runs when WS reconnects.
          </p>

          <div
            style={{
              display: 'grid',
              gap: '0.75rem',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            }}
          >
            {currentRooms.map((room) => {
              const members: RoomMember[] = typedRoomMembers[room.id] || []
              return (
                <div
                  key={room.id}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    padding: '0.75rem',
                    backgroundColor: '#f8fafc',
                  }}
                >
                  <p style={{ margin: 0, fontWeight: '600' }}>
                    {room.name}{' '}
                    <span style={{ color: '#64748b', fontSize: '0.75rem' }}>({room.type})</span>
                  </p>
                  <p style={{ margin: '0.25rem 0 0.5rem 0', fontSize: '0.8rem', color: '#64748b' }}>
                    Members: {members.length}
                  </p>
                  {members.length === 0 ? (
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>No members</p>
                  ) : (
                    members.map((member) => (
                      <p
                        key={`${room.id}:${member.userId}`}
                        style={{ margin: '0.2rem 0', fontSize: '0.8rem' }}
                      >
                        <span
                          style={{
                            display: 'inline-block',
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            marginRight: '0.4rem',
                            backgroundColor:
                              member.presenceState === PresenceState.ONLINE
                                ? '#22c55e'
                                : member.presenceState === PresenceState.SPEAKING
                                  ? '#0ea5e9'
                                  : member.presenceState === PresenceState.TYPING
                                    ? '#f59e0b'
                                    : member.presenceState === PresenceState.OFFLINE
                                      ? '#ef4444'
                                      : '#94a3b8',
                          }}
                        />
                        {member.username || member.userId} - {member.presenceState}
                      </p>
                    ))
                  )}
                </div>
              )
            })}
          </div>

          <p style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#64748b' }}>
            Total tracked users: {currentPresence.length}
          </p>
        </div>
      )}

      {/* Chat panel — only shown when a session is ACTIVE */}
      {showChat && currentSession && (
        <div style={{ position: 'sticky', top: '1rem' }}>
          <ChatWindow apiUrl={apiUrl} token={token} sessionId={currentSession.id} user={user} />
          <div style={{ marginTop: '1rem' }}>
            <NotesPanel apiUrl={apiUrl} token={token} sessionId={currentSession.id} user={user} />
          </div>
        </div>
      )}
    </div>
  )
}
