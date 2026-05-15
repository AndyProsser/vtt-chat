/**
 * Session Initialization
 * Component for creating a new session and transitioning to active state.
 * Tests the full UI → Event → Store pipeline.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SessionState, Role, MessageType, isGreenroomSessionState } from '@shared'
import type { UUID } from '@shared'
import { PresenceState, RoomType } from '@shared'
import { useStore } from '../../hooks/useStore'
import { useWebSocket } from '../../hooks/useWebSocket'
import type { ConnectionState } from '../../ws/client'
import { useConnectionStatus } from '../../hooks/useConnectionStatus'
import { useCampaignSettings } from '../../hooks/useCampaignSettings'
import { useCharacterSettings } from '../../hooks/useCharacterSettings'
import { useSessionLifecycle } from '../../hooks/useSessionLifecycle'
import {
  createCampaignSettingsController,
  createCharacterSettingsController,
  createSessionMembershipController,
} from './sessionController'
import { ChatWindow } from '../chat/ChatWindow'
import { NotesPanel } from '../notes/NotesPanel'
import { CommandCenterFrame, type RightRailTab } from './CommandCenterFrame'
import { CampaignScaffoldPanel } from './CampaignScaffoldPanel'
import { SessionLeftRailPanel } from './SessionLeftRailPanel'
import { SessionLobbyView } from './SessionLobbyView'
import { SessionInitModals } from './SessionInitModals'
import { SessionToolbar } from './SessionToolbar'
import { ReconnectBanner } from '../ui/ReconnectBanner'
import { AudioPanel } from '../audio/AudioPanel'
import { NotesRailPanel } from './NotesRailPanel'
import { JournalPanel } from './JournalPanel'
import { HistoryPanel } from './HistoryPanel'
import { SessionRightRailContent } from './SessionRightRailContent'
import { CampaignRightbarSettings, type CharacterSettingsDraft } from './CampaignRightbarSettings'
import { CampaignInformationPanel } from './CampaignInformationPanel'
import { SpectatorWaitScreen } from './SpectatorWaitScreen'
import { useToast } from '../../hooks/useToast'
import { dismissToast } from '../../state/toastCenter'
import { isGreenRoomName } from '../../constants/roomPresence.constants'
import {
  ACTIVE_SESSION_CONTEXT_STORAGE_KEY,
  ALLOWED_CHAT_GROUPING_WINDOWS,
  CHAT_GROUPING_STORAGE_KEY,
  DEFAULT_CHAT_GROUPING_WINDOW_MS,
  DEFAULT_GREENROOM_CACHE_TTL_MS,
  DEFAULT_PLANNED_DURATION_MINUTES,
  LOBBY_AUTO_ENTER_CAMPAIGN_STORAGE_KEY,
  LOBBY_CAMPAIGN_FOCUS_STORAGE_KEY,
  LOBBY_NOTICE_STORAGE_KEY,
  MAX_POSTER_DATA_URL_CHARS,
  MAX_POSTER_WIDTH_PX,
  ROOM_ENVIRONMENT_PRESET_FALLBACKS,
  SESSION_BOOKEND_DEDUPE_WINDOW_MS,
  SESSION_BOOKEND_PREFIXES,
  SESSION_SUMMARY_TAG,
  SESSION_SUMMARY_TITLE,
  WS_AUTO_RETRY_WINDOW_MS,
  WS_ERROR_TOAST_ID,
} from '../../constants/sessionInit.constants'
import { createHttpTelemetryTransport, telemetryClient } from '../../utils/telemetry'
import { fetchSessionNotesOnce } from '../../utils/notesFetch'
import { FRONTEND_THEME_CLASSES, type FrontendThemeMode } from '../../tokens'
import type { Session as SessionRecord } from '@/types/session'
import type { Note } from '@/types/notes'
import type { Message } from '@/types/chat'
import type {
  Room as RoomRecord,
  RoomUser as RoomMember,
  SessionPresence as PresenceRecord,
} from '@/types/room'
import {
  type CampaignMembershipRole,
  type CampaignSettingsPayload,
  type CampaignSettingsHomeTab,
  type CampaignSummary,
  getCampaignDisplayState,
  resolveMembershipRole,
} from './sessionInit.shared'
import '../../styles/components/session/SessionInit.css'

interface SessionInitProps {
  apiUrl: string
  wsUrl: string
  token: string
  user: { id: UUID; username: string; role: Role; authType?: 'FULL' | 'GUEST' }
  onSessionCreated?: (sessionId: UUID) => void
  onReady?: () => void
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
  role?: Role
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

interface ApiTakeoverIdentitySnapshot {
  active: boolean
  actorUserId: UUID
  effectiveUserId: UUID
  assumedUserId: UUID | null
  assumedDisplayName: string | null
  startedAt: number | null
  staleRecovered: boolean
}

interface ApiSessionStats {
  connectedPlayersWithDm: number
  connectedPlayers: number
  connectedSpectators: number
  connectedTotal: number
  updatedAt: number
}

interface ApiBroadcastState {
  enabled: boolean
  dmId?: UUID
  broadcastRoomId?: string
  changedAt?: number
}

interface ApiAudioEnvironmentState {
  roomId: UUID
  environmentName: string
}

function safeLocalStorageGetItem(key: string): string | null {
  if (typeof window === 'undefined' || typeof window.localStorage?.getItem !== 'function') {
    return null
  }

  return window.localStorage.getItem(key)
}

function safeLocalStorageSetItem(key: string, value: string): void {
  if (typeof window === 'undefined' || typeof window.localStorage?.setItem !== 'function') {
    return
  }

  window.localStorage.setItem(key, value)
}

function safeLocalStorageRemoveItem(key: string): void {
  if (typeof window === 'undefined' || typeof window.localStorage?.removeItem !== 'function') {
    return
  }

  window.localStorage.removeItem(key)
}

type ActiveSessionContext = {
  campaignId: UUID
  sessionId: UUID
}

function isSessionBookendMessage(content: string): boolean {
  return SESSION_BOOKEND_PREFIXES.some((prefix) => content.startsWith(prefix))
}

function buildRoomEnvironmentPreset(roomId: UUID, environmentName: string) {
  const key = environmentName.trim().toLowerCase()
  const fallback =
    ROOM_ENVIRONMENT_PRESET_FALLBACKS[key] || ROOM_ENVIRONMENT_PRESET_FALLBACKS.default

  return {
    id: roomId,
    name: environmentName,
    reverbSend: fallback.reverbSend,
    lowpassFreq: fallback.lowpassFreq,
    roomGain: fallback.roomGain,
  }
}

function resolveGreenroomCacheTtlMs(): number {
  const raw = Number(import.meta.env.VITE_GREENROOM_CACHE_TTL_MS)

  if (!Number.isFinite(raw) || raw < 0) {
    return DEFAULT_GREENROOM_CACHE_TTL_MS
  }

  return raw
}

type UserCharacterRecord = {
  id: UUID
  campaignId: UUID
  userId: UUID
  name: string
  race: string | null
  class: string | null
  subclass: string | null
  avatarUrl: string | null
  metadata: Record<string, unknown> | null
  isActive: boolean
}

const DEFAULT_CHARACTER_SETTINGS: CharacterSettingsDraft = {
  name: '',
  race: 'Human',
  className: 'Fighter',
  subclass: '',
  avatarUrl: '',
  level: 1,
  strength: 8,
  dexterity: 8,
  constitution: 8,
  intelligence: 8,
  wisdom: 8,
  charisma: 8,
}

function toValidStat(value: unknown, fallback = 8): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.max(1, Math.min(30, Math.round(parsed)))
}

function buildCharacterDraft(character: UserCharacterRecord | null): CharacterSettingsDraft {
  if (!character) {
    return { ...DEFAULT_CHARACTER_SETTINGS }
  }

  const metadata = character.metadata || {}

  return {
    name: character.name || '',
    race: character.race || 'Human',
    className: character.class || 'Fighter',
    subclass: character.subclass || '',
    avatarUrl: character.avatarUrl || '',
    level: Math.max(1, Math.min(20, Number(metadata.level) || 1)),
    strength: toValidStat(metadata.strength),
    dexterity: toValidStat(metadata.dexterity),
    constitution: toValidStat(metadata.constitution),
    intelligence: toValidStat(metadata.intelligence),
    wisdom: toValidStat(metadata.wisdom),
    charisma: toValidStat(metadata.charisma),
  }
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

function getPreferredSession(sessions: SessionRecord[]): SessionRecord | null {
  if (sessions.length === 0) return null

  const active = sessions.find((session) => session.state === SessionState.ACTIVE)
  if (active) return active

  const paused = sessions.find((session) => session.state === SessionState.PAUSED)
  if (paused) return paused

  const greenroom = sessions.find((session) => isGreenroomSessionState(session.state))
  if (greenroom) return greenroom

  return null
}

function getSessionsSortedChronologically(sessions: SessionRecord[]): SessionRecord[] {
  return [...sessions].sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return left.createdAt - right.createdAt
    }

    return left.id.localeCompare(right.id)
  })
}

function getLatestSessionChronologically(sessions: SessionRecord[]): SessionRecord | null {
  const sorted = getSessionsSortedChronologically(sessions)
  return sorted.length ? sorted[sorted.length - 1] : null
}

function getPreviousSessionChronologically(
  sessions: SessionRecord[],
  currentSessionId: UUID
): SessionRecord | null {
  const sorted = getSessionsSortedChronologically(sessions)
  const currentIndex = sorted.findIndex((session) => session.id === currentSessionId)

  if (currentIndex <= 0) {
    return null
  }

  return sorted[currentIndex - 1] || null
}

function formatSessionBookendTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}

function buildDefaultChapterName(existingSessions: SessionRecord[]): string {
  const nextSessionNumber = existingSessions.length + 1
  const dateLabel = new Date().toLocaleDateString('en-CA')
  return `Session ${nextSessionNumber} - ${dateLabel}`
}

function normalizeTimestamp(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) {
      return numeric
    }

    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return undefined
}

function normalizeSessionRecord(raw: SessionRecord): SessionRecord {
  const createdAt = normalizeTimestamp((raw as SessionRecord & { createdAt?: unknown }).createdAt)
  const startedAt = normalizeTimestamp((raw as SessionRecord & { startedAt?: unknown }).startedAt)
  const pausedAt = normalizeTimestamp((raw as SessionRecord & { pausedAt?: unknown }).pausedAt)
  const endedAt = normalizeTimestamp((raw as SessionRecord & { endedAt?: unknown }).endedAt)
  const updatedAt = normalizeTimestamp((raw as SessionRecord & { updatedAt?: unknown }).updatedAt)

  return {
    ...raw,
    createdAt: createdAt ?? Date.now(),
    startedAt,
    pausedAt,
    endedAt,
    updatedAt,
  }
}

function isGreenRoom(room: Pick<RoomRecord, 'type' | 'name'>): boolean {
  if (room.type !== RoomType.GROUP) {
    return false
  }

  return isGreenRoomName(room.name)
}

function getVisibleRoomsForSessionState(rooms: RoomRecord[], state: SessionState): RoomRecord[] {
  if (!rooms.length) {
    return rooms
  }

  if (isGreenroomSessionState(state)) {
    const greenRooms = rooms.filter((room) => isGreenRoom(room))
    return greenRooms.length ? greenRooms : rooms
  }

  if (state === SessionState.ACTIVE || state === SessionState.PAUSED) {
    return rooms
  }

  return rooms
}

function toSessionStateValue(state: SessionState): SessionState {
  return state
}

function parsePlayerInviteCode(input: string): string {
  const raw = input.trim()
  if (!raw) {
    return ''
  }

  try {
    const parsedUrl = new URL(raw)
    const joinMatch = parsedUrl.pathname.match(/\/join\/([^/?#]+)/i)
    if (joinMatch?.[1]) {
      return decodeURIComponent(joinMatch[1]).trim().toUpperCase()
    }
  } catch {
    // Input may be plain invite code or a relative join path.
  }

  const pathMatch = raw.match(/\/join\/([^/?#]+)/i)
  if (pathMatch?.[1]) {
    return decodeURIComponent(pathMatch[1]).trim().toUpperCase()
  }

  return raw.toUpperCase()
}

function toValidPostSessionDurationMinutes(value: unknown, fallback = 5): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.max(1, Math.min(60, Math.round(parsed)))
}

export function SessionInit({
  apiUrl,
  wsUrl,
  token,
  user,
  onSessionCreated,
  onReady,
}: SessionInitProps) {
  const showToast = useToast()

  const detectThemeMode = (): FrontendThemeMode => {
    if (typeof document === 'undefined') {
      return 'light'
    }

    return document.documentElement.classList.contains(FRONTEND_THEME_CLASSES.dark)
      ? 'dark'
      : 'light'
  }

  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([])
  const [selectedCampaignId, setSelectedCampaignId] = useState<UUID | ''>('')
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(true)
  const [isCreatingCampaign, setIsCreatingCampaign] = useState(false)
  const [newCampaignName, setNewCampaignName] = useState('')
  const [newCampaignDescription, setNewCampaignDescription] = useState('')
  const [joinInviteInput, setJoinInviteInput] = useState('')
  const [isJoiningCampaign, setIsJoiningCampaign] = useState(false)
  const [showCreateCampaignModal, setShowCreateCampaignModal] = useState(false)
  const [showJoinCampaignModal, setShowJoinCampaignModal] = useState(false)
  const [showUserSettingsModal, setShowUserSettingsModal] = useState(false)
  const [showExitSessionModal, setShowExitSessionModal] = useState(false)
  const [showStopSessionModal, setShowStopSessionModal] = useState(false)
  const [exitUpgradePassword, setExitUpgradePassword] = useState('')
  const [exitUpgradeLoading, setExitUpgradeLoading] = useState(false)
  const [exitUpgradeError, setExitUpgradeError] = useState<string | null>(null)
  const [showCampaignSettingsModal, setShowCampaignSettingsModal] = useState(false)

  // Campaign settings hook
  const [campaignSettings, campaignSettingsActions] = useCampaignSettings()
  const {
    isSettingsLoading,
    isSettingsSaving,
    isInviteReissuing,
    isDmVoiceTargetingSettingLoading,
    isDmVoiceTargetingSettingSaving,
    settingsCampaignId,
    settingsHomeTab,
    settingsCampaignSessions,
    settingsReferenceSessionId,
    isSettingsReferenceNotesLoading,
    settingsReferenceNotesError,
    settingsData,
    settingsName,
    settingsDescription,
    settingsVisibility,
    settingsSpectatorsEnabled,
    settingsSpectatorMax,
    settingsSpectatorWaitlistEnabled,
    settingsSpectatorReconnectGraceSecs,
    settingsExtensionSyncPolicy,
    settingsPostSessionChatEnabled,
    settingsPostSessionChatDurationMinutes,
    settingsDmAutoTargetOnFirstPlayerJoin,
    settingsLateJoinPolicy,
    settingsLateJoinGraceMinutes,
    settingsPosterUrl,
  } = campaignSettings

  // Character settings hook
  const [characterSettings, characterSettingsActions] = useCharacterSettings()
  const {
    isCharacterSettingsLoading,
    isCharacterSettingsSaving,
    userCharacters,
    selectedCharacterId,
    characterSettingsDraft,
  } = characterSettings

  // Session lifecycle hook
  const [sessionLifecycle, sessionLifecycleActions, sessionLifecycleRefs] = useSessionLifecycle()
  const { wsRetryWindowExpired, wsRetrySecondsRemaining } = sessionLifecycle
  const {
    prevWsStateRef,
    wsTelemetryPrevRef,
    lastHydratedSessionFingerprintRef,
    wsRetryWindowStartRef,
    wsRetryToastTimerRef,
    wsErrorMessageRef,
  } = sessionLifecycleRefs

  const [sessionSettingsName, setSessionSettingsName] = useState('')
  const [sessionSettingsDescription, setSessionSettingsDescription] = useState('')
  const [sessionSettingsPlannedDurationMinutes, setSessionSettingsPlannedDurationMinutes] =
    useState(DEFAULT_PLANNED_DURATION_MINUTES)
  const [isSessionSettingsSaving, setIsSessionSettingsSaving] = useState(false)
  const [selectedRoomIdOverride, setSelectedRoomIdOverride] = useState<UUID | ''>('')
  const [error, setError] = useState<string | null>(null)
  const [lobbyNotice, setLobbyNotice] = useState<string | null>(null)
  const [dismissedTransitionEventId, setDismissedTransitionEventId] = useState<string | null>(null)
  const [themeMode, setThemeMode] = useState<FrontendThemeMode>(detectThemeMode)
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
  const lobbyAutoEnterTriggeredRef = useRef(false)
  const pendingGreenroomCarryBySessionIdRef = useRef<Map<UUID, UUID>>(new Map())
  const greenroomCleanupTimerRef = useRef<number | null>(null)
  const authFailureHandledRef = useRef(false)
  const hasSignaledReadyRef = useRef(false)
  const [isCampaignRestorePending, setIsCampaignRestorePending] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false
    }

    const sessionContext = window.sessionStorage.getItem(ACTIVE_SESSION_CONTEXT_STORAGE_KEY)
    const localContext = safeLocalStorageGetItem(ACTIVE_SESSION_CONTEXT_STORAGE_KEY)
    const pendingAutoEnter = window.sessionStorage.getItem(LOBBY_AUTO_ENTER_CAMPAIGN_STORAGE_KEY)

    return Boolean(sessionContext || localContext || pendingAutoEnter)
  })

  const clearPersistedActiveSessionContext = useCallback(() => {
    sessionStorage.removeItem(ACTIVE_SESSION_CONTEXT_STORAGE_KEY)
    safeLocalStorageRemoveItem(ACTIVE_SESSION_CONTEXT_STORAGE_KEY)
  }, [])

  const forceLogoutToAuthScreen = useCallback(() => {
    if (authFailureHandledRef.current) {
      return
    }
    authFailureHandledRef.current = true
    sessionStorage.removeItem('authToken')
    sessionStorage.removeItem('user')
    clearPersistedActiveSessionContext()
    window.location.assign('/')
  }, [clearPersistedActiveSessionContext])

  const fetchWithAuthGuard = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const response = await window.fetch(input, init)
      if (response.status === 401 || response.status === 403) {
        forceLogoutToAuthScreen()
        throw new Error(`Authentication failed (${response.status})`)
      }
      return response
    },
    [forceLogoutToAuthScreen]
  )

  const handleWebSocketAuthFailure = useCallback(() => {
    forceLogoutToAuthScreen()
  }, [forceLogoutToAuthScreen])

  // Controllers for API orchestration (lazy-initialized in effect to avoid ref access during render)
  const campaignSettingsControllerRef = useRef<ReturnType<
    typeof createCampaignSettingsController
  > | null>(null)
  const characterSettingsControllerRef = useRef<ReturnType<
    typeof createCharacterSettingsController
  > | null>(null)
  const sessionMembershipControllerRef = useRef<ReturnType<
    typeof createSessionMembershipController
  > | null>(null)

  useEffect(() => {
    if (!campaignSettingsControllerRef.current) {
      campaignSettingsControllerRef.current = createCampaignSettingsController({
        apiUrl,
        token,
        fetchWithAuthGuard,
      })
    }
    if (!characterSettingsControllerRef.current) {
      characterSettingsControllerRef.current = createCharacterSettingsController({
        apiUrl,
        token,
        fetchWithAuthGuard,
      })
    }
    if (!sessionMembershipControllerRef.current) {
      sessionMembershipControllerRef.current = createSessionMembershipController({
        apiUrl,
        token,
        fetchWithAuthGuard,
      })
    }
  }, [apiUrl, token, fetchWithAuthGuard])

  const campaignSettingsController = campaignSettingsControllerRef.current!
  const characterSettingsController = characterSettingsControllerRef.current!
  const sessionMembershipController = sessionMembershipControllerRef.current!

  // Helper to fetch campaign sessions
  const fetchCampaignSessionsData = useCallback(
    async (campaignId: UUID): Promise<SessionRecord[]> => {
      const response = await fetchWithAuthGuard(`${apiUrl}/api/campaigns/${campaignId}/sessions`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to fetch campaign sessions')
      }

      const data = await response.json()
      return (data.sessions || []) as SessionRecord[]
    },
    [apiUrl, token, fetchWithAuthGuard]
  )

  // Store
  const sessions = useStore((state) => state.sessions)
  const currentSessionId = useStore((state) => state.currentSessionId)
  const isGreenroom = useStore((state) => state.isGreenroom)
  const rooms = useStore((state) => state.rooms)
  const sessionPresence = useStore((state) => state.sessionPresence)
  const sessionStatsBySessionId = useStore((state) => state.sessionStatsBySessionId)
  const roomMembers = useStore((state) => state.roomMembers)
  const messages = useStore((state) => state.messages)
  const notes = useStore((state) => state.notes)
  const addNote = useStore((state) => state.addNote)
  const addMessage = useStore((state) => state.addMessage)
  const clearRoomMessages = useStore((state) => state.clearRoomMessages)
  const sessionTransitionNotice = useStore((state) => state.sessionTransitionNotice)
  const dmOverrides = useStore((state) => state.dmOverrides)
  const broadcastModeEnabled = useStore((state) => state.broadcastModeEnabled)
  const setBroadcastState = useStore((state) => state.setBroadcastState)
  const currentEnvironment = useStore((state) => state.currentEnvironment)
  const setEnvironment = useStore((state) => state.setEnvironment)
  const clearEnvironment = useStore((state) => state.clearEnvironment)
  const resetSessionAudioState = useStore((state) => state.resetSessionAudioState)
  const clearActiveEffects = useStore((state) => state.clearActiveEffects)
  const setPrivateRoomCleanMode = useStore((state) => state.setPrivateRoomCleanMode)
  const roomEnvironmentNames = useStore((state) => state.roomEnvironmentNames)
  const replaceRoomEnvironmentNames = useStore((state) => state.replaceRoomEnvironmentNames)
  const replaceDMOverrides = useStore((state) => state.replaceDMOverrides)
  const currentConditionName = useStore((state) => state.currentCondition?.name)
  const clearSessions = useStore((state) => state.clearSessions)
  const replaceSessions = useStore((state) => state.replaceSessions)
  const replaceSessionTopology = useStore((state) => state.replaceSessionTopology)
  const replaceSessionStatsSnapshot = useStore((state) => state.replaceSessionStatsSnapshot)
  const setMockTakeoverUserId = useStore((state) => state.setMockTakeoverUserId)
  const setCurrentSession = useStore((state) => state.setCurrentSession)
  const setIsGreenroom = useStore((state) => state.setIsGreenroom)
  const resetToolbarActionsState = useStore((state) => state.resetToolbarActionsState)
  const setToolbarCenterPaneView = useStore((state) => state.setToolbarCenterPaneView)
  const updateSession = useStore((state) => state.updateSession)
  const pauseStats = useStore((state) => state.pauseStats)
  const typedSessions = sessions as Record<UUID, SessionRecord>
  const sessionList: SessionRecord[] = Object.values(typedSessions)
  const currentSession = currentSessionId ? sessions[currentSessionId] || null : null

  // WebSocket connection
  const {
    state: wsState,
    error: wsError,
    send,
    retryConnection,
  } = useWebSocket({
    url: wsUrl,
    token,
    sessionId: currentSessionId,
    enabled: !!token,
    onAuthFailure: handleWebSocketAuthFailure,
  })

  const currentPauseStats = currentSessionId
    ? (pauseStats[currentSessionId] ?? {
        cumulativePauseMs: 0,
        pauseCount: 0,
        pauseStartedAt: undefined,
      })
    : { cumulativePauseMs: 0, pauseCount: 0, pauseStartedAt: undefined }
  const selectedCharacter = useMemo(
    () =>
      userCharacters.find((character) => character.id === selectedCharacterId) ||
      userCharacters.find((character) => character.isActive) ||
      userCharacters[0] ||
      null,
    [selectedCharacterId, userCharacters]
  )

  useEffect(() => {
    setSessionSettingsName(currentSession?.name || '')
    setSessionSettingsDescription(currentSession?.description || '')
    setSessionSettingsPlannedDurationMinutes(
      currentSession?.plannedDurationMinutes || DEFAULT_PLANNED_DURATION_MINUTES
    )
  }, [
    currentSession?.description,
    currentSession?.id,
    currentSession?.name,
    currentSession?.plannedDurationMinutes,
  ])

  const handlePlannedDurationMinutesChange = useCallback((nextValue: number) => {
    if (!Number.isFinite(nextValue)) {
      return
    }

    const clamped = Math.max(15, Math.min(720, Math.round(nextValue)))
    setSessionSettingsPlannedDurationMinutes(clamped)
  }, [])

  useEffect(() => {
    if (!selectedCharacter) {
      const DEFAULT_CHAR_SETTINGS = {
        name: '',
        race: 'Human',
        className: 'Fighter',
        subclass: '',
        avatarUrl: '',
        level: 1,
        strength: 8,
        dexterity: 8,
        constitution: 8,
        intelligence: 8,
        wisdom: 8,
        charisma: 8,
      }
      characterSettingsActions.setCharacterSettingsDraft(DEFAULT_CHAR_SETTINGS)
      return
    }

    characterSettingsActions.setSelectedCharacterId(selectedCharacter.id)
    characterSettingsActions.setCharacterSettingsDraft(buildCharacterDraft(selectedCharacter))
  }, [selectedCharacter, characterSettingsActions])

  useEffect(() => {
    const hasSessionSurface = Boolean(currentSessionId) && Boolean(currentSession)
    const hasLobbySurface = !currentSessionId

    if (
      hasSignaledReadyRef.current ||
      isLoadingCampaigns ||
      isCampaignRestorePending ||
      (!hasSessionSurface && !hasLobbySurface)
    ) {
      return
    }

    hasSignaledReadyRef.current = true
    onReady?.()
  }, [currentSession, currentSessionId, isCampaignRestorePending, isLoadingCampaigns, onReady])

  const typedRoomsBySession = rooms as Record<UUID, Record<UUID, RoomRecord>>
  const typedPresenceBySession = sessionPresence as Record<UUID, Record<UUID, PresenceRecord>>
  const typedSessionStatsBySession = sessionStatsBySessionId as Record<UUID, ApiSessionStats>
  const typedRoomMembers = roomMembers as Record<UUID, RoomMember[]>
  const currentRooms = useMemo<RoomRecord[]>(
    () => (currentSession ? Object.values(typedRoomsBySession[currentSession.id] || {}) : []),
    [currentSession, typedRoomsBySession]
  )
  const currentPresence = useMemo<PresenceRecord[]>(
    () => (currentSession ? Object.values(typedPresenceBySession[currentSession.id] || {}) : []),
    [currentSession, typedPresenceBySession]
  )
  const currentSessionStats = currentSession
    ? typedSessionStatsBySession[currentSession.id]
    : undefined
  const visibleRooms = useMemo<RoomRecord[]>(
    () =>
      currentSession ? getVisibleRoomsForSessionState(currentRooms, currentSession.state) : [],
    [currentRooms, currentSession]
  )
  const currentTransitionNotice = currentSession
    ? sessionTransitionNotice[currentSession.id]
    : undefined
  const currentSessionNoteCount = currentSession
    ? Object.keys(notes[currentSession.id] ?? {}).length
    : 0
  const typedNotesBySession = notes as Record<UUID, Record<UUID, Note>>
  const typedMessagesBySession = messages as Record<UUID, Record<UUID, Message>>
  const selectedRoomId = useMemo<UUID | ''>(() => {
    if (!visibleRooms.length) {
      return ''
    }

    if (selectedRoomIdOverride && visibleRooms.some((room) => room.id === selectedRoomIdOverride)) {
      return selectedRoomIdOverride
    }

    const ownPresence = currentPresence.find((presence) => presence.userId === user.id)
    if (
      ownPresence?.primaryRoomId &&
      visibleRooms.some((room) => room.id === ownPresence.primaryRoomId)
    ) {
      return ownPresence.primaryRoomId
    }

    const mainRoom = visibleRooms.find((room) => room.type === RoomType.MAIN)
    return (mainRoom || visibleRooms[0]).id
  }, [currentPresence, visibleRooms, selectedRoomIdOverride, user.id])
  const selectedRoom = useMemo(
    () => visibleRooms.find((room) => room.id === selectedRoomId) || null,
    [selectedRoomId, visibleRooms]
  )
  const isGreenroomChatMode = Boolean(selectedRoom && isGreenRoom(selectedRoom))
  const connectedRoomId = useMemo<UUID | ''>(() => {
    const ownPresence = currentPresence.find((presence) => presence.userId === user.id)
    return ownPresence?.primaryRoomId || ''
  }, [currentPresence, user.id])

  useEffect(() => {
    if (!currentSession) {
      setPrivateRoomCleanMode(false)
      return
    }

    const ownPresence = currentPresence.find((presence) => presence.userId === user.id)
    const ownRoomType = ownPresence?.primaryRoomId
      ? currentRooms.find((room) => room.id === ownPresence.primaryRoomId)?.type
      : undefined

    setPrivateRoomCleanMode(ownRoomType === RoomType.PRIVATE)
  }, [currentPresence, currentRooms, currentSession, setPrivateRoomCleanMode, user.id])

  useEffect(() => {
    if (!currentSession || !connectedRoomId) {
      if (currentEnvironment) {
        clearEnvironment()
      }
      return
    }

    const connectedRoom = currentRooms.find((room) => room.id === connectedRoomId)
    if (!connectedRoom) {
      if (currentEnvironment) {
        clearEnvironment()
      }
      return
    }

    if (connectedRoom && (isGreenRoom(connectedRoom) || connectedRoom.type === RoomType.PRIVATE)) {
      if (currentEnvironment) {
        clearEnvironment()
      }
      return
    }

    const hasSelectedRoomEnvironment = Object.prototype.hasOwnProperty.call(
      roomEnvironmentNames,
      connectedRoomId
    )
    if (!hasSelectedRoomEnvironment) {
      if (currentEnvironment) {
        clearEnvironment()
      }
      return
    }

    const roomEnvironmentName = roomEnvironmentNames[connectedRoomId]
    if (!roomEnvironmentName || roomEnvironmentName.trim().toLowerCase() === 'default') {
      if (currentEnvironment) {
        clearEnvironment()
      }
      return
    }

    if (
      currentEnvironment?.name?.trim().toLowerCase() === roomEnvironmentName.trim().toLowerCase()
    ) {
      return
    }

    setEnvironment(buildRoomEnvironmentPreset(connectedRoomId, roomEnvironmentName))
  }, [
    clearEnvironment,
    connectedRoomId,
    currentEnvironment,
    currentRooms,
    currentSession,
    roomEnvironmentNames,
    setEnvironment,
  ])

  const scheduleGreenroomCarry = useCallback((fromSessionId: UUID, toSessionId: UUID) => {
    if (fromSessionId === toSessionId) {
      return
    }

    pendingGreenroomCarryBySessionIdRef.current.set(toSessionId, fromSessionId)
  }, [])

  const restoreSessionBookendsFromHistory = useCallback(
    async (sessionId: UUID, rooms: Array<Pick<RoomRecord, 'id' | 'type' | 'name'>>) => {
      const targetRoomIds = rooms
        .filter((room) => room.type === RoomType.MAIN || isGreenRoom(room))
        .map((room) => room.id)

      if (!targetRoomIds.length) {
        return
      }

      const historyByRoom = await Promise.all(
        targetRoomIds.map(async (roomId) => {
          try {
            const response = await fetchWithAuthGuard(
              `${apiUrl}/api/chat/messages/${sessionId}?roomId=${roomId}`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }
            )

            if (!response.ok) {
              return [] as Message[]
            }

            const payload = (await response.json().catch(() => ({}))) as {
              messages?: Array<{
                id?: UUID
                roomId?: UUID
                authorId?: UUID
                authorUsername?: string
                content?: string
                type?: MessageType
                isDmOnly?: boolean
                createdAt?: number | string
                editedAt?: number
              }>
            }

            const rawMessages = Array.isArray(payload.messages) ? payload.messages : []

            return rawMessages
              .map((entry) => {
                const createdAtRaw = entry.createdAt
                const createdAt =
                  typeof createdAtRaw === 'number'
                    ? createdAtRaw
                    : typeof createdAtRaw === 'string'
                      ? new Date(createdAtRaw).getTime()
                      : Number.NaN

                if (
                  !entry.authorId ||
                  !entry.authorUsername ||
                  !entry.content ||
                  !entry.type ||
                  !Number.isFinite(createdAt)
                ) {
                  return null
                }

                return {
                  id: (entry.id || crypto.randomUUID()) as UUID,
                  roomId: (entry.roomId || roomId) as UUID,
                  authorId: entry.authorId,
                  authorUsername: entry.authorUsername,
                  content: entry.content,
                  type: entry.type,
                  isDmOnly: Boolean(entry.isDmOnly),
                  createdAt,
                  editedAt: entry.editedAt,
                } as Message
              })
              .filter((message): message is Message => Boolean(message))
          } catch {
            return [] as Message[]
          }
        })
      )

      const recoveredBookends = historyByRoom
        .flat()
        .filter(
          (message) =>
            message.type === MessageType.SYSTEM && isSessionBookendMessage(message.content)
        )
        .sort((left, right) => left.createdAt - right.createdAt)

      if (!recoveredBookends.length) {
        return
      }

      const sessionMessages = Object.values(
        (useStore.getState().messages as Record<UUID, Record<UUID, Message>>)[sessionId] || {}
      )

      const existingSignatures = new Set(
        sessionMessages
          .filter((message) => Boolean(message.roomId) && targetRoomIds.includes(message.roomId!))
          .map(
            (message) => `${message.roomId}:${message.authorId}:${message.type}:${message.content}`
          )
      )

      for (const message of recoveredBookends) {
        const roomId = message.roomId
        if (!roomId || !targetRoomIds.includes(roomId)) {
          continue
        }

        const roomSignature = `${roomId}:${message.authorId}:${message.type}:${message.content}`
        if (existingSignatures.has(roomSignature)) {
          continue
        }

        addMessage(sessionId, {
          ...message,
          id: crypto.randomUUID() as UUID,
        })
        existingSignatures.add(roomSignature)
      }
    },
    [addMessage, apiUrl, fetchWithAuthGuard, token]
  )

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
    if (!currentSession) {
      return
    }

    const fromSessionId = pendingGreenroomCarryBySessionIdRef.current.get(currentSession.id)
    if (!fromSessionId) {
      return
    }

    const targetGreenroom = currentRooms.find((room) => isGreenRoom(room))
    if (!targetGreenroom) {
      return
    }

    const fromRooms = Object.values(typedRoomsBySession[fromSessionId] || {})
    const fromGreenroom = fromRooms.find((room) => isGreenRoom(room))
    if (!fromGreenroom) {
      pendingGreenroomCarryBySessionIdRef.current.delete(currentSession.id)
      return
    }

    // Contract: session boundary markers are runtime-session only and must never
    // appear in Greenroom. We intentionally do not carry any boundary markers.
    void targetGreenroom
    void fromGreenroom

    pendingGreenroomCarryBySessionIdRef.current.delete(currentSession.id)
  }, [addMessage, currentRooms, currentSession, typedMessagesBySession, typedRoomsBySession])

  const loadCampaignSettings = useCallback(
    async (campaignId: UUID): Promise<CampaignSettingsPayload | null> => {
      campaignSettingsActions.setIsSettingsLoading(true)
      setError(null)

      const result = await campaignSettingsController.loadCampaignSettings(campaignId, {
        onSettingsLoaded: (settings) => {
          campaignSettingsActions.setSettingsData(settings)
          campaignSettingsActions.setSettingsReferenceSessionId(settings.latestSessionId || '')
          campaignSettingsActions.setSettingsName(settings.name)
          campaignSettingsActions.setSettingsDescription(settings.description || '')
          campaignSettingsActions.setSettingsVisibility(
            settings.discoverable ? 'PUBLIC' : 'PRIVATE'
          )
          campaignSettingsActions.setSettingsSpectatorsEnabled(settings.spectatorPolicy !== 'NONE')
          campaignSettingsActions.setSettingsSpectatorMax(settings.spectatorMax ?? 10)
          campaignSettingsActions.setSettingsSpectatorWaitlistEnabled(
            settings.spectatorWaitlistEnabled
          )
          campaignSettingsActions.setSettingsSpectatorReconnectGraceSecs(
            settings.spectatorReconnectGraceSecs
          )
          campaignSettingsActions.setSettingsPostSessionChatEnabled(settings.postSessionChatEnabled)
          campaignSettingsActions.setSettingsPostSessionChatDurationMinutes(
            toValidPostSessionDurationMinutes(settings.postSessionChatDurationMs / 60000)
          )
          campaignSettingsActions.setSettingsDmAutoTargetOnFirstPlayerJoin(
            settings.dmAutoTargetOnFirstPlayerJoin ?? true
          )
          campaignSettingsActions.setSettingsExtensionSyncPolicy(
            settings.extensionSyncPolicy === 'DM_AND_PLAYERS'
              ? 'ALLOW'
              : settings.extensionSyncPolicy
          )
          campaignSettingsActions.setSettingsLateJoinPolicy(settings.lateJoinPolicy)
          campaignSettingsActions.setSettingsLateJoinGraceMinutes(settings.lateJoinGraceMinutes)
          campaignSettingsActions.setSettingsPosterUrl(settings.posterUrl || '')
        },
        onError: (message) => setError(message),
      })

      campaignSettingsActions.setIsSettingsLoading(false)
      return result
    },
    [campaignSettingsController, campaignSettingsActions]
  )

  const loadDmVoiceTargetingSetting = useCallback(
    async (campaignId: UUID): Promise<boolean | null> => {
      campaignSettingsActions.setIsDmVoiceTargetingSettingLoading(true)

      const result = await campaignSettingsController.loadDmVoiceTargetingSetting(campaignId, {
        onDmVoiceTargetingLoaded: (enabled) => {
          campaignSettingsActions.setSettingsDmAutoTargetOnFirstPlayerJoin(enabled)
        },
      })

      campaignSettingsActions.setIsDmVoiceTargetingSettingLoading(false)
      return result
    },
    [campaignSettingsController, campaignSettingsActions]
  )

  const saveDmVoiceTargetingSetting = useCallback(
    async (campaignId: UUID) => {
      campaignSettingsActions.setIsDmVoiceTargetingSettingSaving(true)
      setError(null)

      await campaignSettingsController.saveDmVoiceTargetingSetting(
        campaignId,
        settingsDmAutoTargetOnFirstPlayerJoin,
        {
          onNotice: (message) => setLobbyNotice(message),
          onError: (message) => setError(message),
        }
      )

      campaignSettingsActions.setIsDmVoiceTargetingSettingSaving(false)
    },
    [campaignSettingsController, campaignSettingsActions, settingsDmAutoTargetOnFirstPlayerJoin]
  )

  const saveSessionSettings = useCallback(async () => {
    if (!currentSession) {
      return
    }

    setIsSessionSettingsSaving(true)
    setError(null)

    try {
      const response = await fetchWithAuthGuard(`${apiUrl}/api/session/${currentSession.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: sessionSettingsName,
          description: sessionSettingsDescription,
          plannedDurationMinutes: sessionSettingsPlannedDurationMinutes,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.message || 'Failed to save session settings')
      }

      const payload = (await response.json()) as { session: SessionRecord }
      if (payload.session) {
        updateSession(payload.session.id, normalizeSessionRecord(payload.session))
      }
      setLobbyNotice('Session settings saved.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save session settings'
      setError(message)
    } finally {
      setIsSessionSettingsSaving(false)
    }
  }, [
    apiUrl,
    currentSession,
    fetchWithAuthGuard,
    sessionSettingsDescription,
    sessionSettingsName,
    sessionSettingsPlannedDurationMinutes,
    token,
    updateSession,
  ])

  const loadUserCharacters = useCallback(async () => {
    if (!selectedCampaignId) {
      characterSettingsActions.setUserCharacters([])
      characterSettingsActions.setSelectedCharacterId('')
      characterSettingsActions.setCharacterSettingsDraft({ ...DEFAULT_CHARACTER_SETTINGS })
      return
    }

    characterSettingsActions.setIsCharacterSettingsLoading(true)

    const characters = await characterSettingsController.loadUserCharacters(selectedCampaignId, {
      onCharactersLoaded: (loadedCharacters) => {
        characterSettingsActions.setUserCharacters(loadedCharacters)
        const preferred =
          loadedCharacters.find((character) => character.isActive) || loadedCharacters[0]
        characterSettingsActions.setSelectedCharacterId(preferred?.id || '')
        characterSettingsActions.setCharacterSettingsDraft(buildCharacterDraft(preferred || null))
      },
      onError: () => {
        characterSettingsActions.setUserCharacters([])
        characterSettingsActions.setSelectedCharacterId('')
        characterSettingsActions.setCharacterSettingsDraft({ ...DEFAULT_CHARACTER_SETTINGS })
      },
    })

    if (characters.length === 0) {
      characterSettingsActions.setUserCharacters([])
      characterSettingsActions.setSelectedCharacterId('')
      characterSettingsActions.setCharacterSettingsDraft({ ...DEFAULT_CHARACTER_SETTINGS })
    }

    characterSettingsActions.setIsCharacterSettingsLoading(false)
  }, [characterSettingsController, characterSettingsActions, selectedCampaignId])

  const saveCharacterSettings = useCallback(async () => {
    if (!selectedCampaignId) {
      return
    }

    characterSettingsActions.setIsCharacterSettingsSaving(true)
    setError(null)

    await characterSettingsController.saveCharacterSettings(
      selectedCampaignId,
      selectedCharacterId,
      characterSettingsDraft,
      {
        onNotice: (message) => setLobbyNotice(message),
        onError: (message) => setError(message),
        onCharacterSaved: async () => {
          await loadUserCharacters()
        },
      }
    )

    characterSettingsActions.setIsCharacterSettingsSaving(false)
  }, [
    characterSettingsController,
    characterSettingsActions,
    selectedCampaignId,
    selectedCharacterId,
    characterSettingsDraft,
    loadUserCharacters,
  ])

  const handleCharacterFieldChange = useCallback(
    (field: keyof CharacterSettingsDraft, value: string | number) => {
      characterSettingsActions.setCharacterSettingsDraft({
        ...characterSettingsDraft,
        [field]:
          typeof value === 'number'
            ? Number.isFinite(value)
              ? value
              : characterSettingsDraft[field]
            : value,
      })
    },
    [characterSettingsDraft, characterSettingsActions]
  )

  useEffect(() => {
    void loadUserCharacters()
  }, [loadUserCharacters])

  useEffect(() => {
    if (!selectedCampaignId || !currentSession?.id) {
      return
    }

    void loadDmVoiceTargetingSetting(selectedCampaignId)
  }, [currentSession?.id, loadDmVoiceTargetingSetting, selectedCampaignId])

  const loadCampaignSettingsSessionContext = useCallback(
    async (campaignId: UUID, authoritativeLatestSessionId: UUID | '' = '') => {
      try {
        const sessions = await campaignSettingsController.fetchCampaignSessions(campaignId)
        campaignSettingsActions.setSettingsCampaignSessions(sessions)

        if (
          authoritativeLatestSessionId &&
          sessions.some((session) => session.id === authoritativeLatestSessionId)
        ) {
          campaignSettingsActions.setSettingsReferenceSessionId(authoritativeLatestSessionId)
          return
        }

        const latestSession = getLatestSessionChronologically(sessions)
        campaignSettingsActions.setSettingsReferenceSessionId(latestSession?.id || '')
      } catch {
        campaignSettingsActions.setSettingsCampaignSessions([])
        if (!authoritativeLatestSessionId) {
          campaignSettingsActions.setSettingsReferenceSessionId('')
        }
      }
    },
    [campaignSettingsController, campaignSettingsActions]
  )

  const openCampaignSettingsModal = useCallback(
    (campaignId: UUID) => {
      campaignSettingsActions.setSettingsCampaignId(campaignId)
      campaignSettingsActions.setSettingsHomeTab('home')
      setShowCampaignSettingsModal(true)

      void (async () => {
        const settingsPayload = await loadCampaignSettings(campaignId)
        const authoritativeLatestSessionId = (settingsPayload?.latestSessionId || '') as UUID | ''
        await loadCampaignSettingsSessionContext(campaignId, authoritativeLatestSessionId)
      })()
    },
    [loadCampaignSettings, loadCampaignSettingsSessionContext, campaignSettingsActions]
  )

  const ensureSessionMembership = useCallback(
    async (sessionId: UUID) => {
      await sessionMembershipController.ensureSessionMembership(sessionId)
    },
    [sessionMembershipController]
  )

  const handleToggleBroadcastMode = useCallback(
    async (enabled: boolean) => {
      if (!currentSession || currentSession.dmId !== user.id) {
        return
      }

      const response = await fetchWithAuthGuard(`${apiUrl}/api/audio/broadcast/state`, {
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
        throw new Error(payload.message || 'Failed to update broadcast voice state')
      }

      const payload = (await response.json().catch(() => ({}))) as {
        broadcast?: ApiBroadcastState
        voiceOfGod?: ApiBroadcastState
      }

      const broadcastState = payload.broadcast || payload.voiceOfGod

      if (broadcastState) {
        setBroadcastState({
          enabled: Boolean(broadcastState.enabled),
          broadcastRoomId: broadcastState.broadcastRoomId,
          dmId: broadcastState.dmId,
          changedAt: broadcastState.changedAt,
        })
      } else {
        setBroadcastState({ enabled })
      }
    },
    [apiUrl, currentSession, fetchWithAuthGuard, setBroadcastState, token, user.id]
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
        const response = await fetchWithAuthGuard(`${apiUrl}/api/campaigns`, {
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
        const pendingCampaignId = sessionStorage.getItem(LOBBY_CAMPAIGN_FOCUS_STORAGE_KEY)
        const pendingNotice = sessionStorage.getItem(LOBBY_NOTICE_STORAGE_KEY)
        setCampaigns(nextCampaigns)

        if (pendingNotice) {
          setLobbyNotice(pendingNotice)
          sessionStorage.removeItem(LOBBY_NOTICE_STORAGE_KEY)
        }

        if (nextCampaigns.length > 0) {
          const pendingCampaign = pendingCampaignId
            ? nextCampaigns.find((campaign) => campaign.id === pendingCampaignId)
            : null

          if (pendingCampaign) {
            setSelectedCampaignId(pendingCampaign.id)
          } else {
            setSelectedCampaignId((prev) => prev || (nextCampaigns[0].id as UUID))
          }
        } else {
          setSelectedCampaignId('')
          clearSessions()
        }

        sessionStorage.removeItem(LOBBY_CAMPAIGN_FOCUS_STORAGE_KEY)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An error occurred'
        setError(message)
      } finally {
        setIsLoadingCampaigns(false)
      }
    }

    void loadCampaigns()
  }, [apiUrl, clearSessions, fetchWithAuthGuard, token])

  useEffect(() => {
    const loadCampaignSessions = async () => {
      if (!selectedCampaignId) {
        clearSessions()
        return
      }

      setError(null)

      try {
        const nextSessions = await fetchCampaignSessionsData(selectedCampaignId)
        replaceSessions(nextSessions)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An error occurred'
        setError(message)
      }
    }

    void loadCampaignSessions()
  }, [selectedCampaignId, clearSessions, replaceSessions, fetchCampaignSessionsData])

  useEffect(() => {
    if (!showCampaignSettingsModal || !settingsReferenceSessionId) {
      campaignSettingsActions.setIsSettingsReferenceNotesLoading(false)
      campaignSettingsActions.setSettingsReferenceNotesError(null)
      return
    }

    let cancelled = false

    const loadSettingsReferenceNotes = async () => {
      campaignSettingsActions.setIsSettingsReferenceNotesLoading(true)
      campaignSettingsActions.setSettingsReferenceNotesError(null)

      try {
        const fetchedEntries: Note[] = await fetchSessionNotesOnce(
          apiUrl,
          settingsReferenceSessionId,
          token
        )

        if (!cancelled) {
          for (const entry of fetchedEntries) {
            addNote(settingsReferenceSessionId as UUID, entry)
          }
        }
      } catch (err) {
        if (!cancelled) {
          campaignSettingsActions.setSettingsReferenceNotesError(
            err instanceof Error ? err.message : 'Failed to load session notes'
          )
        }
      } finally {
        if (!cancelled) {
          campaignSettingsActions.setIsSettingsReferenceNotesLoading(false)
        }
      }
    }

    void loadSettingsReferenceNotes()

    return () => {
      cancelled = true
    }
  }, [
    addNote,
    apiUrl,
    fetchWithAuthGuard,
    settingsReferenceSessionId,
    showCampaignSettingsModal,
    token,
    campaignSettingsActions,
  ])

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
  }, [wsState, currentSession?.id, wsTelemetryPrevRef])

  useEffect(() => {
    const prev = prevWsStateRef.current
    prevWsStateRef.current = wsState

    if (!currentSession) {
      lastHydratedSessionFingerprintRef.current = null
      return
    }

    const sessionFingerprint = `${currentSession.id}:${currentSession.state}`
    const sessionChanged = lastHydratedSessionFingerprintRef.current !== sessionFingerprint
    const isReconnect = wsState === 'connected' && prev !== 'connected'

    if (!sessionChanged && !isReconnect) {
      return
    }

    lastHydratedSessionFingerprintRef.current = sessionFingerprint

    const loadPresenceAndRooms = async () => {
      try {
        const [roomsResponse, presenceResponse, audioStateResponse] = await Promise.all([
          fetchWithAuthGuard(`${apiUrl}/api/rooms/session/${currentSession.id}`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }),
          fetchWithAuthGuard(`${apiUrl}/api/presence/${currentSession.id}`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }),
          fetchWithAuthGuard(`${apiUrl}/api/audio/sessions/${currentSession.id}/state`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }),
        ])

        if (!roomsResponse.ok || !presenceResponse.ok || !audioStateResponse.ok) {
          return
        }

        const roomsPayload = (await roomsResponse.json()) as { rooms?: ApiRoom[] }
        const presencePayload = (await presenceResponse.json()) as {
          presence?: ApiPresence[]
          stats?: ApiSessionStats
          identity?: ApiTakeoverIdentitySnapshot
        }
        const audioStatePayload = (await audioStateResponse.json()) as {
          environment?: {
            id: UUID
            name: string
            reverbSend?: number
            lowpassFreq?: number
            roomGain?: number
          } | null
          environments?: ApiAudioEnvironmentState[]
          dmOverrides?: Array<{
            userId: UUID
            overrideType:
              | 'MUTE'
              | 'UNMUTE'
              | 'GAIN'
              | 'GATE'
              | 'FILTER'
              | 'CONDITION'
              | 'VOICE_OF_GOD'
            parameters?: Record<string, unknown>
            appliedAt: number
          }>
          broadcast?: ApiBroadcastState
          voiceOfGod?: ApiBroadcastState
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
          role: entry.role,
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

        setSelectedRoomIdOverride('')

        // Atomic: both rooms and presence replace in a single store update.
        replaceSessionTopology(currentSession.id, nextRooms, nextPresence)
        if (presencePayload.stats) {
          replaceSessionStatsSnapshot(currentSession.id, presencePayload.stats)
        }

        if (import.meta.env.DEV) {
          const identity = presencePayload.identity
          setMockTakeoverUserId(
            currentSession.id,
            identity?.active ? identity.assumedUserId || null : null
          )
        }

        // On session enter/reconnect, recover persisted backend-authored session markers
        // before the rest of the session hydration completes.
        await restoreSessionBookendsFromHistory(currentSession.id, nextRooms)

        // Clear any stale per-session audio state before re-hydrating from server.
        // This prevents residual effects from a previous session bleeding through.
        resetSessionAudioState()
        clearActiveEffects()

        // Rehydrate audio environment preset from server state.
        const recoveredEnv = audioStatePayload.environment
        if (recoveredEnv) {
          setEnvironment({
            id: recoveredEnv.id,
            name: recoveredEnv.name,
            reverbSend: recoveredEnv.reverbSend ?? 0.3,
            lowpassFreq: recoveredEnv.lowpassFreq ?? 8000,
            roomGain: recoveredEnv.roomGain ?? 0,
          })
        }

        const nextEnvironmentNames: Record<UUID, string> = {}
        for (const environmentState of audioStatePayload.environments || []) {
          if (!nextEnvironmentNames[environmentState.roomId]) {
            nextEnvironmentNames[environmentState.roomId] = environmentState.environmentName
          }
        }
        replaceRoomEnvironmentNames(nextEnvironmentNames)

        // Rehydrate DM overrides from server state (replaces any stale local copy).
        const recoveredOverrides = audioStatePayload.dmOverrides
        if (recoveredOverrides && recoveredOverrides.length > 0) {
          replaceDMOverrides(recoveredOverrides)
        }

        const broadcastState = audioStatePayload.broadcast || audioStatePayload.voiceOfGod

        if (broadcastState) {
          setBroadcastState({
            enabled: Boolean(broadcastState.enabled),
            broadcastRoomId: broadcastState.broadcastRoomId,
            dmId: broadcastState.dmId,
            changedAt: broadcastState.changedAt,
          })
        }

        // Fire-and-forget: trigger server-side presence snapshot recovery.
        // Result is informational only; WS events remain authoritative.
        fetchWithAuthGuard(`${apiUrl}/api/presence/${currentSession.id}/recover`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {
          // Non-critical: snapshot recovery failure doesn't block UI.
        })
      } catch {
        // Event-driven WebSocket updates continue to flow even if hydration fails.
      }
    }

    void loadPresenceAndRooms()
  }, [
    apiUrl,
    currentSession,
    fetchWithAuthGuard,
    setSelectedRoomIdOverride,
    token,
    wsState,
    replaceSessionTopology,
    replaceSessionStatsSnapshot,
    setMockTakeoverUserId,
    restoreSessionBookendsFromHistory,
    setBroadcastState,
    setEnvironment,
    replaceRoomEnvironmentNames,
    replaceDMOverrides,
    resetSessionAudioState,
    clearActiveEffects,
    lastHydratedSessionFingerprintRef,
    prevWsStateRef,
  ])

  useEffect(() => {
    if (!selectedCampaignId || !currentSession) {
      if (greenroomCleanupTimerRef.current !== null) {
        window.clearTimeout(greenroomCleanupTimerRef.current)
        greenroomCleanupTimerRef.current = null
      }
      return
    }

    const connectedCount =
      currentSessionStats?.connectedTotal ??
      currentPresence.filter((presence) => presence.state !== PresenceState.OFFLINE).length

    if (!isGreenroom || connectedCount > 0) {
      if (greenroomCleanupTimerRef.current !== null) {
        window.clearTimeout(greenroomCleanupTimerRef.current)
        greenroomCleanupTimerRef.current = null
      }
      return
    }

    const ttlMs = resolveGreenroomCacheTtlMs()
    if (ttlMs <= 0) {
      return
    }

    if (greenroomCleanupTimerRef.current !== null) {
      window.clearTimeout(greenroomCleanupTimerRef.current)
    }

    greenroomCleanupTimerRef.current = window.setTimeout(() => {
      for (const session of sessionList) {
        const sessionRooms = Object.values(typedRoomsBySession[session.id] || {})
        const greenRoom = sessionRooms.find((room) => isGreenRoom(room))

        if (!greenRoom) {
          continue
        }

        clearRoomMessages(session.id, greenRoom.id)
      }
      greenroomCleanupTimerRef.current = null
    }, ttlMs)

    return () => {
      if (greenroomCleanupTimerRef.current !== null) {
        window.clearTimeout(greenroomCleanupTimerRef.current)
        greenroomCleanupTimerRef.current = null
      }
    }
  }, [
    clearRoomMessages,
    currentPresence,
    currentSessionStats,
    currentSession,
    isGreenroom,
    selectedCampaignId,
    sessionList,
    typedRoomsBySession,
  ])

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLobbyNotice(null)

    if (user.authType === 'GUEST') {
      setError('Upgrade to a full account before creating a new campaign.')
      return
    }

    setIsCreatingCampaign(true)

    try {
      const response = await fetchWithAuthGuard(`${apiUrl}/api/campaigns`, {
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
      setLobbyNotice(
        'Campaign created. Review the new card, then continue to launch when you are ready.'
      )
      setShowCreateCampaignModal(false)
      openCampaignSettingsModal(campaign.id)
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
    setLobbyNotice(null)
    setIsJoiningCampaign(true)

    try {
      const inviteCode = parsePlayerInviteCode(joinInviteInput)
      if (!inviteCode) {
        throw new Error('Invite code or join link is required')
      }

      const validateResponse = await fetchWithAuthGuard(
        `${apiUrl}/api/campaigns/invite/${encodeURIComponent(inviteCode)}/validate`
      )

      if (!validateResponse.ok) {
        const validateErrorData = await validateResponse.json().catch(() => ({}))
        throw new Error(validateErrorData.message || 'Invalid or expired invite code')
      }

      const validateData = (await validateResponse.json()) as {
        valid?: boolean
        campaign?: { id?: UUID }
      }

      const campaignId = validateData.campaign?.id
      if (!validateData.valid || !campaignId) {
        throw new Error('Invalid or expired invite code')
      }

      const response = await fetchWithAuthGuard(`${apiUrl}/api/campaigns/${campaignId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ inviteCode }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to join campaign')
      }

      const campaignsResponse = await fetchWithAuthGuard(`${apiUrl}/api/campaigns`, {
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
      setSelectedCampaignId(campaignId as UUID)
      setLobbyNotice('Campaign ready in your lobby. Continue when you are ready.')
      setShowJoinCampaignModal(false)
      setJoinInviteInput('')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred'
      setError(message)
    } finally {
      setIsJoiningCampaign(false)
    }
  }

  const handleEnterCampaign = useCallback(
    async (campaignId?: UUID, preferredSessionId?: UUID) => {
      setError(null)
      setLobbyNotice(null)

      const targetCampaignId = campaignId || selectedCampaignId

      if (!targetCampaignId) {
        setError('Select a campaign before entering')
        return
      }

      if (targetCampaignId !== selectedCampaignId) {
        setSelectedCampaignId(targetCampaignId)
      }

      const targetCampaign = campaigns.find((campaign) => campaign.id === targetCampaignId)

      if (targetCampaign?.memberRole === 'SPECTATOR') {
        const state = getCampaignDisplayState(targetCampaign)
        if (state !== 'ACTIVE') {
          setError('Spectators can only watch active campaigns.')
          return
        }

        const hasTableOnline =
          Boolean(targetCampaign.dmOnline) || (targetCampaign.connectedPlayers || 0) > 0
        if (!hasTableOnline) {
          setError('Campaign is active but no DM/player is online yet. Please wait.')
          return
        }
      }

      let targetSessions: SessionRecord[] = []

      try {
        targetSessions = await fetchCampaignSessionsData(targetCampaignId)
        replaceSessions(targetSessions)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load campaign sessions'
        setError(message)
        return
      }

      const preferredSession =
        (preferredSessionId
          ? targetSessions.find((session) => session.id === preferredSessionId) || null
          : null) || getPreferredSession(targetSessions)

      if (preferredSession) {
        await ensureSessionMembership(preferredSession.id)
        setCurrentSession(preferredSession.id)
        return
      }

      const canStartAsDm = targetCampaign?.currentDmId === user.id

      if (!canStartAsDm) {
        setError('No campaign chapter is available yet. Wait for the DM to start the session.')
        return
      }

      try {
        const response = await fetchWithAuthGuard(
          `${apiUrl}/api/campaigns/${targetCampaignId}/sessions/start`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              name: buildDefaultChapterName(targetSessions),
            }),
          }
        )

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.message || 'Failed to start campaign chapter')
        }

        const payload = (await response.json()) as { session: SessionRecord }
        await ensureSessionMembership(payload.session.id)
        replaceSessions([normalizeSessionRecord(payload.session), ...targetSessions])
        setCurrentSession(payload.session.id)
        onSessionCreated?.(payload.session.id)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An error occurred'
        setError(message)
      }
    },
    [
      selectedCampaignId,
      campaigns,
      ensureSessionMembership,
      fetchCampaignSessionsData,
      fetchWithAuthGuard,
      replaceSessions,
      user.id,
      apiUrl,
      token,
      setCurrentSession,
      onSessionCreated,
    ]
  )

  useEffect(() => {
    if (isLoadingCampaigns || currentSessionId || lobbyAutoEnterTriggeredRef.current) {
      return
    }

    setIsCampaignRestorePending(true)

    const pendingAutoEnterCampaignId = sessionStorage.getItem(LOBBY_AUTO_ENTER_CAMPAIGN_STORAGE_KEY)
    const rawActiveSessionContext =
      sessionStorage.getItem(ACTIVE_SESSION_CONTEXT_STORAGE_KEY) ||
      safeLocalStorageGetItem(ACTIVE_SESSION_CONTEXT_STORAGE_KEY)

    let activeSessionContext: ActiveSessionContext | null = null
    if (rawActiveSessionContext) {
      try {
        const parsed = JSON.parse(rawActiveSessionContext) as Partial<ActiveSessionContext>
        if (parsed.campaignId && parsed.sessionId) {
          activeSessionContext = {
            campaignId: parsed.campaignId,
            sessionId: parsed.sessionId,
          }

          // Keep session storage warm after hard refresh if local storage carried context.
          sessionStorage.setItem(ACTIVE_SESSION_CONTEXT_STORAGE_KEY, rawActiveSessionContext)
        }
      } catch {
        clearPersistedActiveSessionContext()
      }
    }

    const restoreCampaignId =
      activeSessionContext?.campaignId || (pendingAutoEnterCampaignId as UUID | null)
    if (!restoreCampaignId) {
      setIsCampaignRestorePending(false)
      return
    }

    const pendingCampaign = campaigns.find((campaign) => campaign.id === restoreCampaignId)

    sessionStorage.removeItem(LOBBY_AUTO_ENTER_CAMPAIGN_STORAGE_KEY)

    if (!pendingCampaign) {
      clearPersistedActiveSessionContext()
      setIsCampaignRestorePending(false)
      return
    }

    lobbyAutoEnterTriggeredRef.current = true
    void (async () => {
      try {
        await handleEnterCampaign(pendingCampaign.id, activeSessionContext?.sessionId)
      } finally {
        setIsCampaignRestorePending(false)
      }
    })()
  }, [
    campaigns,
    clearPersistedActiveSessionContext,
    currentSessionId,
    handleEnterCampaign,
    isLoadingCampaigns,
  ])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    if (!currentSession || !selectedCampaignId) {
      return
    }

    const context: ActiveSessionContext = {
      campaignId: selectedCampaignId,
      sessionId: currentSession.id,
    }

    const serializedContext = JSON.stringify(context)
    window.sessionStorage.setItem(ACTIVE_SESSION_CONTEXT_STORAGE_KEY, serializedContext)
    safeLocalStorageSetItem(ACTIVE_SESSION_CONTEXT_STORAGE_KEY, serializedContext)
  }, [currentSession, selectedCampaignId])

  const handleSaveCampaignSettings = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!settingsCampaignId) {
      return
    }

    setError(null)
    campaignSettingsActions.setIsSettingsSaving(true)

    const normalizedPayload = {
      name: settingsName,
      description: settingsDescription,
      posterUrl: settingsPosterUrl.trim().length > 0 ? settingsPosterUrl.trim() : null,
      discoverable: settingsVisibility === 'PUBLIC',
      spectatorsEnabled: settingsSpectatorsEnabled,
      spectatorMax: settingsSpectatorsEnabled ? settingsSpectatorMax : null,
      spectatorWaitlistEnabled: settingsSpectatorsEnabled
        ? settingsSpectatorWaitlistEnabled
        : false,
      spectatorReconnectGraceSecs: settingsSpectatorsEnabled
        ? settingsSpectatorReconnectGraceSecs
        : 60,
      extensionSyncPolicy: settingsExtensionSyncPolicy,
      postSessionChatEnabled: Boolean(settingsPostSessionChatEnabled),
      postSessionChatDurationMs:
        toValidPostSessionDurationMinutes(settingsPostSessionChatDurationMinutes) * 60_000,
      dmAutoTargetOnFirstPlayerJoin: settingsDmAutoTargetOnFirstPlayerJoin,
      lateJoinPolicy: settingsLateJoinPolicy,
      lateJoinGraceMinutes: settingsLateJoinPolicy === 'OPEN' ? 30 : settingsLateJoinGraceMinutes,
    }

    try {
      const response = await fetchWithAuthGuard(
        `${apiUrl}/api/campaigns/${settingsCampaignId}/settings`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(normalizedPayload),
        }
      )

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.message || 'Failed to save campaign settings')
      }

      const payload = (await response.json()) as { campaign: CampaignSettingsPayload }
      campaignSettingsActions.setSettingsData(payload.campaign)
      campaignSettingsActions.setSettingsName(payload.campaign.name)
      campaignSettingsActions.setSettingsDescription(payload.campaign.description || '')
      campaignSettingsActions.setSettingsVisibility(
        payload.campaign.discoverable ? 'PUBLIC' : 'PRIVATE'
      )
      campaignSettingsActions.setSettingsSpectatorsEnabled(
        payload.campaign.spectatorPolicy !== 'NONE'
      )
      campaignSettingsActions.setSettingsSpectatorMax(payload.campaign.spectatorMax ?? 10)
      campaignSettingsActions.setSettingsSpectatorWaitlistEnabled(
        payload.campaign.spectatorWaitlistEnabled
      )
      campaignSettingsActions.setSettingsSpectatorReconnectGraceSecs(
        payload.campaign.spectatorReconnectGraceSecs
      )
      campaignSettingsActions.setSettingsExtensionSyncPolicy(
        payload.campaign.extensionSyncPolicy === 'DM_AND_PLAYERS'
          ? 'ALLOW'
          : payload.campaign.extensionSyncPolicy
      )
      campaignSettingsActions.setSettingsPostSessionChatEnabled(
        payload.campaign.postSessionChatEnabled
      )
      campaignSettingsActions.setSettingsPostSessionChatDurationMinutes(
        toValidPostSessionDurationMinutes(payload.campaign.postSessionChatDurationMs / 60000)
      )
      campaignSettingsActions.setSettingsDmAutoTargetOnFirstPlayerJoin(
        payload.campaign.dmAutoTargetOnFirstPlayerJoin ?? true
      )
      campaignSettingsActions.setSettingsLateJoinPolicy(payload.campaign.lateJoinPolicy)
      campaignSettingsActions.setSettingsLateJoinGraceMinutes(payload.campaign.lateJoinGraceMinutes)
      campaignSettingsActions.setSettingsPosterUrl(payload.campaign.posterUrl || '')

      setCampaigns((prev) =>
        prev.map((campaign) =>
          campaign.id === payload.campaign.id
            ? {
                ...campaign,
                name: payload.campaign.name,
                description: payload.campaign.description,
                posterUrl: payload.campaign.posterUrl,
                extensionSyncPolicy: payload.campaign.extensionSyncPolicy,
              }
            : campaign
        )
      )

      setLobbyNotice('Campaign settings saved.')
      setShowCampaignSettingsModal(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save campaign settings'
      setError(message)
    } finally {
      campaignSettingsActions.setIsSettingsSaving(false)
    }
  }

  const handleSaveCampaignInfoPanel = useCallback(
    async (
      campaignId: UUID,
      updates: {
        name: string
        description: string
        posterUrl: string | null
        integrationSyncPolicy: 'ALLOW' | 'DM_ONLY' | 'NONE'
      }
    ) => {
      setError(null)

      const response = await fetchWithAuthGuard(`${apiUrl}/api/campaigns/${campaignId}/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: updates.name,
          description: updates.description,
          posterUrl: updates.posterUrl,
          extensionSyncPolicy: updates.integrationSyncPolicy,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.message || 'Failed to save campaign info')
      }

      const payload = (await response.json()) as { campaign: CampaignSettingsPayload }

      setCampaigns((prev) =>
        prev.map((campaign) =>
          campaign.id === payload.campaign.id
            ? {
                ...campaign,
                name: payload.campaign.name,
                description: payload.campaign.description,
                posterUrl: payload.campaign.posterUrl,
                extensionSyncPolicy: payload.campaign.extensionSyncPolicy,
              }
            : campaign
        )
      )

      if (settingsData?.id === payload.campaign.id) {
        campaignSettingsActions.setSettingsData(payload.campaign)
        campaignSettingsActions.setSettingsName(payload.campaign.name)
        campaignSettingsActions.setSettingsDescription(payload.campaign.description || '')
        campaignSettingsActions.setSettingsPosterUrl(payload.campaign.posterUrl || '')
        campaignSettingsActions.setSettingsExtensionSyncPolicy(
          payload.campaign.extensionSyncPolicy === 'DM_AND_PLAYERS'
            ? 'ALLOW'
            : payload.campaign.extensionSyncPolicy
        )
      }

      setLobbyNotice('Campaign information saved.')
    },
    [apiUrl, fetchWithAuthGuard, settingsData?.id, token, campaignSettingsActions]
  )

  const handlePosterFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    if (!file.type.startsWith('image/')) {
      setError('Poster must be an image file.')
      return
    }

    const objectUrl = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      try {
        const naturalWidth = Math.max(1, img.naturalWidth)
        const naturalHeight = Math.max(1, img.naturalHeight)
        const scale = naturalWidth > MAX_POSTER_WIDTH_PX ? MAX_POSTER_WIDTH_PX / naturalWidth : 1
        const targetWidth = Math.max(1, Math.round(naturalWidth * scale))
        const targetHeight = Math.max(1, Math.round(naturalHeight * scale))

        const canvas = document.createElement('canvas')
        canvas.width = targetWidth
        canvas.height = targetHeight

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          setError('Unable to process poster image.')
          return
        }

        ctx.drawImage(img, 0, 0, targetWidth, targetHeight)

        // Store as JPEG and lower quality when needed to stay within localStorage limits.
        let quality = 0.86
        let dataUrl = canvas.toDataURL('image/jpeg', quality)
        while (dataUrl.length > MAX_POSTER_DATA_URL_CHARS && quality > 0.56) {
          quality -= 0.1
          dataUrl = canvas.toDataURL('image/jpeg', quality)
        }
        campaignSettingsActions.setSettingsPosterUrl(dataUrl)
      } finally {
        URL.revokeObjectURL(objectUrl)
      }
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      setError('Unable to read poster image.')
    }

    img.src = objectUrl
  }

  const copyInviteUrl = async (inviteType: 'PLAYER' | 'SPECTATOR') => {
    if (!settingsData) {
      return
    }

    const code =
      inviteType === 'PLAYER' ? settingsData.inviteCode : settingsData.spectatorInviteCode
    if (!code) {
      setError('Invite code is not available yet.')
      return
    }

    const basePath = inviteType === 'PLAYER' ? '/join/' : '/watch/'
    const inviteUrl = `${window.location.origin}${basePath}${encodeURIComponent(code)}`

    try {
      await navigator.clipboard.writeText(inviteUrl)
      setLobbyNotice(`${inviteType === 'PLAYER' ? 'Player' : 'Spectator'} invite URL copied.`)
    } catch {
      setError('Failed to copy invite URL to clipboard.')
    }
  }

  const reissueInvite = async (inviteType: 'PLAYER' | 'SPECTATOR') => {
    if (!settingsCampaignId) {
      return
    }

    const confirmed = window.confirm(
      `Refresh ${inviteType.toLowerCase()} invite? Existing links will stop working for new joins.`
    )
    if (!confirmed) {
      return
    }

    setError(null)
    campaignSettingsActions.setIsInviteReissuing(true)

    try {
      const response = await fetchWithAuthGuard(
        `${apiUrl}/api/campaigns/${settingsCampaignId}/invites/reissue`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ type: inviteType }),
        }
      )

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.message || 'Failed to refresh invite')
      }

      await loadCampaignSettings(settingsCampaignId)
      setLobbyNotice(`${inviteType === 'PLAYER' ? 'Player' : 'Spectator'} invite refreshed.`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh invite'
      setError(message)
    } finally {
      campaignSettingsActions.setIsInviteReissuing(false)
    }
  }

  const handleToggleTheme = () => {
    const nextTheme: FrontendThemeMode = themeMode === 'dark' ? 'light' : 'dark'
    document.documentElement.classList.remove(
      FRONTEND_THEME_CLASSES.light,
      FRONTEND_THEME_CLASSES.dark
    )
    document.documentElement.classList.add(FRONTEND_THEME_CLASSES[nextTheme])
    safeLocalStorageSetItem('vtt-theme-mode', nextTheme)
    setThemeMode(nextTheme)
  }

  const handleLogoff = () => {
    if (currentSession && currentSession.dmId !== user.id) {
      void fetchWithAuthGuard(`${apiUrl}/api/session/${currentSession.id}/members/leave`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
    }

    sessionStorage.removeItem('authToken')
    sessionStorage.removeItem('user')
    window.location.assign('/')
  }

  const startCampaignSession = useCallback(
    async (
      campaignId: UUID,
      existingSessions: SessionRecord[],
      options?: { autoActivate?: boolean; carryFromSessionId?: UUID }
    ): Promise<UUID | null> => {
      try {
        const response = await fetchWithAuthGuard(
          `${apiUrl}/api/campaigns/${campaignId}/sessions/start`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              name: buildDefaultChapterName(existingSessions),
            }),
          }
        )

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.message || 'Failed to start campaign chapter')
        }

        const payload = (await response.json()) as { session: SessionRecord }
        await ensureSessionMembership(payload.session.id)
        replaceSessions([normalizeSessionRecord(payload.session), ...existingSessions])
        if (options?.carryFromSessionId) {
          scheduleGreenroomCarry(options.carryFromSessionId, payload.session.id)
        }
        setCurrentSession(payload.session.id)
        onSessionCreated?.(payload.session.id)

        if (options?.autoActivate) {
          const transitionResponse = await fetchWithAuthGuard(
            `${apiUrl}/api/session/${payload.session.id}/state`,
            {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ state: SessionState.ACTIVE }),
            }
          )

          if (!transitionResponse.ok) {
            const errorData = await transitionResponse.json().catch(() => ({}))
            throw new Error(errorData.message || 'Failed to activate new session')
          }

          const activeSession = await transitionResponse.json()
          updateSession(payload.session.id, normalizeSessionRecord(activeSession as SessionRecord))
        }

        return payload.session.id
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An error occurred'
        setError(message)
        return null
      }
    },
    [
      apiUrl,
      ensureSessionMembership,
      fetchWithAuthGuard,
      onSessionCreated,
      replaceSessions,
      scheduleGreenroomCarry,
      setCurrentSession,
      token,
      updateSession,
    ]
  )

  const handleStartSession = async (sessionId: UUID) => {
    if (currentSession?.id === sessionId && currentSession.state === SessionState.ENDED) {
      if (!selectedCampaignId) {
        setError('Select a campaign before starting a new session.')
        return
      }

      await startCampaignSession(selectedCampaignId, sessionList, {
        autoActivate: true,
        carryFromSessionId: sessionId,
      })
      return
    }

    await handleTransitionSession(sessionId, SessionState.ACTIVE)
  }

  const handlePauseSession = async (sessionId: UUID) => {
    const nextState =
      currentSession?.id === sessionId && currentSession.state === SessionState.PAUSED
        ? SessionState.ACTIVE
        : SessionState.PAUSED

    await handleTransitionSession(sessionId, nextState)
  }

  const handleStopSession = async (sessionId: UUID) => {
    setShowStopSessionModal(true)
  }

  const handleCancelCooldown = async (sessionId: UUID) => {
    setError(null)

    try {
      const response = await fetchWithAuthGuard(`${apiUrl}/api/session/${sessionId}/cooldown/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      })

      const payload = (await response.json().catch(() => ({}))) as {
        message?: string
        session?: SessionRecord
      }

      if (!response.ok) {
        throw new Error(payload.message || 'Failed to end cooldown')
      }

      if (payload.session) {
        updateSession(sessionId, normalizeSessionRecord(payload.session))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to end cooldown')
    }
  }

  const handleExtendCooldown = useCallback(
    async (sessionId: UUID, cooldownBlockMs: number) => {
      if (!Number.isFinite(cooldownBlockMs) || cooldownBlockMs <= 0) {
        return
      }

      setError(null)

      try {
        const response = await fetchWithAuthGuard(
          `${apiUrl}/api/session/${sessionId}/cooldown/extend`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ extensionMs: cooldownBlockMs }),
          }
        )

        const payload = (await response.json().catch(() => ({}))) as {
          message?: string
          session?: SessionRecord
        }

        if (!response.ok) {
          throw new Error(payload.message || 'Failed to extend cooldown')
        }

        if (payload.session) {
          updateSession(sessionId, normalizeSessionRecord(payload.session))
        }
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Failed to extend cooldown')
      }
    },
    [apiUrl, fetchWithAuthGuard, token, updateSession]
  )

  const handleConfirmStopSession = async () => {
    if (!currentSession) {
      setShowStopSessionModal(false)
      return
    }

    setShowStopSessionModal(false)
    await handleTransitionSession(currentSession.id, SessionState.ENDED)
  }

  useEffect(() => {
    if (!showStopSessionModal) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowStopSessionModal(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [showStopSessionModal])

  const handleTransitionSession = async (sessionId: UUID, state: SessionState) => {
    setError(null)

    try {
      const response = await fetchWithAuthGuard(`${apiUrl}/api/session/${sessionId}/state`, {
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

      const updatedSession = normalizeSessionRecord((await response.json()) as SessionRecord)
      const transitionTimestamp = Date.now()
      const localTransitionFallbacks: Partial<SessionRecord> =
        state === SessionState.PAUSED
          ? {
              pausedAt: updatedSession.pausedAt ?? transitionTimestamp,
            }
          : state === SessionState.ACTIVE
            ? {
                startedAt:
                  updatedSession.startedAt ?? currentSession?.startedAt ?? transitionTimestamp,
                pausedAt: undefined,
              }
            : state === SessionState.ENDED
              ? {
                  endedAt: updatedSession.endedAt ?? transitionTimestamp,
                }
              : {}

      updateSession(sessionId, {
        ...updatedSession,
        ...localTransitionFallbacks,
      })
      if (isGreenroomSessionState(state)) {
        setSelectedRoomIdOverride('')
        resetToolbarActionsState()
      }

      setIsGreenroom(isGreenroomSessionState(state))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred'
      setError(message)
    }
  }

  const returnToCampaignSelector = async () => {
    if (currentSession && currentSession.dmId !== user.id) {
      try {
        await fetchWithAuthGuard(`${apiUrl}/api/session/${currentSession.id}/members/leave`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
      } catch {
        // Best effort: UI still returns to lobby even if leave call fails.
      }
    }

    setCurrentSession(null)
    setSelectedRoomIdOverride('')
    clearPersistedActiveSessionContext()
  }

  const logoutToAuthScreen = () => {
    forceLogoutToAuthScreen()
  }

  const handleExitToCampaignSelector = () => {
    setExitUpgradeError(null)
    setExitUpgradePassword('')
    setShowExitSessionModal(true)
  }

  const handleConfirmExitAsFullAccount = async () => {
    setShowExitSessionModal(false)
    await returnToCampaignSelector()
  }

  const handleSkipGuestUpgrade = () => {
    setShowExitSessionModal(false)
    logoutToAuthScreen()
  }

  const handleUpgradeAndExit = async () => {
    if (!exitUpgradePassword.trim()) {
      setExitUpgradeError('Password is required to upgrade before exit.')
      return
    }

    setExitUpgradeError(null)
    setExitUpgradeLoading(true)

    try {
      const response = await fetchWithAuthGuard(`${apiUrl}/api/auth/upgrade`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password: exitUpgradePassword }),
      })

      const data = (await response.json().catch(() => ({}))) as {
        message?: string
      }

      if (!response.ok) {
        throw new Error(data.message || 'Failed to upgrade account')
      }

      setShowExitSessionModal(false)
      logoutToAuthScreen()
    } catch (upgradeError) {
      const message =
        upgradeError instanceof Error ? upgradeError.message : 'Failed to upgrade account'
      setExitUpgradeError(message)
    } finally {
      setExitUpgradeLoading(false)
    }
  }

  const hasSessionSelected = currentSession !== null

  const connectionStatus = useConnectionStatus({
    wsState,
    sessionId: currentSession?.id ?? null,
    roomId: selectedRoomId || null,
  })
  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId)
  const settingsReferenceSession = settingsCampaignSessions.find(
    (session) => session.id === settingsReferenceSessionId
  )
  const settingsReferenceNotes = useMemo(
    () =>
      settingsReferenceSessionId
        ? Object.values(typedNotesBySession[settingsReferenceSessionId as UUID] || {})
        : [],
    [settingsReferenceSessionId, typedNotesBySession]
  )
  const settingsReferenceSummaryEntry = useMemo(
    () =>
      [...settingsReferenceNotes]
        .filter((note) => note.tags.includes(SESSION_SUMMARY_TAG))
        .sort(
          (left, right) => (right.updatedAt || right.createdAt) - (left.updatedAt || left.createdAt)
        )[0] ?? null,
    [settingsReferenceNotes]
  )
  const settingsReferenceSummaryExcerpt =
    settingsReferenceSummaryEntry?.title === SESSION_SUMMARY_TITLE
      ? 'Not provided'
      : settingsReferenceSummaryEntry?.title || 'Not provided'
  const settingsCampaignTotalDurationMs = useMemo(
    () =>
      settingsCampaignSessions.reduce((total, session) => {
        if (!session.startedAt || !session.endedAt) {
          return total
        }

        return total + Math.max(0, session.endedAt - session.startedAt)
      }, 0),
    [settingsCampaignSessions]
  )
  const connectedSpectatorsCount =
    currentSessionStats?.connectedSpectators ?? selectedCampaign?.connectedSpectatorsRounded ?? 0
  const liveConnectedPresenceCount = currentPresence.filter(
    (presence) => presence.state !== PresenceState.OFFLINE
  ).length
  const hasLivePresence = currentSession !== null && currentPresence.length > 0
  const connectedPlayersWithDm = currentSessionStats
    ? currentSessionStats.connectedPlayersWithDm
    : hasLivePresence
      ? Math.max(0, liveConnectedPresenceCount - connectedSpectatorsCount)
      : selectedCampaign?.connectedPlayersRounded !== undefined ||
          selectedCampaign?.connectedPlayers
        ? Math.max(
            0,
            (selectedCampaign?.connectedPlayersRounded ?? selectedCampaign?.connectedPlayers ?? 0) +
              (selectedCampaign?.dmOnline ? 1 : 0)
          )
        : Math.max(0, liveConnectedPresenceCount - connectedSpectatorsCount)
  const membershipRole = resolveMembershipRole(selectedCampaign?.memberRole)
  const effectiveSessionRole: Role =
    currentSession && currentSession.dmId === user.id ? Role.DM : membershipRole
  const dmPresence = useMemo(
    () => currentPresence.find((presence) => presence.userId === currentSession?.dmId) || null,
    [currentPresence, currentSession?.dmId]
  )
  const isDmDisconnected =
    Boolean(currentSession) &&
    currentSession?.dmId !== user.id &&
    dmPresence?.state === PresenceState.OFFLINE
  const configuredCooldownDurationMs = Math.max(
    60_000,
    toValidPostSessionDurationMinutes(settingsPostSessionChatDurationMinutes) * 60_000
  )
  const cooldownControlVisible =
    currentSession?.state === SessionState.ENDED &&
    (effectiveSessionRole === Role.DM || effectiveSessionRole === Role.PLAYER)
  const canManageCooldown =
    currentSession?.state === SessionState.ENDED &&
    (currentSession?.dmId === user.id || (effectiveSessionRole === Role.PLAYER && isDmDisconnected))
  const cooldownControlLockedReason =
    cooldownControlVisible && !canManageCooldown
      ? effectiveSessionRole === Role.PLAYER
        ? 'Cooldown controls unlock for players only if the DM disconnects.'
        : 'Only the DM can control cooldown.'
      : undefined
  // Preserve the JWT `role` as-is; set `campaignMembershipRole` so components can
  // distinguish the campaign-scoped role from the global account role.
  const effectiveSessionUser =
    effectiveSessionRole === user.role
      ? {
          ...user,
          campaignMembershipRole: selectedCampaign?.memberRole as
            | 'DM'
            | 'PLAYER'
            | 'SPECTATOR'
            | undefined,
        }
      : {
          ...user,
          role: effectiveSessionRole,
          campaignMembershipRole: effectiveSessionRole as unknown as 'DM' | 'PLAYER' | 'SPECTATOR',
        }
  const canStartFromGreenroom = currentSession?.dmId === user.id && isGreenroom
  const canPauseFromActive =
    currentSession?.dmId === user.id &&
    (currentSession?.state === SessionState.ACTIVE || currentSession?.state === SessionState.PAUSED)
  const canStopFromActive =
    currentSession?.dmId === user.id &&
    (currentSession?.state === SessionState.ACTIVE || currentSession?.state === SessionState.PAUSED)
  const canEditCharacterSettings =
    effectiveSessionRole === Role.DM || effectiveSessionRole === Role.PLAYER
  const canEditSessionSettings =
    currentSession?.state === SessionState.IDLE ||
    currentSession?.state === SessionState.ACTIVE ||
    currentSession?.state === SessionState.PAUSED

  useEffect(() => {
    if (!error) return

    showToast({
      id: `session-init:error:${error}`,
      variant: 'error',
      message: error,
      onDismiss: () => {
        setError((current) => (current === error ? null : current))
      },
    })
  }, [error, showToast])

  useEffect(() => {
    if (!lobbyNotice) return

    showToast({
      id: `session-init:notice:${lobbyNotice}`,
      variant: 'success',
      message: lobbyNotice,
      onDismiss: () => {
        setLobbyNotice((current) => (current === lobbyNotice ? null : current))
      },
    })
  }, [lobbyNotice, showToast])

  useEffect(() => {
    if (!activeTransitionNotice) return

    showToast({
      id: `session-init:transition:${activeTransitionNotice.eventId}`,
      variant: 'info',
      message: formatTransitionNotice({
        nextState: activeTransitionNotice.nextState,
        movedUsers: activeTransitionNotice.movedUsers,
        targetRoomName: activeTransitionNotice.targetRoomName,
        targetState: activeTransitionNotice.targetState,
      }),
      onDismiss: hideTransitionToast,
    })
  }, [activeTransitionNotice, hideTransitionToast, showToast])

  useEffect(() => {
    wsErrorMessageRef.current = wsError?.message || null
  }, [wsError, wsErrorMessageRef])

  useEffect(() => {
    if (wsState === 'connected') {
      wsRetryWindowStartRef.current = null
      sessionLifecycleActions.setWsRetryWindowExpired(false)
      sessionLifecycleActions.setWsRetrySecondsRemaining(null)

      if (wsRetryToastTimerRef.current !== null) {
        window.clearTimeout(wsRetryToastTimerRef.current)
        wsRetryToastTimerRef.current = null
      }

      dismissToast(WS_ERROR_TOAST_ID)
      return
    }

    if (wsRetryWindowStartRef.current === null) {
      wsRetryWindowStartRef.current = Date.now()
    }

    const elapsedMs = Date.now() - wsRetryWindowStartRef.current
    const remainingMs = Math.max(0, WS_AUTO_RETRY_WINDOW_MS - elapsedMs)
    sessionLifecycleActions.setWsRetrySecondsRemaining(Math.ceil(remainingMs / 1000))

    if (remainingMs <= 0) {
      sessionLifecycleActions.setWsRetryWindowExpired(true)
      sessionLifecycleActions.setWsRetrySecondsRemaining(null)
      return
    }

    if (wsRetryToastTimerRef.current !== null) {
      window.clearTimeout(wsRetryToastTimerRef.current)
    }

    wsRetryToastTimerRef.current = window.setTimeout(() => {
      sessionLifecycleActions.setWsRetryWindowExpired(true)
    }, remainingMs)

    return () => {
      if (wsRetryToastTimerRef.current !== null) {
        window.clearTimeout(wsRetryToastTimerRef.current)
        wsRetryToastTimerRef.current = null
      }
    }
  }, [wsState, sessionLifecycleActions, wsRetryToastTimerRef, wsRetryWindowStartRef])

  useEffect(() => {
    if (wsState === 'connected' || wsRetryWindowExpired || wsRetryWindowStartRef.current === null) {
      return
    }

    const updateCountdown = () => {
      if (wsRetryWindowStartRef.current === null) {
        sessionLifecycleActions.setWsRetrySecondsRemaining(null)
        return
      }

      const elapsedMs = Date.now() - wsRetryWindowStartRef.current
      const remainingMs = Math.max(0, WS_AUTO_RETRY_WINDOW_MS - elapsedMs)
      sessionLifecycleActions.setWsRetrySecondsRemaining(
        remainingMs > 0 ? Math.ceil(remainingMs / 1000) : null
      )
    }

    updateCountdown()
    const intervalId = window.setInterval(updateCountdown, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [wsRetryWindowExpired, wsState, sessionLifecycleActions, wsRetryWindowStartRef])

  useEffect(() => {
    if (!wsRetryWindowExpired || wsState === 'connected') {
      dismissToast(WS_ERROR_TOAST_ID)
      return
    }

    const detail = wsErrorMessageRef.current
      ? `Last log from the crystal: ${wsErrorMessageRef.current}.`
      : ''

    showToast({
      id: WS_ERROR_TOAST_ID,
      variant: 'error',
      message:
        `Our sending stone has tried for 30 seconds and now lies ominously silent. ` +
        `The system appears to be down in this realm. Roll for patience, then press Retry now.` +
        `\n${detail}`,
      actionLabel: 'Retry now',
      onAction: () => {
        wsRetryWindowStartRef.current = Date.now()
        sessionLifecycleActions.setWsRetryWindowExpired(false)
        sessionLifecycleActions.setWsRetrySecondsRemaining(
          Math.ceil(WS_AUTO_RETRY_WINDOW_MS / 1000)
        )
        dismissToast(WS_ERROR_TOAST_ID)
        void retryConnection()
      },
      durationMs: null,
    })
  }, [
    retryConnection,
    showToast,
    wsRetryWindowExpired,
    wsState,
    sessionLifecycleActions,
    wsErrorMessageRef,
    wsRetryWindowStartRef,
  ])

  return (
    <>
      <div
        className={`session-init-shell ${hasSessionSelected ? 'session-init-shell-session' : 'session-init-shell-home'}`}
      >
        {!hasSessionSelected && (
          <SessionLobbyView
            campaigns={campaigns}
            selectedCampaignId={selectedCampaignId}
            currentUserId={user.id}
            isLoadingCampaigns={isLoadingCampaigns}
            isCreatingCampaign={isCreatingCampaign}
            isJoiningCampaign={isJoiningCampaign}
            themeMode={themeMode}
            connectionStatus={{
              statusColorKey: connectionStatus.statusColorKey,
              label: connectionStatus.label,
              coreWsState: connectionStatus.coreWsState as
                | 'CONNECTED'
                | 'CONNECTING'
                | 'DISCONNECTED',
            }}
            onSelectCampaign={setSelectedCampaignId}
            onCreateCampaign={() => setShowCreateCampaignModal(true)}
            onJoinCampaign={() => setShowJoinCampaignModal(true)}
            onToggleTheme={handleToggleTheme}
            onOpenUserSettings={() => setShowUserSettingsModal(true)}
            onLogoff={handleLogoff}
            onOpenCampaignSettings={openCampaignSettingsModal}
            onEnterCampaign={(campaignId) => {
              void handleEnterCampaign(campaignId)
            }}
            onError={setError}
          />
        )}

        {/* Command center shown whenever a session is selected */}
        {hasSessionSelected && currentSession && (
          <div className="session-command-center">
            <CommandCenterFrame
              role={effectiveSessionRole}
              rightRailIndicators={rightRailIndicators}
              renderSystemToasts={() => (
                <ReconnectBanner
                  wsState={wsState}
                  manualRetryCountdownSeconds={wsRetrySecondsRemaining}
                />
              )}
              renderToolbar={(actions) => (
                <SessionToolbar
                  actions={actions}
                  statusColorKey={connectionStatus.statusColorKey}
                  statusLabel={connectionStatus.label}
                  coreWsState={connectionStatus.coreWsState}
                  livekitState={connectionStatus.livekitState}
                  sessionState={toSessionStateValue(currentSession.state)}
                  sessionStartedAt={currentSession.startedAt}
                  sessionPausedAt={currentSession.pausedAt ?? currentPauseStats.pauseStartedAt}
                  sessionEndedAt={currentSession.endedAt}
                  cumulativePauseMs={currentPauseStats.cumulativePauseMs}
                  pauseCount={currentPauseStats.pauseCount}
                  cooldownDurationMs={configuredCooldownDurationMs}
                  canStartSession={canStartFromGreenroom}
                  canPauseSession={canPauseFromActive}
                  canStopSession={canStopFromActive}
                  showCooldownControls={cooldownControlVisible}
                  canManageCooldown={Boolean(canManageCooldown)}
                  cooldownControlLockedReason={cooldownControlLockedReason}
                  onStartSession={() => handleStartSession(currentSession.id)}
                  onPauseSession={() => handlePauseSession(currentSession.id)}
                  onStopSession={() => handleStopSession(currentSession.id)}
                  onCancelCooldown={() => handleCancelCooldown(currentSession.id)}
                  onExtendCooldown={() =>
                    void handleExtendCooldown(currentSession.id, configuredCooldownDurationMs)
                  }
                  onOpenUserSettings={() => setShowUserSettingsModal(true)}
                  onExitToSelector={handleExitToCampaignSelector}
                />
              )}
              renderLeftRail={() => (
                <div className="session-left-rail-stack">
                  <SessionLeftRailPanel
                    apiUrl={apiUrl}
                    token={token}
                    sessionId={currentSession.id}
                    campaignName={selectedCampaign?.name || 'Campaign'}
                    campaignDescription={selectedCampaign?.description}
                    role={effectiveSessionRole}
                    sessionName={currentSession.name}
                    sessionState={toSessionStateValue(currentSession.state)}
                    sessionCount={sessionList.length}
                    connectedPlayersCount={connectedPlayersWithDm}
                    connectedSpectatorsCount={connectedSpectatorsCount}
                    dmUserId={currentSession.dmId}
                    currentUserId={user.id}
                    rooms={visibleRooms.map((room) => ({
                      id: room.id,
                      name: room.name,
                      type: room.type,
                    }))}
                    roomMembersByRoomId={typedRoomMembers}
                    sessionEndedAt={currentSession.endedAt}
                    cooldownDurationMs={configuredCooldownDurationMs}
                    selectedRoomId={selectedRoomId}
                    onSelectRoom={setSelectedRoomIdOverride}
                    broadcastModeEnabled={broadcastModeEnabled}
                    onToggleBroadcastMode={handleToggleBroadcastMode}
                    dmAutoTargetOnFirstPlayerJoin={settingsDmAutoTargetOnFirstPlayerJoin}
                    dmOverrides={dmOverrides}
                    currentConditionName={currentConditionName}
                    roomEnvironmentNames={roomEnvironmentNames}
                  />
                  {selectedRoomId ? (
                    <aside
                      className="session-left-rail-card session-left-rail-card--audio"
                      aria-label="Voice panel"
                    >
                      <AudioPanel
                        sessionId={currentSession.id}
                        roomId={selectedRoomId}
                        role={effectiveSessionRole}
                      />
                    </aside>
                  ) : null}
                </div>
              )}
              renderCenterPane={(view) => (
                <div className="session-command-center-pane">
                  {effectiveSessionRole === Role.SPECTATOR &&
                  (currentSession.state === SessionState.PAUSED ||
                    currentSession.state === SessionState.ENDED) ? (
                    <SpectatorWaitScreen
                      sessionState={
                        currentSession.state === SessionState.PAUSED ? 'PAUSED' : 'ENDED'
                      }
                      sessionEndedAt={currentSession.endedAt}
                      cooldownDurationMs={configuredCooldownDurationMs}
                    />
                  ) : view === 'chat' ? (
                    <div className="session-live-comms">
                      <section className="session-live-comms__chat" aria-label="Chat panel">
                        {selectedRoomId ? (
                          <ChatWindow
                            apiUrl={apiUrl}
                            token={token}
                            sessionId={currentSession.id}
                            roomId={selectedRoomId}
                            roomName={selectedRoom?.name}
                            user={effectiveSessionUser}
                            messageGroupingWindowMs={messageGroupingWindowMs}
                            sendWsEvent={send}
                            forceMessageType={isGreenroomChatMode ? MessageType.OOC : undefined}
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
                      user={effectiveSessionUser}
                    />
                  )}
                </div>
              )}
              renderRightRailTab={(tab) => {
                return (
                  <SessionRightRailContent
                    tab={tab}
                    informationPanel={
                      <CampaignInformationPanel
                        campaign={selectedCampaign ?? null}
                        sessionCount={settingsCampaignSessions.length}
                        totalSessionDurationMs={settingsCampaignTotalDurationMs}
                        canEdit={Boolean(
                          selectedCampaign && selectedCampaign.currentDmId === user.id
                        )}
                        onEditCampaign={openCampaignSettingsModal}
                        onSaveCampaignInfo={handleSaveCampaignInfoPanel}
                      />
                    }
                    roomsPanel={
                      <CampaignScaffoldPanel
                        title="Groups"
                        subtitle="Voice group configuration is being rebuilt around campaign-level controls."
                        sections={[
                          'DM-only group management',
                          'Greenroom pre-create support',
                          'Group defaults and templates',
                          'Campaign routing and policy',
                        ]}
                        campaignName={selectedCampaign?.name}
                      />
                    }
                    audioPanel={
                      <CampaignScaffoldPanel
                        title="Campaign Audio"
                        subtitle="Audio policy controls are being reduced to a cleaner campaign-first surface."
                        sections={[
                          'Default campaign audio policy',
                          'Environment and override presets',
                          'Broadcast and moderation policy',
                        ]}
                        campaignName={selectedCampaign?.name}
                      />
                    }
                    notesPanel={
                      <NotesRailPanel
                        apiUrl={apiUrl}
                        token={token}
                        sessionId={currentSession.id}
                        role={effectiveSessionRole}
                        onOpenNotesWorkspace={() => setToolbarCenterPaneView('notes')}
                      />
                    }
                    journalPanel={
                      <JournalPanel
                        apiUrl={apiUrl}
                        token={token}
                        sessionId={currentSession.id}
                        sessionName={currentSession.name}
                        role={effectiveSessionRole}
                        userId={user.id}
                      />
                    }
                    historyPanel={
                      <HistoryPanel
                        apiUrl={apiUrl}
                        token={token}
                        sessionId={currentSession.id}
                        role={effectiveSessionRole}
                        userId={user.id}
                      />
                    }
                    settingsPanel={
                      <CampaignRightbarSettings
                        role={
                          effectiveSessionRole === 'DM'
                            ? 'DM'
                            : effectiveSessionRole === 'PLAYER'
                              ? 'PLAYER'
                              : 'SPECTATOR'
                        }
                        campaignId={selectedCampaignId || null}
                        sessionName={sessionSettingsName}
                        sessionDescription={sessionSettingsDescription}
                        plannedDurationMinutes={sessionSettingsPlannedDurationMinutes}
                        sessionStateLabel={currentSession.state}
                        canEditSessionSettings={canEditSessionSettings}
                        onSessionNameChange={setSessionSettingsName}
                        onSessionDescriptionChange={setSessionSettingsDescription}
                        onPlannedDurationMinutesChange={handlePlannedDurationMinutesChange}
                        onSaveSessionSettings={() => {
                          void saveSessionSettings()
                        }}
                        isSessionSaving={isSessionSettingsSaving}
                        dmAutoTarget={settingsDmAutoTargetOnFirstPlayerJoin}
                        onDmAutoTargetChange={(value) =>
                          campaignSettingsActions.setSettingsDmAutoTargetOnFirstPlayerJoin(value)
                        }
                        onSaveDmAutoTarget={() => {
                          if (selectedCampaignId)
                            void saveDmVoiceTargetingSetting(selectedCampaignId)
                        }}
                        isSaving={isDmVoiceTargetingSettingSaving}
                        isLoading={isDmVoiceTargetingSettingLoading}
                        characterDraft={characterSettingsDraft}
                        onCharacterFieldChange={handleCharacterFieldChange}
                        onSaveCharacterSettings={() => {
                          void saveCharacterSettings()
                        }}
                        isCharacterLoading={isCharacterSettingsLoading}
                        isCharacterSaving={isCharacterSettingsSaving}
                      />
                    }
                  />
                )
              }}
            />
          </div>
        )}
      </div>

      <SessionInitModals
        apiUrl={apiUrl}
        token={token}
        user={user}
        selectedCampaignName={selectedCampaign?.name}
        showCreateCampaignModal={showCreateCampaignModal}
        isCreatingCampaign={isCreatingCampaign}
        newCampaignName={newCampaignName}
        newCampaignDescription={newCampaignDescription}
        onCreateCampaignSubmit={handleCreateCampaign}
        onNewCampaignNameChange={setNewCampaignName}
        onNewCampaignDescriptionChange={setNewCampaignDescription}
        onCloseCreateCampaign={() => setShowCreateCampaignModal(false)}
        showJoinCampaignModal={showJoinCampaignModal}
        joinInviteInput={joinInviteInput}
        isJoiningCampaign={isJoiningCampaign}
        onJoinCampaignSubmit={handleJoinCampaign}
        onJoinInviteInputChange={setJoinInviteInput}
        onCloseJoinCampaign={() => setShowJoinCampaignModal(false)}
        showCampaignSettingsModal={showCampaignSettingsModal}
        settingsHomeTab={settingsHomeTab}
        onSettingsHomeTabChange={(tab) => campaignSettingsActions.setSettingsHomeTab(tab)}
        settingsCampaignSessions={settingsCampaignSessions}
        settingsReferenceSessionId={settingsReferenceSessionId}
        onSettingsReferenceSessionChange={(sessionId) =>
          campaignSettingsActions.setSettingsReferenceSessionId(sessionId)
        }
        settingsReferenceSession={settingsReferenceSession || null}
        isSettingsLoading={isSettingsLoading}
        settingsData={settingsData}
        isSettingsSaving={isSettingsSaving}
        onCloseCampaignSettings={() => setShowCampaignSettingsModal(false)}
        onSaveCampaignSettings={handleSaveCampaignSettings}
        settingsName={settingsName}
        onSettingsNameChange={(name) => campaignSettingsActions.setSettingsName(name)}
        settingsDescription={settingsDescription}
        onSettingsDescriptionChange={(desc) => campaignSettingsActions.setSettingsDescription(desc)}
        onPosterFileSelected={handlePosterFileSelected}
        isInviteReissuing={isInviteReissuing}
        onCopyInviteUrl={(inviteType) => {
          void copyInviteUrl(inviteType)
        }}
        onReissueInvite={(inviteType) => {
          void reissueInvite(inviteType)
        }}
        settingsVisibility={settingsVisibility}
        onSettingsVisibilityChange={(vis) => campaignSettingsActions.setSettingsVisibility(vis)}
        settingsSpectatorsEnabled={settingsSpectatorsEnabled}
        onSettingsSpectatorsEnabledChange={(enabled) =>
          campaignSettingsActions.setSettingsSpectatorsEnabled(enabled)
        }
        settingsSpectatorMax={settingsSpectatorMax}
        onSettingsSpectatorMaxChange={(max) => campaignSettingsActions.setSettingsSpectatorMax(max)}
        settingsSpectatorWaitlistEnabled={settingsSpectatorWaitlistEnabled}
        onSettingsSpectatorWaitlistEnabledChange={(enabled) =>
          campaignSettingsActions.setSettingsSpectatorWaitlistEnabled(enabled)
        }
        settingsSpectatorReconnectGraceSecs={settingsSpectatorReconnectGraceSecs}
        onSettingsSpectatorReconnectGraceSecsChange={(secs) =>
          campaignSettingsActions.setSettingsSpectatorReconnectGraceSecs(secs)
        }
        settingsPostSessionChatEnabled={settingsPostSessionChatEnabled}
        onSettingsPostSessionChatEnabledChange={(enabled) =>
          campaignSettingsActions.setSettingsPostSessionChatEnabled(enabled)
        }
        settingsPostSessionChatDurationMinutes={settingsPostSessionChatDurationMinutes}
        onSettingsPostSessionChatDurationMinutesChange={(value) =>
          campaignSettingsActions.setSettingsPostSessionChatDurationMinutes(
            toValidPostSessionDurationMinutes(value)
          )
        }
        settingsExtensionSyncPolicy={settingsExtensionSyncPolicy}
        onSettingsExtensionSyncPolicyChange={(policy) =>
          campaignSettingsActions.setSettingsExtensionSyncPolicy(policy)
        }
        settingsLateJoinPolicy={settingsLateJoinPolicy}
        onSettingsLateJoinPolicyChange={(policy) =>
          campaignSettingsActions.setSettingsLateJoinPolicy(policy)
        }
        settingsLateJoinGraceMinutes={settingsLateJoinGraceMinutes}
        onSettingsLateJoinGraceMinutesChange={(mins) =>
          campaignSettingsActions.setSettingsLateJoinGraceMinutes(mins)
        }
        showUserSettingsModal={showUserSettingsModal}
        onUserSettingsOpenChange={setShowUserSettingsModal}
        messageGroupingWindowMs={messageGroupingWindowMs}
        onMessageGroupingWindowChange={setMessageGroupingWindowMs}
        showExitSessionModal={showExitSessionModal}
        exitUpgradePassword={exitUpgradePassword}
        onExitUpgradePasswordChange={setExitUpgradePassword}
        exitUpgradeLoading={exitUpgradeLoading}
        exitUpgradeError={exitUpgradeError}
        onCloseExitSession={() => setShowExitSessionModal(false)}
        onSkipGuestUpgrade={handleSkipGuestUpgrade}
        onUpgradeAndExit={() => {
          void handleUpgradeAndExit()
        }}
        onConfirmExitAsFullAccount={handleConfirmExitAsFullAccount}
        showStopSessionModal={showStopSessionModal}
        onCloseStopSession={() => setShowStopSessionModal(false)}
        onConfirmStopSession={() => {
          void handleConfirmStopSession()
        }}
      />
    </>
  )
}
