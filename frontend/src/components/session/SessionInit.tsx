/**
 * Session Initialization
 * Component for creating a new session and transitioning to active state.
 * Tests the full UI → Event → Store pipeline.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SessionState } from '@shared'
import type { UUID, Role } from '@shared'
import { PresenceState, RoomType } from '@shared'
import { useStore } from '../../hooks/useStore'
import { useWebSocket } from '../../hooks/useWebSocket'
import type { ConnectionState } from '../../ws/client'
import { ChatWindow } from '../chat/ChatWindow'
import { NotesPanel } from '../notes/NotesPanel'
import { CommandCenterFrame, type RightRailTab } from './CommandCenterFrame'
import { CampaignInfo } from './CampaignInfo'
import { SystemToasts } from './SystemToasts'
import { DMAudioControls } from './DMAudioControls'
import { HistoryPanel } from './HistoryPanel'
import { JournalPanel } from './JournalPanel'
import { NotesRailPanel } from './NotesRailPanel'
import { SearchPanel } from './SearchPanel'
import { SessionLeftRailPanel } from './SessionLeftRailPanel'
import { SessionRoomsStatusPanel } from './SessionRoomsStatusPanel'
import { SessionUserSettingsPanel } from './SessionUserSettingsPanel'
import { SessionToolbar } from './SessionToolbar'
import { AudioPanel } from '../audio/AudioPanel'
import { ReconnectBanner } from '../ui/ReconnectBanner'
import { Toast } from '../ui/Toast'
import { createHttpTelemetryTransport, telemetryClient } from '../../utils/telemetry'
import type { Session as SessionRecord } from '@/types/session'
import type {
  Room as RoomRecord,
  RoomUser as RoomMember,
  SessionPresence as PresenceRecord,
} from '@/types/room'
import '../../styles/components/session/SessionInit.css'

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

const CHAT_GROUPING_STORAGE_KEY = 'vtt-chat:chat-grouping-window-ms'
const DEFAULT_CHAT_GROUPING_WINDOW_MS = 5 * 60 * 1000
const ALLOWED_CHAT_GROUPING_WINDOWS = new Set([0, 2 * 60 * 1000, 5 * 60 * 1000, 10 * 60 * 1000])

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
  const [selectedRoomIdOverride, setSelectedRoomIdOverride] = useState<UUID | ''>('')
  const [error, setError] = useState<string | null>(null)
  const [dismissedTransitionEventId, setDismissedTransitionEventId] = useState<string | null>(null)
  const [isHydrating, setIsHydrating] = useState(false)
  const [messageGroupingWindowMs, setMessageGroupingWindowMs] = useState<number>(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_CHAT_GROUPING_WINDOW_MS
    }

    const localStorageApi = window.localStorage as Partial<Storage> | undefined
    if (!localStorageApi || typeof localStorageApi.getItem !== 'function') {
      return DEFAULT_CHAT_GROUPING_WINDOW_MS
    }

    const raw = localStorageApi.getItem(CHAT_GROUPING_STORAGE_KEY)
    const parsed = Number(raw)
    return ALLOWED_CHAT_GROUPING_WINDOWS.has(parsed) ? parsed : DEFAULT_CHAT_GROUPING_WINDOW_MS
  })
  const prevWsStateRef = useRef<ConnectionState>('disconnected')
  const wsTelemetryPrevRef = useRef<ConnectionState | null>(null)

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
  const sessions = useStore((state) => state.sessions)
  const currentSessionId = useStore((state) => state.currentSessionId)
  const rooms = useStore((state) => state.rooms)
  const sessionPresence = useStore((state) => state.sessionPresence)
  const roomMembers = useStore((state) => state.roomMembers)
  const notes = useStore((state) => state.notes)
  const sessionTransitionNotice = useStore((state) => state.sessionTransitionNotice)
  const dmOverrides = useStore((state) => state.dmOverrides)
  const currentConditionName = useStore((state) => state.currentCondition?.name)
  const clearSessions = useStore((state) => state.clearSessions)
  const replaceSessions = useStore((state) => state.replaceSessions)
  const replaceSessionTopology = useStore((state) => state.replaceSessionTopology)
  const createSession = useStore((state) => state.createSession)
  const setCurrentSession = useStore((state) => state.setCurrentSession)
  const setToolbarCenterPaneView = useStore((state) => state.setToolbarCenterPaneView)
  const removeSession = useStore((state) => state.removeSession)
  const updateSession = useStore((state) => state.updateSession)
  const typedSessions = sessions as Record<UUID, SessionRecord>
  const sessionList: SessionRecord[] = Object.values(typedSessions)
  const currentSession = currentSessionId ? sessions[currentSessionId] : null
  const typedRoomsBySession = rooms as Record<UUID, Record<UUID, RoomRecord>>
  const typedPresenceBySession = sessionPresence as Record<UUID, Record<UUID, PresenceRecord>>
  const typedRoomMembers = roomMembers as Record<UUID, RoomMember[]>
  const currentRooms = useMemo<RoomRecord[]>(
    () => (currentSession ? Object.values(typedRoomsBySession[currentSession.id] || {}) : []),
    [currentSession, typedRoomsBySession]
  )
  const currentPresence = useMemo<PresenceRecord[]>(
    () => (currentSession ? Object.values(typedPresenceBySession[currentSession.id] || {}) : []),
    [currentSession, typedPresenceBySession]
  )
  const currentTransitionNotice = currentSession
    ? sessionTransitionNotice[currentSession.id]
    : undefined
  const currentSessionNoteCount = currentSession
    ? Object.keys(notes[currentSession.id] ?? {}).length
    : 0
  const selectedRoomId = useMemo<UUID | ''>(() => {
    if (!currentRooms.length) {
      return ''
    }

    if (selectedRoomIdOverride && currentRooms.some((room) => room.id === selectedRoomIdOverride)) {
      return selectedRoomIdOverride
    }

    return currentRooms[0].id
  }, [currentRooms, selectedRoomIdOverride])

  const activeTransitionNotice =
    currentTransitionNotice && currentTransitionNotice.eventId !== dismissedTransitionEventId
      ? currentTransitionNotice
      : undefined
  const rightRailIndicators = useMemo<Partial<Record<RightRailTab, number>>>(
    () => ({
      notes: currentSessionNoteCount,
      journal: currentSessionNoteCount,
      history: activeTransitionNotice ? 1 : 0,
    }),
    [activeTransitionNotice, currentSessionNoteCount]
  )

  const hideTransitionToast = useCallback(() => {
    if (!activeTransitionNotice) {
      return
    }

    setDismissedTransitionEventId(activeTransitionNotice.eventId)
  }, [activeTransitionNotice])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const localStorageApi = window.localStorage as Partial<Storage> | undefined
    if (!localStorageApi || typeof localStorageApi.setItem !== 'function') {
      return
    }

    localStorageApi.setItem(CHAT_GROUPING_STORAGE_KEY, String(messageGroupingWindowMs))
  }, [messageGroupingWindowMs])

  useEffect(() => {
    if (!activeTransitionNotice) {
      return
    }

    const timeoutId = setTimeout(() => {
      hideTransitionToast()
    }, 6000)

    return () => {
      clearTimeout(timeoutId)
    }
  }, [activeTransitionNotice, hideTransitionToast])

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
          clearSessions()
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An error occurred'
        setError(message)
      } finally {
        setIsLoadingCampaigns(false)
      }
    }

    void loadCampaigns()
  }, [apiUrl, token, clearSessions])

  useEffect(() => {
    const loadCampaignSessions = async () => {
      if (!selectedCampaignId) {
        clearSessions()
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
        replaceSessions(data.sessions || [])
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An error occurred'
        setError(message)
      } finally {
        setIsLoadingSessions(false)
      }
    }

    void loadCampaignSessions()
  }, [apiUrl, selectedCampaignId, token, clearSessions, replaceSessions])

  useEffect(() => {
    telemetryClient.setTransport(
      createHttpTelemetryTransport({
        apiUrl,
        token,
      })
    )
    telemetryClient.start()

    return () => {
      telemetryClient.stop()
    }
  }, [apiUrl, token])

  useEffect(() => {
    const previous = wsTelemetryPrevRef.current
    if (previous && previous !== wsState) {
      telemetryClient.track('WS_CONNECTION_STATE_CHANGED', {
        from: previous,
        to: wsState,
        sessionId: currentSession?.id,
      })

      if ((previous === 'reconnecting' || previous === 'disconnected') && wsState === 'connected') {
        telemetryClient.track('LIVEKIT_RECONNECT', {
          reason: previous,
          sessionId: currentSession?.id,
        })
      }
    }

    wsTelemetryPrevRef.current = wsState
  }, [wsState, currentSession?.id])

  useEffect(() => {
    const prev = prevWsStateRef.current
    prevWsStateRef.current = wsState

    // Only hydrate on reconnect (transition from a non-connected state → connected)
    // or on first connection when a session is already active in the store.
    const isReconnect = wsState === 'connected' && prev !== 'connected'
    if (!currentSession || !isReconnect) {
      return
    }

    const loadPresenceAndRooms = async () => {
      setIsHydrating(true)
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

        const nextRooms = (roomsPayload.rooms || []).map((room) => ({
          id: room.id,
          sessionId: room.sessionId,
          name: room.name,
          type: room.type,
          createdAt: room.createdAt,
          createdBy: room.createdBy,
        }))

        const nextPresence = (presencePayload.presence || []).map((entry) => ({
          userId: entry.userId,
          username: entry.username,
          state: entry.state,
          primaryRoomId: entry.primaryRoomId,
          privateRoomId: entry.privateRoomId,
          lastSeenAt: entry.lastSeenAt,
        }))

        // Atomic: both rooms and presence replace in a single store update.
        replaceSessionTopology(currentSession.id, nextRooms, nextPresence)
      } catch {
        // Event-driven WebSocket updates continue to flow even if hydration fails.
      } finally {
        setIsHydrating(false)
      }
    }

    void loadPresenceAndRooms()
  }, [apiUrl, currentSession, token, wsState, replaceSessionTopology])

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
      createSession(session.session)
      // Set as current session
      setCurrentSession(session.session.id)
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
    telemetryClient.onSessionEnd()
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

      removeSession(sessionId)
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
      updateSession(sessionId, updatedSession)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred'
      setError(message)
    }
  }

  const showChat = currentSession !== null && currentSession.state === SessionState.ACTIVE

  return (
    <>
      {/* Reconnect / hydration banner — sits above the main surface */}
      <ReconnectBanner wsState={wsState} isHydrating={isHydrating} />

      <div className={`session-init-shell ${showChat ? 'session-init-shell-wide' : ''}`}>
        {/* User Info & WS Status */}
        <div className="session-status-card">
          <p className="session-status-copy">
            <strong>User:</strong> {user.username} ({user.role})
          </p>
          <p className="session-status-copy">
            <strong>WebSocket:</strong>{' '}
            <span className={`session-ws-state session-ws-state-${wsState}`}>{wsState}</span>
          </p>
          {wsError && (
            <p className="session-ws-error">
              <strong>WS Error:</strong> {wsError.message}
            </p>
          )}
        </div>

        <div className="session-card">
          <h3 className="session-card-title">Campaign Context</h3>

          <div className="session-field">
            <label htmlFor="campaignSelect" className="session-label">
              Active Campaign
            </label>
            <select
              id="campaignSelect"
              value={selectedCampaignId}
              onChange={(e) => setSelectedCampaignId(e.target.value as UUID)}
              disabled={isLoadingCampaigns || campaigns.length === 0}
              className="session-select"
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

          <div className="session-split-grid">
            <form onSubmit={handleCreateCampaign}>
              <p className="session-inline-form-title">Create Campaign</p>
              <input
                type="text"
                value={newCampaignName}
                onChange={(e) => setNewCampaignName(e.target.value)}
                placeholder="Campaign name"
                className="session-input"
                disabled={isCreatingCampaign}
                required
              />
              <input
                type="text"
                value={newCampaignDescription}
                onChange={(e) => setNewCampaignDescription(e.target.value)}
                placeholder="Description (optional)"
                className="session-input"
                disabled={isCreatingCampaign}
              />
              <button
                type="submit"
                disabled={isCreatingCampaign || !newCampaignName.trim()}
                className="session-button session-button-brand"
              >
                {isCreatingCampaign ? 'Creating...' : 'Create Campaign'}
              </button>
            </form>

            <form onSubmit={handleJoinCampaign}>
              <p className="session-inline-form-title">Join Campaign</p>
              <input
                type="text"
                value={joinCampaignId}
                onChange={(e) => setJoinCampaignId(e.target.value)}
                placeholder="Campaign ID"
                className="session-input"
                disabled={isJoiningCampaign}
                required
              />
              <input
                type="text"
                value={joinInviteCode}
                onChange={(e) => setJoinInviteCode(e.target.value)}
                placeholder="Invite code"
                className="session-input"
                disabled={isJoiningCampaign}
                required
              />
              <button
                type="submit"
                disabled={isJoiningCampaign || !joinCampaignId.trim() || !joinInviteCode.trim()}
                className="session-button session-button-indigo"
              >
                {isJoiningCampaign ? 'Joining...' : 'Join Campaign'}
              </button>
            </form>
          </div>
        </div>

        {/* Create Session Form */}
        <form onSubmit={handleCreateSession} className="session-card">
          <h3 className="session-card-title">Create New Session</h3>
          <p className="session-card-subtitle">
            Sessions are created inside the selected campaign.
          </p>

          {error && (
            <div className="session-error-banner">
              <Toast variant="error" message={error} onDismiss={() => setError(null)} />
            </div>
          )}

          <div className="session-field">
            <label htmlFor="sessionName" className="session-label">
              Session Name *
            </label>
            <input
              id="sessionName"
              type="text"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="e.g., Dragon's Lair Campaign"
              className="session-input"
              disabled={isCreating}
              required
            />
          </div>

          <div className="session-field">
            <label htmlFor="sessionDescription" className="session-label">
              Description (optional)
            </label>
            <textarea
              id="sessionDescription"
              value={sessionDescription}
              onChange={(e) => setSessionDescription(e.target.value)}
              placeholder="Add session details..."
              className="session-textarea"
              disabled={isCreating}
            />
          </div>

          <button
            type="submit"
            disabled={isCreating || !sessionName.trim() || !isConnected || !selectedCampaignId}
            className="session-button session-button-success"
          >
            {isCreating ? 'Creating...' : 'Create Session'}
          </button>
        </form>

        {/* Session List */}
        {isLoadingSessions ? (
          <div className="session-status-message">Loading sessions...</div>
        ) : sessionList.length > 0 ? (
          <div className="session-card">
            <h3 className="session-card-title">Sessions ({sessionList.length})</h3>

            {sessionList.map((session) => (
              <div
                key={session.id}
                className={`session-list-item ${currentSession?.id === session.id ? 'current' : ''}`}
              >
                <p className="session-list-title">
                  {session.name} {currentSession?.id === session.id && '(current)'}
                </p>
                <p className="session-list-meta">
                  Status: <strong>{session.state}</strong>
                </p>
                {session.description && (
                  <p className="session-list-description">{session.description}</p>
                )}
                <div className="session-action-row">
                  {session.state === SessionState.IDLE && user.role === 'DM' && (
                    <button
                      onClick={() => handleStartSession(session.id)}
                      className="session-button session-button-primary"
                    >
                      Start Session
                    </button>
                  )}
                  {session.state === SessionState.ACTIVE && user.role === 'DM' && (
                    <button
                      onClick={() => handlePauseSession(session.id)}
                      className="session-button session-button-warn"
                    >
                      Pause Session
                    </button>
                  )}
                  {session.state === SessionState.PAUSED && user.role === 'DM' && (
                    <button
                      onClick={() => handleResumeSession(session.id)}
                      className="session-button session-button-primary"
                    >
                      Resume Session
                    </button>
                  )}
                  {session.state !== SessionState.ENDED && user.role === 'DM' && (
                    <button
                      onClick={() => handleEndSession(session.id)}
                      className="session-button session-button-violet"
                    >
                      End Session
                    </button>
                  )}
                  {user.role === 'DM' && (
                    <button
                      onClick={() => handleDeleteSession(session.id)}
                      className="session-button session-button-danger"
                    >
                      Delete
                    </button>
                  )}
                  {!currentSession || currentSession.id !== session.id ? (
                    <button
                      onClick={() => setCurrentSession(session.id)}
                      className="session-button session-button-neutral"
                    >
                      Select
                    </button>
                  ) : null}
                  {user.role !== 'DM' && <span className="session-dm-copy">DM-only controls</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="session-status-message">No sessions available yet.</div>
        )}

        {/* Chat panel — only shown when a session is ACTIVE */}
        {showChat && currentSession && (
          <div className="session-command-center">
            <h3 className="session-command-center-title">Command Center</h3>
            <p className="session-command-center-subtitle">
              Voice rooms on the left, live conversation in the center, and tools on the right.
            </p>

            <CommandCenterFrame
              role={user.role}
              rightRailIndicators={rightRailIndicators}
              renderToolbar={(actions) => <SessionToolbar actions={actions} />}
              renderCampaignInfo={() => {
                const selectedCampaign = campaigns.find(
                  (campaign) => campaign.id === selectedCampaignId
                )
                return (
                  <CampaignInfo
                    campaignName={selectedCampaign?.name || 'Not selected'}
                    sessionName={currentSession.name}
                    sessionState={currentSession.state}
                  />
                )
              }}
              renderSystemToasts={() => (
                <SystemToasts
                  message={
                    activeTransitionNotice
                      ? formatTransitionNotice({
                          nextState: activeTransitionNotice.nextState,
                          movedUsers: activeTransitionNotice.movedUsers,
                          targetRoomName: activeTransitionNotice.targetRoomName,
                          targetState: activeTransitionNotice.targetState,
                        })
                      : undefined
                  }
                  onDismiss={activeTransitionNotice ? hideTransitionToast : undefined}
                />
              )}
              renderLeftRail={() => (
                <SessionLeftRailPanel
                  role={user.role}
                  username={user.username}
                  sessionName={currentSession.name}
                  sessionState={currentSession.state}
                  sessionCount={sessionList.length}
                  roomCount={currentRooms.length}
                  presenceCount={currentPresence.length}
                  dmUserId={currentSession.dmId}
                  currentUserId={user.id}
                  rooms={currentRooms.map((room) => ({
                    id: room.id,
                    name: room.name,
                    type: room.type,
                  }))}
                  roomMembersByRoomId={typedRoomMembers}
                  selectedRoomId={selectedRoomId}
                  onSelectRoom={setSelectedRoomIdOverride}
                  dmOverrides={dmOverrides}
                  currentConditionName={currentConditionName}
                />
              )}
              renderCenterPane={(view) => (
                <div className="session-command-center-pane">
                  {view === 'chat' ? (
                    <div className="session-live-comms">
                      {selectedRoomId ? (
                        <aside className="session-live-comms__voice" aria-label="Voice panel">
                          <AudioPanel sessionId={currentSession.id} roomId={selectedRoomId} />
                        </aside>
                      ) : null}

                      <section className="session-live-comms__chat" aria-label="Chat panel">
                        <ChatWindow
                          apiUrl={apiUrl}
                          token={token}
                          sessionId={currentSession.id}
                          user={user}
                          messageGroupingWindowMs={messageGroupingWindowMs}
                        />
                      </section>
                    </div>
                  ) : (
                    <NotesPanel
                      apiUrl={apiUrl}
                      token={token}
                      sessionId={currentSession.id}
                      user={user}
                    />
                  )}
                </div>
              )}
              renderRightRailTab={(tab) => {
                if (tab === 'rooms') {
                  return (
                    <SessionRoomsStatusPanel
                      rooms={currentRooms.map((room) => ({
                        id: room.id,
                        name: room.name,
                        type: room.type,
                      }))}
                      roomMembersByRoomId={typedRoomMembers}
                      presenceCount={currentPresence.length}
                    />
                  )
                }

                if (tab === 'audio') {
                  return (
                    <DMAudioControls
                      apiUrl={apiUrl}
                      token={token}
                      role={user.role}
                      sessionId={currentSession.id}
                      dmUserId={currentSession.dmId}
                      rooms={currentRooms.map((room) => ({
                        id: room.id,
                        name: room.name,
                        type: room.type,
                      }))}
                      participants={currentPresence.map((presence) => ({
                        userId: presence.userId,
                        username: presence.username,
                        state: presence.state,
                        primaryRoomId: presence.primaryRoomId,
                      }))}
                    />
                  )
                }

                if (tab === 'search') {
                  return (
                    <SearchPanel
                      apiUrl={apiUrl}
                      token={token}
                      sessionId={currentSession.id}
                      role={user.role}
                      rooms={currentRooms.map((room) => ({
                        id: room.id,
                        name: room.name,
                        type: room.type,
                      }))}
                      participants={currentPresence}
                      onSelectRoom={setSelectedRoomIdOverride}
                      onOpenNotesWorkspace={() => setToolbarCenterPaneView('notes')}
                      onOpenChatWorkspace={() => setToolbarCenterPaneView('chat')}
                    />
                  )
                }

                if (tab === 'notes') {
                  return (
                    <NotesRailPanel
                      apiUrl={apiUrl}
                      token={token}
                      sessionId={currentSession.id}
                      role={user.role}
                      onOpenNotesWorkspace={() => setToolbarCenterPaneView('notes')}
                    />
                  )
                }

                if (tab === 'journal') {
                  return (
                    <JournalPanel
                      apiUrl={apiUrl}
                      token={token}
                      sessionId={currentSession.id}
                      role={user.role}
                    />
                  )
                }

                if (tab === 'history') {
                  return (
                    <HistoryPanel
                      apiUrl={apiUrl}
                      token={token}
                      sessionId={currentSession.id}
                      role={user.role}
                    />
                  )
                }

                if (tab === 'settings') {
                  return (
                    <SessionUserSettingsPanel
                      messageGroupingWindowMs={messageGroupingWindowMs}
                      onMessageGroupingWindowChange={setMessageGroupingWindowMs}
                    />
                  )
                }

                return (
                  <p className="session-placeholder-copy">
                    Tool panel is not available for this tab.
                  </p>
                )
              }}
            />
          </div>
        )}
      </div>
    </>
  )
}
