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
  dmUsername?: string
  dmDisplayName?: string
  dmAvatarUrl?: string | null
  dmOnline?: boolean
  connectedPlayersRounded?: number
  connectedPlayersLabel?: string
  connectedSpectatorsRounded?: number
  connectedSpectatorsLabel?: string
  displayState?: 'INACTIVE' | 'GREENROOM' | 'ACTIVE' | 'PAUSED'
  latestSessionState?: SessionState | 'ENDED' | null
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
  playerName?: string
  avatarUrl?: string | null
  characterName?: string | null
  characterClass?: string | null
  characterSubclass?: string | null
  characterRace?: string | null
  level?: number | null
  characterStats?: Record<string, unknown> | null
  primaryRoomId?: UUID
  privateRoomId?: UUID
  state: PresenceState
  lastSeenAt: number
}

interface ApiVoiceOfGod {
  enabled: boolean
  dmId?: UUID
  broadcastRoomId?: string
  changedAt?: number
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

function getCampaignDisplayState(
  campaign: CampaignSummary
): 'INACTIVE' | 'GREENROOM' | 'ACTIVE' | 'PAUSED' {
  if (campaign.displayState) {
    return campaign.displayState
  }

  const latest = campaign.latestSessionState
  if (latest === SessionState.ACTIVE) return 'ACTIVE'
  if (latest === SessionState.PAUSED) return 'PAUSED'
  if (latest === SessionState.IDLE || latest === 'ENDED') return 'GREENROOM'
  return 'INACTIVE'
}

function getPreferredSession(sessions: SessionRecord[]): SessionRecord | null {
  if (sessions.length === 0) return null

  const active = sessions.find((session) => session.state === SessionState.ACTIVE)
  if (active) return active

  const paused = sessions.find((session) => session.state === SessionState.PAUSED)
  if (paused) return paused

  const idle = sessions.find((session) => session.state === SessionState.IDLE)
  if (idle) return idle

  return sessions[0]
}

function buildDefaultChapterName(existingSessions: SessionRecord[]): string {
  const nextSessionNumber = existingSessions.length + 1
  const dateLabel = new Date().toLocaleDateString('en-CA')
  return `Session ${nextSessionNumber} - ${dateLabel}`
}

function getPrivacyCounterLabel(label: string | undefined, rounded: number | undefined): string {
  if (label && label.trim()) return label
  if (!rounded || rounded <= 0) return '0'
  return `~${rounded}`
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
  const [showCreateCampaignModal, setShowCreateCampaignModal] = useState(false)
  const [showJoinCampaignModal, setShowJoinCampaignModal] = useState(false)
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
  const { state: wsState, error: wsError } = useWebSocket({
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
  const voiceOfGodEnabled = useStore((state) => state.voiceOfGodEnabled)
  const setVoiceOfGodState = useStore((state) => state.setVoiceOfGodState)
  const currentConditionName = useStore((state) => state.currentCondition?.name)
  const clearSessions = useStore((state) => state.clearSessions)
  const replaceSessions = useStore((state) => state.replaceSessions)
  const replaceSessionTopology = useStore((state) => state.replaceSessionTopology)
  const setCurrentSession = useStore((state) => state.setCurrentSession)
  const setToolbarCenterPaneView = useStore((state) => state.setToolbarCenterPaneView)
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

    const mainRoom = currentRooms.find((room) => room.type === RoomType.MAIN)
    return (mainRoom || currentRooms[0]).id
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

  const handleToggleVoiceOfGod = useCallback(
    async (enabled: boolean) => {
      if (!currentSession || user.role !== 'DM') {
        return
      }

      const response = await fetch(`${apiUrl}/api/audio/voice-of-god`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId: currentSession.id,
          enabled,
        }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { message?: string }
        throw new Error(payload.message || 'Failed to update Voice of God state')
      }

      const payload = (await response.json().catch(() => ({}))) as {
        voiceOfGod?: ApiVoiceOfGod
      }

      if (payload.voiceOfGod) {
        setVoiceOfGodState({
          enabled: Boolean(payload.voiceOfGod.enabled),
          broadcastRoomId: payload.voiceOfGod.broadcastRoomId,
          dmId: payload.voiceOfGod.dmId,
          changedAt: payload.voiceOfGod.changedAt,
        })
      } else {
        setVoiceOfGodState({ enabled })
      }
    },
    [apiUrl, currentSession, setVoiceOfGodState, token, user.role]
  )

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
        return
      }

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
        const [roomsResponse, presenceResponse, audioStateResponse] = await Promise.all([
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
          fetch(`${apiUrl}/api/audio/state/${currentSession.id}`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }),
        ])

        if (!roomsResponse.ok || !presenceResponse.ok || !audioStateResponse.ok) {
          return
        }

        const roomsPayload = (await roomsResponse.json()) as { rooms?: ApiRoom[] }
        const presencePayload = (await presenceResponse.json()) as { presence?: ApiPresence[] }
        const audioStatePayload = (await audioStateResponse.json()) as {
          voiceOfGod?: ApiVoiceOfGod
        }

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
          playerName: entry.playerName,
          avatarUrl: entry.avatarUrl,
          characterName: entry.characterName,
          characterClass: entry.characterClass,
          characterSubclass: entry.characterSubclass,
          characterRace: entry.characterRace,
          level: entry.level,
          characterStats: entry.characterStats,
          state: entry.state,
          primaryRoomId: entry.primaryRoomId,
          privateRoomId: entry.privateRoomId,
          lastSeenAt: entry.lastSeenAt,
        }))

        // Atomic: both rooms and presence replace in a single store update.
        replaceSessionTopology(currentSession.id, nextRooms, nextPresence)

        if (audioStatePayload.voiceOfGod) {
          setVoiceOfGodState({
            enabled: Boolean(audioStatePayload.voiceOfGod.enabled),
            broadcastRoomId: audioStatePayload.voiceOfGod.broadcastRoomId,
            dmId: audioStatePayload.voiceOfGod.dmId,
            changedAt: audioStatePayload.voiceOfGod.changedAt,
          })
        }
      } catch {
        // Event-driven WebSocket updates continue to flow even if hydration fails.
      } finally {
        setIsHydrating(false)
      }
    }

    void loadPresenceAndRooms()
  }, [apiUrl, currentSession, token, wsState, replaceSessionTopology, setVoiceOfGodState])

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
      setShowCreateCampaignModal(false)
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
      setShowJoinCampaignModal(false)
      setJoinCampaignId('')
      setJoinInviteCode('')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred'
      setError(message)
    } finally {
      setIsJoiningCampaign(false)
    }
  }

  const handleEnterCampaign = async (campaignId?: UUID) => {
    setError(null)

    const targetCampaignId = campaignId || selectedCampaignId

    if (!targetCampaignId) {
      setError('Select a campaign before entering')
      return
    }

    if (targetCampaignId !== selectedCampaignId) {
      setSelectedCampaignId(targetCampaignId)
    }

    const preferredSession = getPreferredSession(sessionList)
    if (preferredSession) {
      setCurrentSession(preferredSession.id)
      return
    }

    if (user.role !== 'DM') {
      setError('No campaign chapter is available yet. Wait for the DM to start the session.')
      return
    }

    try {
      const response = await fetch(`${apiUrl}/api/campaigns/${targetCampaignId}/sessions/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: buildDefaultChapterName(sessionList),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to start campaign chapter')
      }

      const payload = (await response.json()) as { session: SessionRecord }
      replaceSessions([payload.session, ...sessionList])
      setCurrentSession(payload.session.id)
      onSessionCreated?.(payload.session.id)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred'
      setError(message)
    }
  }

  const handleOpenCampaignSettingsRoute = (campaignId: UUID) => {
    window.location.href = `/campaigns/${campaignId}/settings`
  }

  const handleStartSession = async (sessionId: UUID) => {
    await handleTransitionSession(sessionId, SessionState.ACTIVE)
  }

  const handleStopSession = async (sessionId: UUID) => {
    await handleTransitionSession(sessionId, SessionState.PAUSED)
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

  const handleExitToCampaignSelector = () => {
    const confirmed = window.confirm(
      'Leave this session and return to the campaign selector? Unsaved local UI state may be lost.'
    )
    if (!confirmed) {
      return
    }

    setCurrentSession(null)
    setSelectedRoomIdOverride('')
  }

  const hasSessionSelected = currentSession !== null
  const isSessionActive = currentSession?.state === SessionState.ACTIVE
  const canStartFromGreenroom =
    user.role === 'DM' &&
    (currentSession?.state === SessionState.IDLE || currentSession?.state === SessionState.PAUSED)
  const canStopFromActive = user.role === 'DM' && isSessionActive
  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId)

  return (
    <>
      {/* Reconnect / hydration banner — sits above the main surface */}
      <ReconnectBanner wsState={wsState} isHydrating={isHydrating} />

      <div
        className={`session-init-shell ${hasSessionSelected ? 'session-init-shell-session' : 'session-init-shell-home'}`}
      >
        {wsError && (
          <div className="session-status-card">
            <p className="session-ws-error">
              <strong>WS Error:</strong> {wsError.message}
            </p>
          </div>
        )}

        {!hasSessionSelected && (
          <>
            <div
              className="session-toolbar session-toolbar--lobby"
              data-testid="session-lobby-toolbar"
            >
              <div className="session-toolbar__zone session-toolbar__zone--left">
                <div className="session-toolbar__brand" aria-label="Lobby toolbar">
                  <span className="session-toolbar__brand-mark" aria-hidden="true">
                    <img
                      src="/branding/app-logo.png"
                      alt=""
                      className="session-toolbar__brand-logo"
                    />
                  </span>
                  <strong className="session-toolbar__brand-title">VTT Chat</strong>
                </div>
                <span className="session-toolbar__campaign-pill">
                  <span className="material-symbols-outlined" aria-hidden="true">
                    home
                  </span>
                  <span>Campaign Lobby</span>
                </span>
              </div>

              <div className="session-toolbar__zone session-toolbar__zone--center">
                <span className="session-toolbar__status-pill">
                  <span className="material-symbols-outlined" aria-hidden="true">
                    shield_person
                  </span>
                  <span>User</span>
                </span>
              </div>

              <div className="session-toolbar__zone session-toolbar__zone--right">
                <button
                  type="button"
                  className="session-toolbar__action"
                  onClick={() => setShowJoinCampaignModal(true)}
                  disabled={isJoiningCampaign}
                  title="Join campaign"
                  aria-label="Join campaign"
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    group_add
                  </span>
                  <span>Join Campaign</span>
                </button>
                <span
                  className={`session-toolbar__connection session-toolbar__connection--${wsState}`}
                  aria-label={`Connection ${wsState}`}
                  role="status"
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    fiber_manual_record
                  </span>
                </span>
              </div>
            </div>

            <div className="session-card">
              <div className="session-card-header">
                <div>
                  <h3 className="session-card-title">Campaigns</h3>
                  <p className="session-card-subtitle">
                    Choose a campaign to enter. Session chapter details are handled automatically.
                  </p>
                </div>
                <button
                  type="button"
                  className="session-button session-button-brand session-card-create-button"
                  onClick={() => setShowCreateCampaignModal(true)}
                  disabled={isCreatingCampaign}
                  title="Create campaign"
                  aria-label="Create campaign"
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    add_circle
                  </span>
                  <span>Create Campaign</span>
                </button>
              </div>

              {error && (
                <div className="session-error-banner">
                  <Toast variant="error" message={error} onDismiss={() => setError(null)} />
                </div>
              )}

              {isLoadingCampaigns ? (
                <div className="session-status-message">Loading campaigns...</div>
              ) : campaigns.length === 0 ? (
                <div className="session-status-message">No campaigns available yet.</div>
              ) : (
                <div className="session-campaign-grid" role="list" aria-label="Campaign list">
                  {campaigns.map((campaign) => {
                    const isSelected = selectedCampaignId === campaign.id
                    const state = getCampaignDisplayState(campaign)
                    const dmStatus = campaign.dmOnline ? 'Online' : 'Offline'
                    const playersLabel = getPrivacyCounterLabel(
                      campaign.connectedPlayersLabel,
                      campaign.connectedPlayersRounded
                    )
                    const spectatorsLabel = getPrivacyCounterLabel(
                      campaign.connectedSpectatorsLabel,
                      campaign.connectedSpectatorsRounded
                    )
                    const isCampaignDm = campaign.currentDmId === user.id
                    const dmDisplayName = campaign.dmDisplayName || campaign.dmUsername || 'DM'
                    const dmInitial = dmDisplayName.charAt(0).toUpperCase()
                    return (
                      <div
                        key={campaign.id}
                        role="listitem"
                        tabIndex={0}
                        onClick={() => setSelectedCampaignId(campaign.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setSelectedCampaignId(campaign.id)
                          }
                        }}
                        className={`session-campaign-card ${isSelected ? 'is-selected' : ''}`}
                      >
                        <span className="session-campaign-card__header">
                          <span className="session-campaign-card__title">
                            <span
                              className={`session-campaign-card__state-dot state-${state.toLowerCase()}`}
                              aria-label={`Campaign ${state.toLowerCase()}`}
                            />
                            <span>{campaign.name}</span>
                          </span>
                          <span
                            className="session-campaign-card__stats"
                            aria-label="Campaign activity stats"
                          >
                            <span className="session-campaign-card__stat" title="Connected players">
                              <span className="material-symbols-outlined" aria-hidden="true">
                                groups
                              </span>
                              <span>{playersLabel}</span>
                            </span>
                            <span
                              className="session-campaign-card__stat"
                              title="Connected spectators"
                            >
                              <span className="material-symbols-outlined" aria-hidden="true">
                                visibility
                              </span>
                              <span>{spectatorsLabel}</span>
                            </span>
                          </span>
                        </span>
                        <span
                          className={`session-campaign-card__dm session-campaign-card__dm--${campaign.dmOnline ? 'online' : 'offline'}`}
                        >
                          {campaign.dmAvatarUrl ? (
                            <img
                              src={campaign.dmAvatarUrl}
                              alt={`${dmDisplayName} avatar`}
                              className="session-campaign-card__dm-avatar"
                            />
                          ) : (
                            <span className="session-campaign-card__dm-avatar session-campaign-card__dm-avatar--fallback">
                              {dmInitial}
                            </span>
                          )}
                          <span className="session-campaign-card__dm-name">{dmDisplayName}</span>
                          <span className="session-campaign-card__dm-status">{dmStatus}</span>
                        </span>
                        {campaign.description ? (
                          <span className="session-campaign-card__description">
                            {campaign.description}
                          </span>
                        ) : (
                          <span className="session-campaign-card__description">
                            No description provided.
                          </span>
                        )}
                        <span className="session-campaign-card__actions">
                          {isCampaignDm && (
                            <button
                              type="button"
                              className="session-card-action-button"
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                handleOpenCampaignSettingsRoute(campaign.id)
                              }}
                              title="Campaign settings"
                              aria-label="Campaign settings"
                            >
                              <span className="material-symbols-outlined" aria-hidden="true">
                                tune
                              </span>
                              <span>Settings</span>
                            </button>
                          )}
                          <button
                            type="button"
                            className="session-card-action-button session-card-action-button-launch"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              void handleEnterCampaign(campaign.id)
                            }}
                            title="Launch campaign"
                            aria-label="Launch campaign"
                          >
                            <span>Launch</span>
                            <span className="material-symbols-outlined" aria-hidden="true">
                              rocket_launch
                            </span>
                          </button>
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* Command center shown whenever a session is selected */}
        {hasSessionSelected && currentSession && (
          <div className="session-command-center">
            <CommandCenterFrame
              role={user.role}
              rightRailIndicators={rightRailIndicators}
              renderToolbar={(actions) => (
                <SessionToolbar
                  actions={actions}
                  campaignName={selectedCampaign?.name || 'No campaign selected'}
                  role={user.role}
                  wsState={wsState}
                  sessionState={currentSession.state}
                  canStartSession={canStartFromGreenroom}
                  canStopSession={canStopFromActive}
                  onStartSession={() => handleStartSession(currentSession.id)}
                  onStopSession={() => handleStopSession(currentSession.id)}
                  onExitToSelector={handleExitToCampaignSelector}
                />
              )}
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
                <>
                  <SessionLeftRailPanel
                    apiUrl={apiUrl}
                    token={token}
                    sessionId={currentSession.id}
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
                    voiceOfGodEnabled={voiceOfGodEnabled}
                    onToggleVoiceOfGod={handleToggleVoiceOfGod}
                    dmOverrides={dmOverrides}
                    currentConditionName={currentConditionName}
                  />
                  {selectedRoomId ? (
                    <aside className="session-left-rail-audio" aria-label="Voice panel">
                      <AudioPanel sessionId={currentSession.id} roomId={selectedRoomId} />
                    </aside>
                  ) : null}
                </>
              )}
              renderCenterPane={(view) => (
                <div className="session-command-center-pane">
                  {view === 'chat' ? (
                    <div className="session-live-comms">
                      <section className="session-live-comms__chat" aria-label="Chat panel">
                        {selectedRoomId ? (
                          <ChatWindow
                            apiUrl={apiUrl}
                            token={token}
                            sessionId={currentSession.id}
                            roomId={selectedRoomId}
                            user={user}
                            messageGroupingWindowMs={messageGroupingWindowMs}
                          />
                        ) : (
                          <div className="session-greenroom-placeholder">
                            <h4>Greenroom Chat Standby</h4>
                            <p>
                              Start the session to open live chat and stream right-side tools over
                              this workspace.
                            </p>
                          </div>
                        )}
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
                      key={`journal:${currentSession.id}:${user.id}`}
                      apiUrl={apiUrl}
                      token={token}
                      sessionId={currentSession.id}
                      role={user.role}
                      userId={user.id}
                    />
                  )
                }

                if (tab === 'history') {
                  return (
                    <HistoryPanel
                      key={`history:${currentSession.id}:${user.id}`}
                      apiUrl={apiUrl}
                      token={token}
                      sessionId={currentSession.id}
                      role={user.role}
                      userId={user.id}
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

      {showCreateCampaignModal && (
        <div className="session-modal-backdrop" role="presentation">
          <div
            className="session-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Create campaign"
          >
            <h4 className="session-inline-form-title">Create Campaign</h4>
            <p className="session-card-subtitle">
              Any full-account user can create a campaign and becomes its DM.
            </p>
            <form onSubmit={handleCreateCampaign}>
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
              <div className="session-action-row">
                <button
                  type="submit"
                  disabled={isCreatingCampaign || !newCampaignName.trim()}
                  className="session-button session-button-brand"
                >
                  {isCreatingCampaign ? 'Creating...' : 'Create Campaign'}
                </button>
                <button
                  type="button"
                  className="session-button session-button-neutral"
                  onClick={() => setShowCreateCampaignModal(false)}
                >
                  Close
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showJoinCampaignModal && (
        <div className="session-modal-backdrop" role="presentation">
          <div className="session-modal" role="dialog" aria-modal="true" aria-label="Join campaign">
            <h4 className="session-inline-form-title">Join Campaign</h4>
            <form onSubmit={handleJoinCampaign}>
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
              <div className="session-action-row">
                <button
                  type="submit"
                  disabled={isJoiningCampaign || !joinCampaignId.trim() || !joinInviteCode.trim()}
                  className="session-button session-button-indigo"
                >
                  {isJoiningCampaign ? 'Joining...' : 'Join Campaign'}
                </button>
                <button
                  type="button"
                  className="session-button session-button-neutral"
                  onClick={() => setShowJoinCampaignModal(false)}
                >
                  Close
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
