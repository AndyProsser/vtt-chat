/**
 * Session Initialization
 * Component for creating a new session and transitioning to active state.
 * Tests the full UI → Event → Store pipeline.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import {
  SessionState,
  Role,
  MessageType,
  deriveCampaignDisplayState,
  isGreenroomSessionState,
} from '@shared'
import type { UUID } from '@shared'
import { PresenceState, RoomType } from '@shared'
import { useStore } from '../../hooks/useStore'
import { useWebSocket } from '../../hooks/useWebSocket'
import type { ConnectionState } from '../../ws/client'
import { useConnectionStatus } from '../../hooks/useConnectionStatus'
import { ChatWindow } from '../chat/ChatWindow'
import { NotesPanel } from '../notes/NotesPanel'
import { CommandCenterFrame, type RightRailTab } from './CommandCenterFrame'
import { SessionLeftRailPanel } from './SessionLeftRailPanel'
import { SessionUserSettingsPanel } from './SessionUserSettingsPanel'
import { SessionToolbar } from './SessionToolbar'
import { ReconnectBanner } from '../ui/ReconnectBanner'
import { AudioPanel } from '../audio/AudioPanel'
import { NotesRailPanel } from './NotesRailPanel'
import { JournalPanel } from './JournalPanel'
import { HistoryPanel } from './HistoryPanel'
import { SessionRightRailContent } from './SessionRightRailContent'
import { CampaignRightbarSettings } from './CampaignRightbarSettings'
import { CampaignInformationPanel } from './CampaignInformationPanel'
import { Icon } from '../ui/Icon'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../core-ui'
import { useToast } from '../../hooks/useToast'
import { dismissToast } from '../../state/toastCenter'
import { isGreenRoomName } from '../../constants/roomPresence.constants'
import { createHttpTelemetryTransport, telemetryClient } from '../../utils/telemetry'
import { FRONTEND_THEME_CLASSES, type FrontendThemeMode } from '../../tokens'
import type { Session as SessionRecord } from '@/types/session'
import type { Note } from '@/types/notes'
import type { Message } from '@/types/chat'
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
  user: { id: UUID; username: string; role: Role; authType?: 'FULL' | 'GUEST' }
  onSessionCreated?: (sessionId: UUID) => void
  onReady?: () => void
}

interface CampaignSummary {
  id: UUID
  name: string
  description?: string | null
  posterUrl?: string | null
  inviteCode: string
  currentDmId: UUID
  memberRole?: 'DM' | 'PLAYER' | 'SPECTATOR' | 'SYSTEM'
  dmUsername?: string
  dmDisplayName?: string
  dmAvatarUrl?: string | null
  dmOnline?: boolean
  connectedPlayers?: number
  connectedPlayersRounded?: number
  connectedPlayersLabel?: string
  connectedSpectatorsRounded?: number
  connectedSpectatorsLabel?: string
  displayState?: 'INACTIVE' | 'GREENROOM' | 'ACTIVE' | 'PAUSED'
  latestSessionState?: SessionState | 'INACTIVE' | null
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

type CampaignMembershipRole = CampaignSummary['memberRole']
type CampaignSettingsHomeTab = 'home' | 'notes' | 'journal'

const CHAT_GROUPING_STORAGE_KEY = 'vtt-chat:chat-grouping-window-ms'
const DEFAULT_CHAT_GROUPING_WINDOW_MS = 5 * 60 * 1000
const ALLOWED_CHAT_GROUPING_WINDOWS = new Set([0, 2 * 60 * 1000, 5 * 60 * 1000, 10 * 60 * 1000])
const LOBBY_CAMPAIGN_FOCUS_STORAGE_KEY = 'vtt-chat:lobby-campaign-focus-id'
const LOBBY_AUTO_ENTER_CAMPAIGN_STORAGE_KEY = 'vtt-chat:lobby-auto-enter-campaign-id'
const LOBBY_NOTICE_STORAGE_KEY = 'vtt-chat:lobby-notice'
const ACTIVE_SESSION_CONTEXT_STORAGE_KEY = 'vtt-chat:active-session-context'
const MAX_POSTER_WIDTH_PX = 1024
const DEFAULT_PLANNED_DURATION_MINUTES = 180
const MAX_POSTER_DATA_URL_CHARS = 350_000
const SESSION_BOOKEND_DEDUPE_WINDOW_MS = 10_000
const SESSION_SUMMARY_TAG = 'session-summary'
const SESSION_SUMMARY_TITLE = 'Session Summary'
const WS_ERROR_TOAST_ID = 'session-init:ws-error'
const WS_AUTO_RETRY_WINDOW_MS = 30_000
const DEFAULT_GREENROOM_CACHE_TTL_MS = 60 * 60 * 1000
const SESSION_BOOKEND_PREFIXES = [
  'Session Start:',
  'Session End:',
  '[Session Started]',
  '[Session Ended]',
  '[Session Paused]',
  '[Session Resumed]',
] as const

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

const ROOM_ENVIRONMENT_PRESET_FALLBACKS: Record<
  string,
  { reverbSend: number; lowpassFreq: number; roomGain: number }
> = {
  default: { reverbSend: 0.3, lowpassFreq: 8000, roomGain: 0 },
  forest: { reverbSend: 0.42, lowpassFreq: 7600, roomGain: -1 },
  cave: { reverbSend: 0.62, lowpassFreq: 4200, roomGain: -2 },
  tavern: { reverbSend: 0.36, lowpassFreq: 6800, roomGain: -1 },
  city: { reverbSend: 0.28, lowpassFreq: 8200, roomGain: -0.5 },
  dungeon: { reverbSend: 0.54, lowpassFreq: 3600, roomGain: -2.5 },
  night: { reverbSend: 0.24, lowpassFreq: 9000, roomGain: -1.2 },
  storm: { reverbSend: 0.48, lowpassFreq: 5200, roomGain: -1.8 },
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

type CampaignSettingsPayload = {
  latestSessionId?: UUID | null
  latestSessionState?: 'IDLE' | 'ACTIVE' | 'PAUSED' | 'ENDED' | null
  latestSessionEndedAt?: string | null
  id: UUID
  name: string
  description?: string | null
  posterUrl?: string | null
  discoverable: boolean
  spectatorPolicy: 'NONE' | 'GUESTS' | 'USERS'
  spectatorMax: number | null
  spectatorWaitlistEnabled: boolean
  spectatorReconnectGraceSecs: number
  extensionSyncPolicy: 'NONE' | 'DM_ONLY' | 'DM_AND_PLAYERS'
  lateJoinPolicy: 'OPEN' | 'SCREENED' | 'BLOCKED'
  lateJoinGraceMinutes: number
  inviteCode: string
  inviteActive: boolean
  spectatorInviteCode?: string | null
  spectatorInviteActive: boolean
  postSessionChatEnabled: boolean
  postSessionChatDurationMs: number
  dmAutoTargetOnFirstPlayerJoin: boolean
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
  nextState: SessionState | 'INACTIVE'
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

  return deriveCampaignDisplayState(campaign.latestSessionState)
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

function getPrivacyCounterLabel(label: string | undefined, rounded: number | undefined): string {
  if (label && label.trim()) return label
  if (!rounded || rounded <= 0) return '0'
  return `~${rounded}`
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

function getVisibleRoomsForSessionState(
  rooms: RoomRecord[],
  state: SessionState | 'INACTIVE'
): RoomRecord[] {
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

function toSessionStateValue(state: SessionState | 'INACTIVE'): SessionState {
  return state === 'INACTIVE' ? SessionState.IDLE : state
}

function getCampaignEntryAction(campaign: CampaignSummary): {
  label: 'Launch' | 'Watch'
  icon: 'rocket_launch' | 'visibility'
  disabled: boolean
  reason?: string
} {
  const state = getCampaignDisplayState(campaign)
  const isSpectator = campaign.memberRole === 'SPECTATOR'

  if (!isSpectator) {
    return {
      label: 'Launch',
      icon: 'rocket_launch',
      disabled: false,
    }
  }

  if (state !== 'ACTIVE') {
    return {
      label: 'Watch',
      icon: 'visibility',
      disabled: true,
      reason: 'Spectators can only watch active campaigns.',
    }
  }

  const hasTableOnline = Boolean(campaign.dmOnline) || (campaign.connectedPlayers || 0) > 0
  if (!hasTableOnline) {
    return {
      label: 'Watch',
      icon: 'visibility',
      disabled: true,
      reason: 'Campaign is active, but no DM or player is online yet.',
    }
  }

  return {
    label: 'Watch',
    icon: 'visibility',
    disabled: false,
  }
}

function resolveMembershipRole(memberRole: CampaignMembershipRole | null | undefined): Role {
  if (memberRole === 'DM') return Role.DM
  if (memberRole === 'SPECTATOR') return Role.SPECTATOR
  return Role.PLAYER
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
  const [settingsCampaignId, setSettingsCampaignId] = useState<UUID | ''>('')
  const [settingsHomeTab, setSettingsHomeTab] = useState<CampaignSettingsHomeTab>('home')
  const [settingsCampaignSessions, setSettingsCampaignSessions] = useState<SessionRecord[]>([])
  const [settingsReferenceSessionId, setSettingsReferenceSessionId] = useState<UUID | ''>('')
  const [isSettingsReferenceNotesLoading, setIsSettingsReferenceNotesLoading] = useState(false)
  const [settingsReferenceNotesError, setSettingsReferenceNotesError] = useState<string | null>(
    null
  )
  const [isSettingsLoading, setIsSettingsLoading] = useState(false)
  const [isSettingsSaving, setIsSettingsSaving] = useState(false)
  const [isInviteReissuing, setIsInviteReissuing] = useState(false)
  const [settingsData, setSettingsData] = useState<CampaignSettingsPayload | null>(null)
  const [settingsName, setSettingsName] = useState('')
  const [settingsDescription, setSettingsDescription] = useState('')
  const [settingsVisibility, setSettingsVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PRIVATE')
  const [settingsSpectatorsEnabled, setSettingsSpectatorsEnabled] = useState(false)
  const [settingsSpectatorMax, setSettingsSpectatorMax] = useState(10)
  const [settingsSpectatorWaitlistEnabled, setSettingsSpectatorWaitlistEnabled] = useState(false)
  const [settingsSpectatorReconnectGraceSecs, setSettingsSpectatorReconnectGraceSecs] = useState(60)
  const [settingsExtensionSyncPolicy, setSettingsExtensionSyncPolicy] = useState<
    'ALLOW' | 'DM_ONLY' | 'NONE'
  >('ALLOW')
  const [settingsPostSessionChatEnabled, setSettingsPostSessionChatEnabled] = useState(true)
  const [settingsPostSessionChatDurationMinutes, setSettingsPostSessionChatDurationMinutes] =
    useState(5)
  const [settingsDmAutoTargetOnFirstPlayerJoin, setSettingsDmAutoTargetOnFirstPlayerJoin] =
    useState(true)
  const [isDmVoiceTargetingSettingLoading, setIsDmVoiceTargetingSettingLoading] = useState(false)
  const [isDmVoiceTargetingSettingSaving, setIsDmVoiceTargetingSettingSaving] = useState(false)
  const [sessionSettingsName, setSessionSettingsName] = useState('')
  const [sessionSettingsDescription, setSessionSettingsDescription] = useState('')
  const [sessionSettingsPlannedDurationMinutes, setSessionSettingsPlannedDurationMinutes] =
    useState(DEFAULT_PLANNED_DURATION_MINUTES)
  const [isSessionSettingsSaving, setIsSessionSettingsSaving] = useState(false)
  const [userCharacters, setUserCharacters] = useState<UserCharacterRecord[]>([])
  const [selectedCharacterId, setSelectedCharacterId] = useState<UUID | ''>('')
  const [characterSettingsDraft, setCharacterSettingsDraft] = useState<CharacterSettingsDraft>(
    DEFAULT_CHARACTER_SETTINGS
  )
  const [isCharacterSettingsLoading, setIsCharacterSettingsLoading] = useState(false)
  const [isCharacterSettingsSaving, setIsCharacterSettingsSaving] = useState(false)
  const [settingsLateJoinPolicy, setSettingsLateJoinPolicy] = useState<
    'OPEN' | 'SCREENED' | 'BLOCKED'
  >('OPEN')
  const [settingsLateJoinGraceMinutes, setSettingsLateJoinGraceMinutes] = useState(30)
  const [settingsPosterUrl, setSettingsPosterUrl] = useState('')
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
  const prevWsStateRef = useRef<ConnectionState>('disconnected')
  const wsTelemetryPrevRef = useRef<ConnectionState | null>(null)
  const lobbyAutoEnterTriggeredRef = useRef(false)
  const lastHydratedSessionFingerprintRef = useRef<string | null>(null)
  const pendingGreenroomCarryBySessionIdRef = useRef<Map<UUID, UUID>>(new Map())
  const greenroomCleanupTimerRef = useRef<number | null>(null)
  const wsRetryWindowStartRef = useRef<number | null>(null)
  const wsRetryToastTimerRef = useRef<number | null>(null)
  const wsErrorMessageRef = useRef<string | null>(null)
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
  const [wsRetryWindowExpired, setWsRetryWindowExpired] = useState(false)
  const [wsRetrySecondsRemaining, setWsRetrySecondsRemaining] = useState<number | null>(null)

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

  // WebSocket connection
  const {
    state: wsState,
    error: wsError,
    retryConnection,
  } = useWebSocket({
    url: wsUrl,
    token,
    enabled: !!token,
    onAuthFailure: handleWebSocketAuthFailure,
  })

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
  const setCurrentSession = useStore((state) => state.setCurrentSession)
  const setIsGreenroom = useStore((state) => state.setIsGreenroom)
  const resetToolbarActionsState = useStore((state) => state.resetToolbarActionsState)
  const setToolbarCenterPaneView = useStore((state) => state.setToolbarCenterPaneView)
  const updateSession = useStore((state) => state.updateSession)
  const pauseStats = useStore((state) => state.pauseStats)
  const typedSessions = sessions as Record<UUID, SessionRecord>
  const sessionList: SessionRecord[] = Object.values(typedSessions)
  const currentSession = currentSessionId ? sessions[currentSessionId] || null : null
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
      setCharacterSettingsDraft({ ...DEFAULT_CHARACTER_SETTINGS })
      return
    }

    setSelectedCharacterId(selectedCharacter.id)
    setCharacterSettingsDraft(buildCharacterDraft(selectedCharacter))
  }, [selectedCharacter])

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
    [addMessage, apiUrl, token]
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
      setIsSettingsLoading(true)
      setError(null)

      try {
        const response = await fetchWithAuthGuard(
          `${apiUrl}/api/campaigns/${campaignId}/settings`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        )

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.message || 'Failed to load campaign settings')
        }

        const payload = (await response.json()) as { campaign: CampaignSettingsPayload }
        setSettingsData(payload.campaign)
        setSettingsReferenceSessionId(payload.campaign.latestSessionId || '')
        setSettingsName(payload.campaign.name)
        setSettingsDescription(payload.campaign.description || '')
        setSettingsVisibility(payload.campaign.discoverable ? 'PUBLIC' : 'PRIVATE')
        setSettingsSpectatorsEnabled(payload.campaign.spectatorPolicy !== 'NONE')
        setSettingsSpectatorMax(payload.campaign.spectatorMax ?? 10)
        setSettingsSpectatorWaitlistEnabled(payload.campaign.spectatorWaitlistEnabled)
        setSettingsSpectatorReconnectGraceSecs(payload.campaign.spectatorReconnectGraceSecs)
        setSettingsPostSessionChatEnabled(payload.campaign.postSessionChatEnabled)
        setSettingsPostSessionChatDurationMinutes(
          toValidPostSessionDurationMinutes(payload.campaign.postSessionChatDurationMs / 60000)
        )
        setSettingsDmAutoTargetOnFirstPlayerJoin(
          payload.campaign.dmAutoTargetOnFirstPlayerJoin ?? true
        )
        setSettingsExtensionSyncPolicy(
          payload.campaign.extensionSyncPolicy === 'DM_AND_PLAYERS'
            ? 'ALLOW'
            : payload.campaign.extensionSyncPolicy
        )
        setSettingsLateJoinPolicy(payload.campaign.lateJoinPolicy)
        setSettingsLateJoinGraceMinutes(payload.campaign.lateJoinGraceMinutes)
        setSettingsPosterUrl(payload.campaign.posterUrl || '')
        return payload.campaign
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load campaign settings'
        setError(message)
        return null
      } finally {
        setIsSettingsLoading(false)
      }
    },
    [apiUrl, token]
  )

  const loadDmVoiceTargetingSetting = useCallback(
    async (campaignId: UUID): Promise<boolean | null> => {
      setIsDmVoiceTargetingSettingLoading(true)

      try {
        const response = await fetchWithAuthGuard(
          `${apiUrl}/api/campaigns/${campaignId}/settings/dm-voice-targeting`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        )

        if (!response.ok) {
          return null
        }

        const payload = (await response.json()) as {
          campaignId: UUID
          dmAutoTargetOnFirstPlayerJoin: boolean
        }

        const enabled = payload.dmAutoTargetOnFirstPlayerJoin !== false
        setSettingsDmAutoTargetOnFirstPlayerJoin(enabled)
        return enabled
      } catch {
        return null
      } finally {
        setIsDmVoiceTargetingSettingLoading(false)
      }
    },
    [apiUrl, token]
  )

  const saveDmVoiceTargetingSetting = useCallback(
    async (campaignId: UUID) => {
      setIsDmVoiceTargetingSettingSaving(true)
      setError(null)

      try {
        const response = await fetchWithAuthGuard(
          `${apiUrl}/api/campaigns/${campaignId}/settings/dm-voice-targeting`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              dmAutoTargetOnFirstPlayerJoin: settingsDmAutoTargetOnFirstPlayerJoin,
            }),
          }
        )

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.message || 'Failed to save DM targeting setting')
        }

        const payload = (await response.json()) as {
          campaignId: UUID
          dmAutoTargetOnFirstPlayerJoin: boolean
        }

        const enabled = payload.dmAutoTargetOnFirstPlayerJoin !== false
        setSettingsDmAutoTargetOnFirstPlayerJoin(enabled)
        setLobbyNotice('DM voice targeting preference saved.')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save DM targeting setting'
        setError(message)
      } finally {
        setIsDmVoiceTargetingSettingSaving(false)
      }
    },
    [apiUrl, settingsDmAutoTargetOnFirstPlayerJoin, token]
  )

  const saveSessionSettings = useCallback(async () => {
    if (!currentSession) {
      return
    }

    setIsSessionSettingsSaving(true)
    setError(null)

    try {
      const response = await fetchWithAuthGuard(`${apiUrl}/api/v1/session/${currentSession.id}`, {
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
      setUserCharacters([])
      setSelectedCharacterId('')
      setCharacterSettingsDraft({ ...DEFAULT_CHARACTER_SETTINGS })
      return
    }

    setIsCharacterSettingsLoading(true)
    try {
      const response = await fetchWithAuthGuard(`${apiUrl}/api/users/me/characters`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to load character settings')
      }

      const payload = (await response.json()) as { characters?: UserCharacterRecord[] }
      const characters = Array.isArray(payload.characters)
        ? payload.characters.filter((character) => character.campaignId === selectedCampaignId)
        : []

      setUserCharacters(characters)
      const preferred = characters.find((character) => character.isActive) || characters[0]
      setSelectedCharacterId(preferred?.id || '')
      setCharacterSettingsDraft(buildCharacterDraft(preferred || null))
    } catch {
      setUserCharacters([])
      setSelectedCharacterId('')
      setCharacterSettingsDraft({ ...DEFAULT_CHARACTER_SETTINGS })
    } finally {
      setIsCharacterSettingsLoading(false)
    }
  }, [apiUrl, fetchWithAuthGuard, selectedCampaignId, token])

  const saveCharacterSettings = useCallback(async () => {
    if (!selectedCampaignId) {
      return
    }

    setIsCharacterSettingsSaving(true)
    setError(null)

    const metadata = {
      level: Math.max(1, Math.min(20, Math.round(characterSettingsDraft.level))),
      strength: toValidStat(characterSettingsDraft.strength),
      dexterity: toValidStat(characterSettingsDraft.dexterity),
      constitution: toValidStat(characterSettingsDraft.constitution),
      intelligence: toValidStat(characterSettingsDraft.intelligence),
      wisdom: toValidStat(characterSettingsDraft.wisdom),
      charisma: toValidStat(characterSettingsDraft.charisma),
    }

    try {
      const endpoint = selectedCharacter
        ? `${apiUrl}/api/campaigns/${selectedCampaignId}/characters/${selectedCharacter.id}`
        : `${apiUrl}/api/campaigns/${selectedCampaignId}/characters`
      const method = selectedCharacter ? 'PATCH' : 'POST'

      const response = await fetchWithAuthGuard(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: characterSettingsDraft.name.trim() || 'Adventurer',
          race: characterSettingsDraft.race.trim() || 'Human',
          class: characterSettingsDraft.className.trim() || 'Fighter',
          subclass: characterSettingsDraft.subclass.trim() || null,
          avatarUrl: characterSettingsDraft.avatarUrl.trim() || null,
          metadata,
          isActive: true,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.message || 'Failed to save character settings')
      }

      setLobbyNotice('Character settings saved.')
      await loadUserCharacters()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save character settings'
      setError(message)
    } finally {
      setIsCharacterSettingsSaving(false)
    }
  }, [
    apiUrl,
    characterSettingsDraft,
    fetchWithAuthGuard,
    loadUserCharacters,
    selectedCampaignId,
    selectedCharacter,
    token,
  ])

  const handleCharacterFieldChange = useCallback(
    (field: keyof CharacterSettingsDraft, value: string | number) => {
      setCharacterSettingsDraft((prev) => ({
        ...prev,
        [field]: typeof value === 'number' ? (Number.isFinite(value) ? value : prev[field]) : value,
      }))
    },
    []
  )

  useEffect(() => {
    void loadUserCharacters()
  }, [loadUserCharacters])

  useEffect(() => {
    if (!selectedCampaignId || !currentSession) {
      return
    }

    void loadDmVoiceTargetingSetting(selectedCampaignId)
  }, [currentSession, loadDmVoiceTargetingSetting, selectedCampaignId])

  const fetchCampaignSessions = useCallback(
    async (campaignId: UUID): Promise<SessionRecord[]> => {
      const response = await fetchWithAuthGuard(`${apiUrl}/api/campaigns/${campaignId}/sessions`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.message || 'Failed to load campaign sessions')
      }

      const data = (await response.json()) as { sessions?: SessionRecord[] }
      return Array.isArray(data.sessions) ? data.sessions.map(normalizeSessionRecord) : []
    },
    [apiUrl, token]
  )

  const loadCampaignSettingsSessionContext = useCallback(
    async (campaignId: UUID, authoritativeLatestSessionId: UUID | '' = '') => {
      try {
        const sessions = await fetchCampaignSessions(campaignId)
        setSettingsCampaignSessions(sessions)

        if (
          authoritativeLatestSessionId &&
          sessions.some((session) => session.id === authoritativeLatestSessionId)
        ) {
          setSettingsReferenceSessionId(authoritativeLatestSessionId)
          return
        }

        const latestSession = getLatestSessionChronologically(sessions)
        setSettingsReferenceSessionId(latestSession?.id || '')
      } catch {
        setSettingsCampaignSessions([])
        if (!authoritativeLatestSessionId) {
          setSettingsReferenceSessionId('')
        }
      }
    },
    [fetchCampaignSessions]
  )

  const openCampaignSettingsModal = useCallback(
    (campaignId: UUID) => {
      setSettingsCampaignId(campaignId)
      setSettingsHomeTab('home')
      setShowCampaignSettingsModal(true)

      void (async () => {
        const settingsPayload = await loadCampaignSettings(campaignId)
        const authoritativeLatestSessionId = (settingsPayload?.latestSessionId || '') as UUID | ''
        await loadCampaignSettingsSessionContext(campaignId, authoritativeLatestSessionId)
      })()
    },
    [loadCampaignSettings, loadCampaignSettingsSessionContext]
  )

  const ensureSessionMembership = useCallback(
    async (sessionId: UUID) => {
      try {
        const response = await fetchWithAuthGuard(
          `${apiUrl}/api/v1/session/${sessionId}/members/join`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        )

        if (!response.ok && response.status !== 409) {
          return
        }
      } catch {
        return
      }
    },
    [apiUrl, token]
  )

  const handleToggleBroadcastMode = useCallback(
    async (enabled: boolean) => {
      if (!currentSession || currentSession.dmId !== user.id) {
        return
      }

      const response = await fetchWithAuthGuard(`${apiUrl}/api/v1/audio/broadcast/state`, {
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
    [apiUrl, currentSession, setBroadcastState, token, user.id]
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
  }, [apiUrl, token, clearSessions])

  useEffect(() => {
    const loadCampaignSessions = async () => {
      if (!selectedCampaignId) {
        clearSessions()
        return
      }

      setError(null)

      try {
        const nextSessions = await fetchCampaignSessions(selectedCampaignId)
        replaceSessions(nextSessions)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An error occurred'
        setError(message)
      }
    }

    void loadCampaignSessions()
  }, [selectedCampaignId, clearSessions, fetchCampaignSessions, replaceSessions])

  useEffect(() => {
    if (!showCampaignSettingsModal || !settingsReferenceSessionId) {
      setIsSettingsReferenceNotesLoading(false)
      setSettingsReferenceNotesError(null)
      return
    }

    let cancelled = false

    const loadSettingsReferenceNotes = async () => {
      setIsSettingsReferenceNotesLoading(true)
      setSettingsReferenceNotesError(null)

      try {
        const response = await fetchWithAuthGuard(
          `${apiUrl}/api/notes/${settingsReferenceSessionId}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        )

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const data = await response.json()
        const fetchedEntries: Note[] = (data.notes || []).map((note: any) => ({
          id: note.id,
          ownerId: note.authorId,
          ownerUsername: note.authorUsername,
          title: note.title,
          content: note.content,
          visibility: note.visibility,
          tags: note.tags || [],
          allowedUsers: note.allowedUsers || [],
          publishedAt: note.publishedAt,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
        }))

        if (!cancelled) {
          for (const entry of fetchedEntries) {
            addNote(settingsReferenceSessionId as UUID, entry)
          }
        }
      } catch (err) {
        if (!cancelled) {
          setSettingsReferenceNotesError(
            err instanceof Error ? err.message : 'Failed to load session notes'
          )
        }
      } finally {
        if (!cancelled) {
          setIsSettingsReferenceNotesLoading(false)
        }
      }
    }

    void loadSettingsReferenceNotes()

    return () => {
      cancelled = true
    }
  }, [addNote, apiUrl, settingsReferenceSessionId, showCampaignSettingsModal, token])

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
          fetchWithAuthGuard(`${apiUrl}/api/v1/rooms/session/${currentSession.id}`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }),
          fetchWithAuthGuard(`${apiUrl}/api/v1/presence/${currentSession.id}`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }),
          fetchWithAuthGuard(`${apiUrl}/api/v1/audio/sessions/${currentSession.id}/state`, {
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
        fetchWithAuthGuard(`${apiUrl}/api/v1/presence/${currentSession.id}/recover`, {
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
    setSelectedRoomIdOverride,
    token,
    wsState,
    replaceSessionTopology,
    replaceSessionStatsSnapshot,
    restoreSessionBookendsFromHistory,
    setBroadcastState,
    setEnvironment,
    replaceRoomEnvironmentNames,
    replaceDMOverrides,
    resetSessionAudioState,
    clearActiveEffects,
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
        targetSessions = await fetchCampaignSessions(targetCampaignId)
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
      fetchCampaignSessions,
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
    setIsSettingsSaving(true)

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
      extensionSyncPolicy: settingsSpectatorsEnabled ? settingsExtensionSyncPolicy : 'ALLOW',
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
      setSettingsData(payload.campaign)
      setSettingsName(payload.campaign.name)
      setSettingsDescription(payload.campaign.description || '')
      setSettingsVisibility(payload.campaign.discoverable ? 'PUBLIC' : 'PRIVATE')
      setSettingsSpectatorsEnabled(payload.campaign.spectatorPolicy !== 'NONE')
      setSettingsSpectatorMax(payload.campaign.spectatorMax ?? 10)
      setSettingsSpectatorWaitlistEnabled(payload.campaign.spectatorWaitlistEnabled)
      setSettingsSpectatorReconnectGraceSecs(payload.campaign.spectatorReconnectGraceSecs)
      setSettingsExtensionSyncPolicy(
        payload.campaign.extensionSyncPolicy === 'DM_AND_PLAYERS'
          ? 'ALLOW'
          : payload.campaign.extensionSyncPolicy
      )
      setSettingsPostSessionChatEnabled(payload.campaign.postSessionChatEnabled)
      setSettingsPostSessionChatDurationMinutes(
        toValidPostSessionDurationMinutes(payload.campaign.postSessionChatDurationMs / 60000)
      )
      setSettingsDmAutoTargetOnFirstPlayerJoin(
        payload.campaign.dmAutoTargetOnFirstPlayerJoin ?? true
      )
      setSettingsLateJoinPolicy(payload.campaign.lateJoinPolicy)
      setSettingsLateJoinGraceMinutes(payload.campaign.lateJoinGraceMinutes)
      setSettingsPosterUrl(payload.campaign.posterUrl || '')

      setCampaigns((prev) =>
        prev.map((campaign) =>
          campaign.id === payload.campaign.id
            ? {
                ...campaign,
                name: payload.campaign.name,
                description: payload.campaign.description,
                posterUrl: payload.campaign.posterUrl,
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
      setIsSettingsSaving(false)
    }
  }

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
        setSettingsPosterUrl(dataUrl)
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
    setIsInviteReissuing(true)

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
      setIsInviteReissuing(false)
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
      void fetchWithAuthGuard(`${apiUrl}/api/v1/session/${currentSession.id}/members/leave`, {
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
            `${apiUrl}/api/v1/session/${payload.session.id}/state`,
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
      const response = await fetchWithAuthGuard(`${apiUrl}/api/v1/session/${sessionId}/state`, {
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
        await fetchWithAuthGuard(`${apiUrl}/api/v1/session/${currentSession.id}/members/leave`, {
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
      const response = await fetchWithAuthGuard(`${apiUrl}/api/v1/auth/upgrade`, {
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
    currentSession?.state === 'INACTIVE' ||
    currentSession?.state === SessionState.ACTIVE ||
    currentSession?.state === SessionState.PAUSED

  const renderCampaignScaffoldPanel = (title: string, subtitle: string, sections: string[]) => (
    <section className="session-campaign-scaffold" aria-label={title}>
      <header className="session-campaign-scaffold__header">
        <h4 className="session-campaign-scaffold__title">
          <Icon name="panel" />
          {title}
        </h4>
        <p className="session-campaign-scaffold__subtitle">{subtitle}</p>
      </header>

      <p className="session-campaign-scaffold__context">
        Campaign context: {selectedCampaign?.name || 'Campaign'}
      </p>

      <ul className="session-campaign-scaffold__list">
        {sections.map((section) => (
          <li key={section}>{section}</li>
        ))}
      </ul>
    </section>
  )

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
  }, [wsError])

  useEffect(() => {
    if (wsState === 'connected') {
      wsRetryWindowStartRef.current = null
      setWsRetryWindowExpired(false)
      setWsRetrySecondsRemaining(null)

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
    setWsRetrySecondsRemaining(Math.ceil(remainingMs / 1000))

    if (remainingMs <= 0) {
      setWsRetryWindowExpired(true)
      setWsRetrySecondsRemaining(null)
      return
    }

    if (wsRetryToastTimerRef.current !== null) {
      window.clearTimeout(wsRetryToastTimerRef.current)
    }

    wsRetryToastTimerRef.current = window.setTimeout(() => {
      setWsRetryWindowExpired(true)
    }, remainingMs)

    return () => {
      if (wsRetryToastTimerRef.current !== null) {
        window.clearTimeout(wsRetryToastTimerRef.current)
        wsRetryToastTimerRef.current = null
      }
    }
  }, [wsState])

  useEffect(() => {
    if (wsState === 'connected' || wsRetryWindowExpired || wsRetryWindowStartRef.current === null) {
      return
    }

    const updateCountdown = () => {
      if (wsRetryWindowStartRef.current === null) {
        setWsRetrySecondsRemaining(null)
        return
      }

      const elapsedMs = Date.now() - wsRetryWindowStartRef.current
      const remainingMs = Math.max(0, WS_AUTO_RETRY_WINDOW_MS - elapsedMs)
      setWsRetrySecondsRemaining(remainingMs > 0 ? Math.ceil(remainingMs / 1000) : null)
    }

    updateCountdown()
    const intervalId = window.setInterval(updateCountdown, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [wsRetryWindowExpired, wsState])

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
        setWsRetryWindowExpired(false)
        setWsRetrySecondsRemaining(Math.ceil(WS_AUTO_RETRY_WINDOW_MS / 1000))
        dismissToast(WS_ERROR_TOAST_ID)
        void retryConnection()
      },
      durationMs: null,
    })
  }, [retryConnection, showToast, wsRetryWindowExpired, wsState])

  return (
    <>
      <div
        className={`session-init-shell ${hasSessionSelected ? 'session-init-shell-session' : 'session-init-shell-home'}`}
      >
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
              </div>

              <div className="session-toolbar__zone session-toolbar__zone--right">
                <TooltipProvider delayDuration={140}>
                  <div className="session-toolbar__extra-buttons" aria-label="Campaign actions">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="session-toolbar__icon-btn"
                          onClick={() => setShowCreateCampaignModal(true)}
                          disabled={isCreatingCampaign}
                          aria-label="Create campaign"
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">
                            add_circle
                          </span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" align="end">
                        Create Campaign
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="session-toolbar__icon-btn"
                          onClick={() => setShowJoinCampaignModal(true)}
                          disabled={isJoiningCampaign}
                          aria-label="Join campaign"
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">
                            group_add
                          </span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" align="end">
                        Join Campaign
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  <span className="session-toolbar__separator" aria-hidden="true" />

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="session-toolbar__icon-btn"
                        onClick={handleToggleTheme}
                        aria-label="Theme"
                      >
                        <Icon name={themeMode === 'dark' ? 'sun' : 'moon'} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="end">
                      Theme
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="session-toolbar__icon-btn"
                        onClick={() => setShowUserSettingsModal(true)}
                        aria-label="Settings"
                      >
                        <Icon name="settings" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="end">
                      Settings
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="session-toolbar__icon-btn session-toolbar__icon-btn--exit"
                        onClick={handleLogoff}
                        aria-label="Logoff"
                      >
                        <Icon name="logout" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="end">
                      Logoff
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className="session-toolbar__connection"
                        data-status-color={connectionStatus.statusColorKey}
                        aria-label={`Connection: ${connectionStatus.label}`}
                        role="status"
                      >
                        <span className="session-toolbar__connection-dot" aria-hidden="true" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent
                      side="bottom"
                      align="end"
                      className="session-toolbar__tooltip-content--status"
                    >
                      <div className="session-toolbar__status-tooltip-title">Status</div>
                      <div className="session-toolbar__status-tooltip-row">
                        <span>Core</span>
                        <strong
                          className={
                            connectionStatus.coreWsState === 'CONNECTED'
                              ? 'is-green'
                              : connectionStatus.coreWsState === 'CONNECTING'
                                ? 'is-yellow'
                                : 'is-red'
                          }
                        >
                          {connectionStatus.coreWsState}
                        </strong>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            <div className="session-card">
              <div className="session-card-header">
                <div>
                  <h3 className="session-card-title">Campaigns</h3>
                </div>
              </div>

              {isLoadingCampaigns ? (
                <div className="session-status-message">Loading campaigns...</div>
              ) : campaigns.length === 0 ? (
                <div className="session-status-message">No campaigns available yet.</div>
              ) : (
                <div className="session-campaign-grid" role="list" aria-label="Campaign list">
                  {campaigns.map((campaign) => {
                    const isSelected = selectedCampaignId === campaign.id
                    const state = getCampaignDisplayState(campaign)
                    const entryAction = getCampaignEntryAction(campaign)
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
                    const cardPosterUrl = campaign.posterUrl || undefined
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
                        className={`session-campaign-card ${isSelected ? 'is-selected' : ''} ${cardPosterUrl ? 'has-poster' : ''}`}
                        style={
                          cardPosterUrl
                            ? {
                                backgroundImage: `linear-gradient(rgba(12, 17, 28, 0.62), rgba(12, 17, 28, 0.62)), url(${cardPosterUrl})`,
                              }
                            : undefined
                        }
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
                                openCampaignSettingsModal(campaign.id)
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
                              if (entryAction.disabled) {
                                if (entryAction.reason) {
                                  setError(entryAction.reason)
                                }
                                return
                              }
                              void handleEnterCampaign(campaign.id)
                            }}
                            title={entryAction.reason || `${entryAction.label} campaign`}
                            aria-label={entryAction.reason || `${entryAction.label} campaign`}
                            disabled={entryAction.disabled}
                          >
                            <span>{entryAction.label}</span>
                            <span className="material-symbols-outlined" aria-hidden="true">
                              {entryAction.icon}
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
                  canStartSession={canStartFromGreenroom}
                  canPauseSession={canPauseFromActive}
                  canStopSession={canStopFromActive}
                  onStartSession={() => handleStartSession(currentSession.id)}
                  onPauseSession={() => handlePauseSession(currentSession.id)}
                  onStopSession={() => handleStopSession(currentSession.id)}
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
                  {view === 'chat' ? (
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
                      />
                    }
                    roomsPanel={renderCampaignScaffoldPanel(
                      'Groups',
                      'Voice group configuration is being rebuilt around campaign-level controls.',
                      [
                        'DM-only group management',
                        'Greenroom pre-create support',
                        'Group defaults and templates',
                        'Campaign routing and policy',
                      ]
                    )}
                    audioPanel={renderCampaignScaffoldPanel(
                      'Campaign Audio',
                      'Audio policy controls are being reduced to a cleaner campaign-first surface.',
                      [
                        'Default campaign audio policy',
                        'Environment and override presets',
                        'Broadcast and moderation policy',
                      ]
                    )}
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
                        onDmAutoTargetChange={setSettingsDmAutoTargetOnFirstPlayerJoin}
                        onSaveDmAutoTarget={() => {
                          if (selectedCampaignId)
                            void saveDmVoiceTargetingSetting(selectedCampaignId)
                        }}
                        isSaving={isDmVoiceTargetingSettingSaving}
                        isLoading={isDmVoiceTargetingSettingLoading}
                      />
                    }
                  />
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
              Create a campaign, return to the lobby with it selected, and continue to launch when
              you are ready.
            </p>
            {user.authType === 'GUEST' && (
              <p className="session-card-subtitle session-card-subtitle--warn">
                Guest access is campaign-scoped. Upgrade to a full account to create a new campaign.
              </p>
            )}
            <form onSubmit={handleCreateCampaign}>
              <label className="session-label" htmlFor="create-campaign-name">
                Campaign name
              </label>
              <input
                id="create-campaign-name"
                type="text"
                value={newCampaignName}
                onChange={(e) => setNewCampaignName(e.target.value)}
                placeholder="The Emerald Crown"
                className="session-input"
                disabled={isCreatingCampaign}
                required
              />
              <label className="session-label" htmlFor="create-campaign-description">
                Short description
              </label>
              <textarea
                id="create-campaign-description"
                value={newCampaignDescription}
                onChange={(e) => setNewCampaignDescription(e.target.value)}
                placeholder="Optional context for players before they continue into the campaign."
                className="session-textarea"
                disabled={isCreatingCampaign}
              />
              <div className="session-create-campaign-note" aria-label="Create campaign next steps">
                <p className="session-create-campaign-note__title">What happens next</p>
                <ul className="session-create-campaign-note__list">
                  <li>You become the campaign DM.</li>
                  <li>The new campaign appears selected in your lobby.</li>
                  <li>You can open settings or continue to launch from the campaign card.</li>
                </ul>
              </div>
              <div className="session-action-row">
                <button
                  type="submit"
                  disabled={
                    isCreatingCampaign || !newCampaignName.trim() || user.authType === 'GUEST'
                  }
                  className="session-button session-button-brand"
                >
                  {isCreatingCampaign ? 'Creating...' : 'Create Campaign and Continue'}
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
                value={joinInviteInput}
                onChange={(e) => setJoinInviteInput(e.target.value)}
                placeholder="Invite code or /join link"
                className="session-input"
                disabled={isJoiningCampaign}
                required
              />
              <div className="session-action-row">
                <button
                  type="submit"
                  disabled={isJoiningCampaign || !joinInviteInput.trim()}
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

      {showCampaignSettingsModal && (
        <div className="session-modal-backdrop" role="presentation">
          <div
            className="session-modal session-campaign-settings-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Campaign settings"
          >
            <div className="session-campaign-settings-header">
              <div>
                <h4 className="session-inline-form-title">Campaign Settings</h4>
                <p className="session-card-subtitle">
                  Manage metadata, poster, and invite links from the lobby.
                </p>
              </div>
              <div className="session-campaign-settings-header__actions">
                <button
                  type="submit"
                  form="campaign-settings-form"
                  className="session-icon-action"
                  title={isSettingsSaving ? 'Saving settings' : 'Save settings'}
                  aria-label={isSettingsSaving ? 'Saving settings' : 'Save settings'}
                  disabled={
                    settingsHomeTab !== 'home' ||
                    isSettingsSaving ||
                    !settingsData ||
                    !settingsName.trim()
                  }
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    {isSettingsSaving ? 'hourglass_top' : 'save'}
                  </span>
                </button>
                <button
                  type="button"
                  className="session-icon-action"
                  title="Close settings"
                  aria-label="Close settings"
                  onClick={() => setShowCampaignSettingsModal(false)}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    close
                  </span>
                </button>
              </div>
            </div>

            <div
              className="session-campaign-settings-tabs"
              role="tablist"
              aria-label="Settings home tabs"
            >
              <button
                type="button"
                role="tab"
                aria-selected={settingsHomeTab === 'home'}
                className={`session-campaign-settings-tab ${settingsHomeTab === 'home' ? 'is-active' : ''}`}
                onClick={() => setSettingsHomeTab('home')}
              >
                Home
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={settingsHomeTab === 'notes'}
                className={`session-campaign-settings-tab ${settingsHomeTab === 'notes' ? 'is-active' : ''}`}
                onClick={() => setSettingsHomeTab('notes')}
                disabled={!settingsReferenceSessionId}
              >
                Notes
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={settingsHomeTab === 'journal'}
                className={`session-campaign-settings-tab ${settingsHomeTab === 'journal' ? 'is-active' : ''}`}
                onClick={() => setSettingsHomeTab('journal')}
                disabled={!settingsReferenceSessionId}
              >
                Journal
              </button>
            </div>

            {settingsHomeTab === 'journal' && settingsCampaignSessions.length > 0 ? (
              <div className="session-campaign-settings-session-context">
                <label className="session-label" htmlFor="settings-session-context">
                  Session context
                </label>
                <select
                  id="settings-session-context"
                  className="session-input"
                  value={settingsReferenceSessionId}
                  onChange={(event) => setSettingsReferenceSessionId(event.target.value as UUID)}
                  disabled={!settingsCampaignSessions.length}
                >
                  {settingsCampaignSessions.length === 0 ? (
                    <option value="">No sessions available</option>
                  ) : (
                    [...settingsCampaignSessions].reverse().map((session) => (
                      <option key={session.id} value={session.id}>
                        {session.name} ({new Date(session.createdAt).toLocaleDateString()})
                      </option>
                    ))
                  )}
                </select>
                {settingsReferenceSession ? (
                  <p className="session-card-subtitle">
                    Working in {settingsReferenceSession.name} ({settingsReferenceSession.id}).
                  </p>
                ) : null}
              </div>
            ) : null}

            {isSettingsLoading ? (
              <div className="session-status-message">Loading campaign settings...</div>
            ) : !settingsData ? (
              <div className="session-status-message">Unable to load campaign settings.</div>
            ) : settingsHomeTab === 'notes' ? (
              renderCampaignScaffoldPanel(
                'Campaign Notes',
                'Notes are being transitioned to campaign-scoped authoring and sharing.',
                [
                  'Campaign notebook landing view',
                  'Handout permissions and targeting',
                  'Pinned references and templates',
                ]
              )
            ) : settingsHomeTab === 'journal' ? (
              renderCampaignScaffoldPanel(
                'Campaign Journal',
                settingsReferenceSessionId
                  ? `Session context available: ${settingsReferenceSession?.name || settingsReferenceSessionId}`
                  : 'No session context selected yet.',
                [
                  'Session recap flow and timeline anchors',
                  'DM editing guardrails',
                  'Player/spectator read visibility',
                ]
              )
            ) : (
              <div className="session-campaign-settings-grid session-campaign-settings-grid-dialog">
                <div className="session-campaign-settings-column">
                  {renderCampaignScaffoldPanel(
                    'Campaign Overview',
                    'Home now focuses on campaign metadata and policy, not session snapshots.',
                    [
                      'Campaign profile and branding',
                      'Invite and visibility controls',
                      'Participation and access policy',
                    ]
                  )}

                  <form
                    id="campaign-settings-form"
                    className="session-campaign-settings-panel"
                    onSubmit={handleSaveCampaignSettings}
                  >
                    <h5 className="session-inline-form-title">Campaign Profile</h5>

                    <label className="session-label" htmlFor="campaign-settings-name">
                      Name
                    </label>
                    <input
                      id="campaign-settings-name"
                      className="session-input"
                      type="text"
                      value={settingsName}
                      onChange={(e) => setSettingsName(e.target.value)}
                      disabled={isSettingsSaving}
                      required
                    />

                    <label className="session-label" htmlFor="campaign-settings-description">
                      Description
                    </label>
                    <textarea
                      id="campaign-settings-description"
                      className="session-textarea"
                      value={settingsDescription}
                      onChange={(e) => setSettingsDescription(e.target.value)}
                      rows={4}
                      disabled={isSettingsSaving}
                    />

                    <label className="session-label" htmlFor="campaign-settings-poster-file">
                      Upload poster
                    </label>
                    <input
                      id="campaign-settings-poster-file"
                      className="session-input"
                      type="file"
                      accept="image/*"
                      onChange={handlePosterFileSelected}
                      disabled={isSettingsSaving}
                    />

                    <p className="session-card-subtitle">
                      Poster appears muted behind the campaign card so text remains readable.
                    </p>
                  </form>

                  <section
                    className="session-campaign-settings-panel session-campaign-invite-panel"
                    aria-label="Invite links"
                  >
                    <h5 className="session-inline-form-title">Invite Links</h5>
                    <div className="session-invite-link-row">
                      <div className="session-invite-link-row__label">Player</div>
                      <div className="session-invite-link-row__input-wrap">
                        <input
                          className="session-invite-link-row__input"
                          type="text"
                          readOnly
                          value={`${window.location.origin}/join/${encodeURIComponent(settingsData.inviteCode)}`}
                          aria-label="Player invite URL"
                        />
                      </div>
                      <div className="session-invite-link-row__actions">
                        <button
                          type="button"
                          className="session-icon-action"
                          title="Copy player invite URL"
                          aria-label="Copy player invite URL"
                          onClick={() => void copyInviteUrl('PLAYER')}
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">
                            content_copy
                          </span>
                        </button>
                        <button
                          type="button"
                          className="session-icon-action"
                          title="Refresh player invite URL"
                          aria-label="Refresh player invite URL"
                          disabled={isInviteReissuing}
                          onClick={() => void reissueInvite('PLAYER')}
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">
                            refresh
                          </span>
                        </button>
                      </div>
                    </div>

                    <div className="session-invite-link-row">
                      <div className="session-invite-link-row__label">Spectator</div>
                      <div className="session-invite-link-row__input-wrap">
                        <input
                          className="session-invite-link-row__input"
                          type="text"
                          readOnly
                          value={
                            !settingsSpectatorsEnabled
                              ? ''
                              : settingsData.spectatorInviteCode
                                ? `${window.location.origin}/watch/${encodeURIComponent(settingsData.spectatorInviteCode)}`
                                : ''
                          }
                          aria-label="Spectator invite URL"
                          disabled={!settingsSpectatorsEnabled}
                        />
                      </div>
                      <div className="session-invite-link-row__actions">
                        <button
                          type="button"
                          className="session-icon-action"
                          title="Copy spectator invite URL"
                          aria-label="Copy spectator invite URL"
                          disabled={!settingsSpectatorsEnabled || !settingsData.spectatorInviteCode}
                          onClick={() => void copyInviteUrl('SPECTATOR')}
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">
                            content_copy
                          </span>
                        </button>
                        <button
                          type="button"
                          className="session-icon-action"
                          title="Refresh spectator invite URL"
                          aria-label="Refresh spectator invite URL"
                          disabled={!settingsSpectatorsEnabled || isInviteReissuing}
                          onClick={() => void reissueInvite('SPECTATOR')}
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">
                            refresh
                          </span>
                        </button>
                      </div>
                    </div>
                  </section>

                  <section
                    className="session-campaign-settings-panel"
                    aria-label="Character settings mirror"
                  >
                    <h5 className="session-inline-form-title">Character Settings</h5>
                    <p className="session-card-subtitle">
                      Mirrors the rightbar character settings for campaign-scoped character
                      defaults.
                    </p>

                    <div className="crbs-character-grid">
                      <label className="crbs-field" htmlFor="campaign-character-name">
                        <span className="crbs-field-label">Name</span>
                        <input
                          id="campaign-character-name"
                          type="text"
                          className="crbs-input"
                          value={characterSettingsDraft.name}
                          onChange={(event) =>
                            handleCharacterFieldChange('name', event.target.value)
                          }
                          disabled={
                            !canEditCharacterSettings ||
                            isCharacterSettingsLoading ||
                            isCharacterSettingsSaving
                          }
                        />
                      </label>
                      <label className="crbs-field" htmlFor="campaign-character-race">
                        <span className="crbs-field-label">Race</span>
                        <input
                          id="campaign-character-race"
                          type="text"
                          className="crbs-input"
                          value={characterSettingsDraft.race}
                          onChange={(event) =>
                            handleCharacterFieldChange('race', event.target.value)
                          }
                          disabled={
                            !canEditCharacterSettings ||
                            isCharacterSettingsLoading ||
                            isCharacterSettingsSaving
                          }
                        />
                      </label>
                      <label className="crbs-field" htmlFor="campaign-character-class">
                        <span className="crbs-field-label">Class</span>
                        <input
                          id="campaign-character-class"
                          type="text"
                          className="crbs-input"
                          value={characterSettingsDraft.className}
                          onChange={(event) =>
                            handleCharacterFieldChange('className', event.target.value)
                          }
                          disabled={
                            !canEditCharacterSettings ||
                            isCharacterSettingsLoading ||
                            isCharacterSettingsSaving
                          }
                        />
                      </label>
                      <label className="crbs-field" htmlFor="campaign-character-subclass">
                        <span className="crbs-field-label">Subclass</span>
                        <input
                          id="campaign-character-subclass"
                          type="text"
                          className="crbs-input"
                          value={characterSettingsDraft.subclass}
                          onChange={(event) =>
                            handleCharacterFieldChange('subclass', event.target.value)
                          }
                          disabled={
                            !canEditCharacterSettings ||
                            isCharacterSettingsLoading ||
                            isCharacterSettingsSaving
                          }
                        />
                      </label>
                      <label className="crbs-field" htmlFor="campaign-character-level">
                        <span className="crbs-field-label">Level</span>
                        <input
                          id="campaign-character-level"
                          type="number"
                          min={1}
                          max={20}
                          className="crbs-input"
                          value={characterSettingsDraft.level}
                          onChange={(event) =>
                            handleCharacterFieldChange('level', Number(event.target.value))
                          }
                          disabled={
                            !canEditCharacterSettings ||
                            isCharacterSettingsLoading ||
                            isCharacterSettingsSaving
                          }
                        />
                      </label>
                    </div>

                    {canEditCharacterSettings ? (
                      <div className="crbs-actions">
                        <button
                          type="button"
                          className="session-button"
                          disabled={
                            !selectedCampaignId ||
                            isCharacterSettingsLoading ||
                            isCharacterSettingsSaving
                          }
                          onClick={() => {
                            void saveCharacterSettings()
                          }}
                        >
                          {isCharacterSettingsSaving ? 'Saving…' : 'Save character settings'}
                        </button>
                      </div>
                    ) : (
                      <p className="crbs-muted">Character settings are read-only for spectators.</p>
                    )}
                  </section>
                </div>

                <section
                  className="session-campaign-settings-panel session-campaign-settings-panel--compact"
                  aria-label="Campaign settings controls"
                >
                  <h5 className="session-inline-form-title">Settings</h5>
                  <label className="session-label" htmlFor="campaign-settings-visibility">
                    Visibility
                  </label>
                  <div className="session-toggle-group" role="group" aria-label="Visibility">
                    <button
                      type="button"
                      className={`session-toggle-button ${settingsVisibility === 'PUBLIC' ? 'is-active' : ''}`}
                      aria-pressed={settingsVisibility === 'PUBLIC'}
                      onClick={() => setSettingsVisibility('PUBLIC')}
                      disabled={isSettingsSaving}
                    >
                      Public
                    </button>
                    <button
                      type="button"
                      className={`session-toggle-button ${settingsVisibility === 'PRIVATE' ? 'is-active' : ''}`}
                      aria-pressed={settingsVisibility === 'PRIVATE'}
                      onClick={() => setSettingsVisibility('PRIVATE')}
                      disabled={isSettingsSaving}
                    >
                      Private
                    </button>
                  </div>

                  <label className="session-label" htmlFor="campaign-settings-spectators">
                    Spectators
                  </label>
                  <div className="session-toggle-group" role="group" aria-label="Spectators">
                    <button
                      type="button"
                      className={`session-toggle-button ${settingsSpectatorsEnabled ? 'is-active' : ''}`}
                      aria-pressed={settingsSpectatorsEnabled}
                      onClick={() => setSettingsSpectatorsEnabled(true)}
                      disabled={isSettingsSaving}
                    >
                      ON
                    </button>
                    <button
                      type="button"
                      className={`session-toggle-button ${!settingsSpectatorsEnabled ? 'is-active' : ''}`}
                      aria-pressed={!settingsSpectatorsEnabled}
                      onClick={() => setSettingsSpectatorsEnabled(false)}
                      disabled={isSettingsSaving}
                    >
                      OFF
                    </button>
                  </div>

                  <label className="session-label" htmlFor="campaign-settings-spectator-max">
                    Max spectators: {settingsSpectatorMax}
                  </label>
                  <input
                    id="campaign-settings-spectator-max"
                    className="session-slider"
                    type="range"
                    min={5}
                    max={50}
                    step={5}
                    value={settingsSpectatorMax}
                    onChange={(event) => setSettingsSpectatorMax(Number(event.target.value))}
                    disabled={isSettingsSaving || !settingsSpectatorsEnabled}
                  />

                  <label className="session-label" htmlFor="campaign-settings-waitlist">
                    Spectator waitlist
                  </label>
                  <div
                    className="session-toggle-group"
                    role="group"
                    aria-label="Spectator waitlist"
                  >
                    <button
                      type="button"
                      className={`session-toggle-button ${settingsSpectatorWaitlistEnabled ? 'is-active' : ''}`}
                      aria-pressed={settingsSpectatorWaitlistEnabled}
                      onClick={() => setSettingsSpectatorWaitlistEnabled(true)}
                      disabled={isSettingsSaving || !settingsSpectatorsEnabled}
                    >
                      ON
                    </button>
                    <button
                      type="button"
                      className={`session-toggle-button ${!settingsSpectatorWaitlistEnabled ? 'is-active' : ''}`}
                      aria-pressed={!settingsSpectatorWaitlistEnabled}
                      onClick={() => setSettingsSpectatorWaitlistEnabled(false)}
                      disabled={isSettingsSaving || !settingsSpectatorsEnabled}
                    >
                      OFF
                    </button>
                  </div>

                  <label className="session-label" htmlFor="campaign-settings-reconnect-grace">
                    Spectator reconnect grace (seconds): {settingsSpectatorReconnectGraceSecs}
                  </label>
                  <input
                    id="campaign-settings-reconnect-grace"
                    className="session-slider"
                    type="range"
                    min={30}
                    max={90}
                    step={5}
                    value={settingsSpectatorReconnectGraceSecs}
                    onChange={(event) =>
                      setSettingsSpectatorReconnectGraceSecs(Number(event.target.value))
                    }
                    disabled={isSettingsSaving || !settingsSpectatorsEnabled}
                  />

                  <label className="session-label" htmlFor="campaign-settings-post-session-chat">
                    Post-session spectator chat
                  </label>
                  <div
                    className="session-toggle-group"
                    role="group"
                    aria-label="Post-session spectator chat"
                  >
                    <button
                      type="button"
                      className={`session-toggle-button ${settingsPostSessionChatEnabled ? 'is-active' : ''}`}
                      aria-pressed={settingsPostSessionChatEnabled}
                      onClick={() => setSettingsPostSessionChatEnabled(true)}
                      disabled={isSettingsSaving}
                    >
                      ON
                    </button>
                    <button
                      type="button"
                      className={`session-toggle-button ${!settingsPostSessionChatEnabled ? 'is-active' : ''}`}
                      aria-pressed={!settingsPostSessionChatEnabled}
                      onClick={() => setSettingsPostSessionChatEnabled(false)}
                      disabled={isSettingsSaving}
                    >
                      OFF
                    </button>
                  </div>

                  <label
                    className="session-label"
                    htmlFor="campaign-settings-post-session-duration"
                  >
                    Post-session duration: {settingsPostSessionChatDurationMinutes} min
                  </label>
                  <input
                    id="campaign-settings-post-session-duration"
                    className="session-slider"
                    type="range"
                    min={1}
                    max={60}
                    step={1}
                    value={settingsPostSessionChatDurationMinutes}
                    onChange={(event) =>
                      setSettingsPostSessionChatDurationMinutes(
                        toValidPostSessionDurationMinutes(event.target.value)
                      )
                    }
                    disabled={isSettingsSaving || !settingsPostSessionChatEnabled}
                  />
                  <p className="session-card-subtitle">
                    Default 5 minutes. Minimum 1 minute, maximum 60 minutes.
                  </p>

                  <label
                    className="session-label"
                    htmlFor="campaign-settings-extension-sync-policy"
                  >
                    Extension sync policy
                  </label>
                  <div
                    className="session-toggle-group"
                    role="group"
                    aria-label="Extension sync policy"
                  >
                    <button
                      type="button"
                      className={`session-toggle-button ${settingsExtensionSyncPolicy === 'ALLOW' ? 'is-active' : ''}`}
                      aria-pressed={settingsExtensionSyncPolicy === 'ALLOW'}
                      onClick={() => setSettingsExtensionSyncPolicy('ALLOW')}
                      disabled={isSettingsSaving || !settingsSpectatorsEnabled}
                    >
                      ALLOW
                    </button>
                    <button
                      type="button"
                      className={`session-toggle-button ${settingsExtensionSyncPolicy === 'DM_ONLY' ? 'is-active' : ''}`}
                      aria-pressed={settingsExtensionSyncPolicy === 'DM_ONLY'}
                      onClick={() => setSettingsExtensionSyncPolicy('DM_ONLY')}
                      disabled={isSettingsSaving || !settingsSpectatorsEnabled}
                    >
                      DM_ONLY
                    </button>
                    <button
                      type="button"
                      className={`session-toggle-button ${settingsExtensionSyncPolicy === 'NONE' ? 'is-active' : ''}`}
                      aria-pressed={settingsExtensionSyncPolicy === 'NONE'}
                      onClick={() => setSettingsExtensionSyncPolicy('NONE')}
                      disabled={isSettingsSaving || !settingsSpectatorsEnabled}
                    >
                      NONE
                    </button>
                  </div>

                  <label className="session-label" htmlFor="campaign-settings-late-join-policy">
                    Late join policy
                  </label>
                  <div className="session-toggle-group" role="group" aria-label="Late join policy">
                    <button
                      type="button"
                      className={`session-toggle-button ${settingsLateJoinPolicy === 'OPEN' ? 'is-active' : ''}`}
                      aria-pressed={settingsLateJoinPolicy === 'OPEN'}
                      onClick={() => setSettingsLateJoinPolicy('OPEN')}
                      disabled={isSettingsSaving}
                    >
                      OPEN
                    </button>
                    <button
                      type="button"
                      className={`session-toggle-button ${settingsLateJoinPolicy === 'SCREENED' ? 'is-active' : ''}`}
                      aria-pressed={settingsLateJoinPolicy === 'SCREENED'}
                      onClick={() => setSettingsLateJoinPolicy('SCREENED')}
                      disabled={isSettingsSaving}
                    >
                      SCREENED
                    </button>
                    <button
                      type="button"
                      className={`session-toggle-button ${settingsLateJoinPolicy === 'BLOCKED' ? 'is-active' : ''}`}
                      aria-pressed={settingsLateJoinPolicy === 'BLOCKED'}
                      onClick={() => setSettingsLateJoinPolicy('BLOCKED')}
                      disabled={isSettingsSaving}
                    >
                      BLOCKED
                    </button>
                  </div>

                  <label className="session-label" htmlFor="campaign-settings-late-join-grace">
                    Late join grace (minutes): {settingsLateJoinGraceMinutes}
                  </label>
                  <input
                    id="campaign-settings-late-join-grace"
                    className="session-slider"
                    type="range"
                    min={30}
                    max={90}
                    step={10}
                    value={settingsLateJoinGraceMinutes}
                    onChange={(event) =>
                      setSettingsLateJoinGraceMinutes(Number(event.target.value))
                    }
                    disabled={isSettingsSaving || settingsLateJoinPolicy === 'OPEN'}
                  />
                </section>
              </div>
            )}
          </div>
        </div>
      )}

      <DialogPrimitive.Root open={showUserSettingsModal} onOpenChange={setShowUserSettingsModal}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="session-modal-backdrop session-modal-backdrop--overlay" />
          <DialogPrimitive.Content
            className="session-modal session-user-settings-modal session-modal--floating"
            aria-label="User settings"
          >
            <h4 className="session-inline-form-title">User Settings</h4>
            <SessionUserSettingsPanel
              messageGroupingWindowMs={messageGroupingWindowMs}
              onMessageGroupingWindowChange={setMessageGroupingWindowMs}
              apiUrl={apiUrl}
              token={token}
              userId={user.id}
              username={user.username}
            />
            <div className="session-action-row">
              <DialogPrimitive.Close asChild>
                <button type="button" className="session-button session-button-neutral">
                  Close
                </button>
              </DialogPrimitive.Close>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {showExitSessionModal && (
        <div className="session-modal-backdrop" role="presentation">
          <div className="session-modal" role="dialog" aria-modal="true" aria-label="Exit session">
            <h4 className="session-inline-form-title">Leave Session</h4>
            {user.authType === 'GUEST' ? (
              <>
                <p className="session-card-subtitle">
                  You are on a guest account. Add a password now to upgrade before exit, or skip to
                  sign out. Skipping requires using your invite URL again to return.
                </p>

                <label className="session-label" htmlFor="exit-upgrade-password">
                  Password to upgrade account
                </label>
                <input
                  id="exit-upgrade-password"
                  type="password"
                  className="session-input"
                  value={exitUpgradePassword}
                  onChange={(event) => setExitUpgradePassword(event.target.value)}
                  autoComplete="new-password"
                  disabled={exitUpgradeLoading}
                />

                {exitUpgradeError ? (
                  <p className="session-card-subtitle">{exitUpgradeError}</p>
                ) : null}

                <div className="session-action-row">
                  <button
                    type="button"
                    className="session-button session-button-neutral"
                    onClick={() => setShowExitSessionModal(false)}
                    disabled={exitUpgradeLoading}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="session-button session-button-warn"
                    onClick={handleSkipGuestUpgrade}
                    disabled={exitUpgradeLoading}
                  >
                    Skip
                  </button>
                  <button
                    type="button"
                    className="session-button session-button-success"
                    onClick={() => {
                      void handleUpgradeAndExit()
                    }}
                    disabled={exitUpgradeLoading || !exitUpgradePassword.trim()}
                  >
                    {exitUpgradeLoading ? 'Upgrading...' : 'Upgrade and Exit'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="session-card-subtitle">
                  Leave this session and return to the campaign selector? Unsaved local UI state may
                  be lost.
                </p>
                <div className="session-action-row">
                  <button
                    type="button"
                    className="session-button session-button-neutral"
                    onClick={() => setShowExitSessionModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="session-button session-button-primary"
                    onClick={handleConfirmExitAsFullAccount}
                  >
                    OK
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showStopSessionModal && (
        <div
          className="session-modal-backdrop"
          role="presentation"
          onClick={() => setShowStopSessionModal(false)}
        >
          <div
            className="session-modal"
            role="dialog"
            aria-modal="true"
            aria-label="End session"
            onClick={(event) => event.stopPropagation()}
          >
            <h4 className="session-inline-form-title">End Session</h4>
            <p className="session-card-subtitle">
              End this session now? This closes the current chapter for everyone and moves players
              back to greenroom/offline state.
            </p>
            <div className="session-action-row">
              <button
                type="button"
                className="session-button session-button-neutral"
                onClick={() => setShowStopSessionModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="session-button session-button-warn"
                onClick={() => {
                  void handleConfirmStopSession()
                }}
              >
                End Session
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
