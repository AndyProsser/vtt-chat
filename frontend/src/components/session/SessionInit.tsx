/**
 * Session Initialization
 * Component for creating a new session and transitioning to active state.
 * Tests the full UI → Event → Store pipeline.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SessionState, Role, MessageType } from '@shared'
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
import { AudioPanel } from '../audio/AudioPanel'
import { NotesRailPanel } from './NotesRailPanel'
import { SearchPanel } from './SearchPanel'
import { JournalPanel } from './JournalPanel'
import { HistoryPanel } from './HistoryPanel'
import { Icon } from '../ui/Icon'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../core-ui'
import { useToast } from '../../hooks/useToast'
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
const MAX_POSTER_WIDTH_PX = 1024
const MAX_POSTER_DATA_URL_CHARS = 350_000
const SYSTEM_MESSAGE_AUTHOR_ID = '00000000-0000-0000-0000-000000000000' as UUID
const SESSION_SUMMARY_TAG = 'session-summary'
const SESSION_SUMMARY_TITLE = 'Session Summary'
const DEFAULT_GREENROOM_CACHE_TTL_MS = 60 * 60 * 1000
const SESSION_BOOKEND_PREFIXES = [
  'Session Start:',
  'Session End:',
  '[Session Started]',
  '[Session Ended]',
  '[Session Paused]',
  '[Session Resumed]',
] as const

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

type PendingSessionBookend = {
  content: string
  timestamp: number
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

  if (state === SessionState.IDLE || state === SessionState.ENDED) {
    const greenRooms = rooms.filter((room) => isGreenRoom(room))
    return greenRooms.length ? greenRooms : rooms
  }

  if (state === SessionState.ACTIVE || state === SessionState.PAUSED) {
    return rooms
  }

  return rooms
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

export function SessionInit({ apiUrl, wsUrl, token, user, onSessionCreated }: SessionInitProps) {
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
  const pendingSessionBookendsBySessionIdRef = useRef<Map<UUID, PendingSessionBookend[]>>(new Map())
  const greenroomCleanupTimerRef = useRef<number | null>(null)

  // WebSocket connection
  const { state: wsState, error: wsError } = useWebSocket({
    url: wsUrl,
    token,
    enabled: !!token,
  })

  // Store
  const sessions = useStore((state) => state.sessions)
  const currentSessionId = useStore((state) => state.currentSessionId)
  const isGreenroom = useStore((state) => state.isGreenroom)
  const rooms = useStore((state) => state.rooms)
  const sessionPresence = useStore((state) => state.sessionPresence)
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
  const setCurrentSession = useStore((state) => state.setCurrentSession)
  const setIsGreenroom = useStore((state) => state.setIsGreenroom)
  const resetToolbarActionsState = useStore((state) => state.resetToolbarActionsState)
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

  const getSessionBookendRoomIds = useCallback(
    (sessionId: UUID): UUID[] => {
      const sessionRooms = Object.values(typedRoomsBySession[sessionId] || {})
      const sourceRooms =
        sessionRooms.length > 0
          ? sessionRooms
          : currentSession?.id === sessionId
            ? currentRooms
            : []

      if (!sourceRooms.length) {
        return []
      }

      const targetIds = new Set<UUID>()

      for (const room of sourceRooms) {
        if (room.type === RoomType.MAIN || isGreenRoom(room)) {
          targetIds.add(room.id)
        }
      }

      return Array.from(targetIds)
    },
    [currentRooms, currentSession, typedRoomsBySession]
  )

  const writeSessionBookendMessages = useCallback(
    (sessionId: UUID, content: string, timestamp: number): boolean => {
      const roomIds = getSessionBookendRoomIds(sessionId)
      if (!roomIds.length) {
        return false
      }

      const existingSessionMessages = Object.values(
        (useStore.getState().messages as Record<UUID, Record<UUID, Message>>)[sessionId] || {}
      )

      for (const roomId of roomIds) {
        const hasExistingBookend = existingSessionMessages.some(
          (message) =>
            message.roomId === roomId &&
            message.type === MessageType.SYSTEM &&
            message.content === content
        )

        if (hasExistingBookend) {
          continue
        }

        addMessage(sessionId, {
          id: crypto.randomUUID() as UUID,
          roomId,
          authorId: SYSTEM_MESSAGE_AUTHOR_ID,
          authorUsername: 'SYSTEM',
          content,
          type: MessageType.SYSTEM,
          isDmOnly: false,
          createdAt: timestamp,
        })
      }

      return true
    },
    [addMessage, getSessionBookendRoomIds]
  )

  const appendSessionBookendMessages = useCallback(
    (sessionId: UUID, nextState: SessionState, previousState?: SessionState | 'ENDED' | null) => {
      if (
        nextState !== SessionState.ACTIVE &&
        nextState !== SessionState.PAUSED &&
        nextState !== SessionState.ENDED
      ) {
        return
      }

      const sessionName =
        (currentSession?.id === sessionId ? currentSession.name : typedSessions[sessionId]?.name) ||
        'Session'

      const content =
        nextState === SessionState.ACTIVE
          ? previousState === SessionState.PAUSED
            ? `[Session Resumed] ${sessionName}`
            : `[Session Started] ${sessionName}`
          : nextState === SessionState.PAUSED
            ? `[Session Paused] ${sessionName}`
            : `[Session Ended] ${sessionName}`

      const timestamp = Date.now()
      const didWrite = writeSessionBookendMessages(sessionId, content, timestamp)

      if (didWrite) {
        return
      }

      const pending = pendingSessionBookendsBySessionIdRef.current.get(sessionId) || []
      pendingSessionBookendsBySessionIdRef.current.set(sessionId, [
        ...pending,
        { content, timestamp },
      ])
    },
    [currentSession, typedSessions, writeSessionBookendMessages]
  )

  useEffect(() => {
    if (!pendingSessionBookendsBySessionIdRef.current.size) {
      return
    }

    for (const [sessionId, entries] of Array.from(pendingSessionBookendsBySessionIdRef.current)) {
      const remaining: PendingSessionBookend[] = []

      for (const entry of entries) {
        const didWrite = writeSessionBookendMessages(sessionId, entry.content, entry.timestamp)

        if (!didWrite) {
          remaining.push(entry)
        }
      }

      if (remaining.length) {
        pendingSessionBookendsBySessionIdRef.current.set(sessionId, remaining)
      } else {
        pendingSessionBookendsBySessionIdRef.current.delete(sessionId)
      }
    }
  }, [currentSession, currentRooms, typedRoomsBySession, writeSessionBookendMessages])

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
            const response = await fetch(
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

      const sessionMessages =
        Object.values(
          (useStore.getState().messages as Record<UUID, Record<UUID, Message>>)[sessionId] || {}
        ) || []

      const existingSignatures = new Set(
        sessionMessages
          .filter((message) => Boolean(message.roomId) && targetRoomIds.includes(message.roomId!))
          .map(
            (message) => `${message.roomId}:${message.authorId}:${message.type}:${message.content}`
          )
      )

      const uniqueBookends = new Map<string, Message>()
      for (const message of recoveredBookends) {
        const signature = `${message.authorId}:${message.type}:${message.content}`
        if (!uniqueBookends.has(signature)) {
          uniqueBookends.set(signature, message)
        }
      }

      for (const message of uniqueBookends.values()) {
        for (const roomId of targetRoomIds) {
          const roomSignature = `${roomId}:${message.authorId}:${message.type}:${message.content}`
          if (existingSignatures.has(roomSignature)) {
            continue
          }

          addMessage(sessionId, {
            ...message,
            id: crypto.randomUUID() as UUID,
            roomId,
          })
          existingSignatures.add(roomSignature)
        }
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

    const sourceSessionMessages = Object.values(typedMessagesBySession[fromSessionId] || {})
    // Carry only durable session markers across sessions.
    // Regular greenroom chat is intentionally ephemeral.
    const bookendsFromAnyRoom = sourceSessionMessages.filter(
      (message) => message.type === MessageType.SYSTEM && isSessionBookendMessage(message.content)
    )

    const fromMessages = [...bookendsFromAnyRoom].sort(
      (left, right) => left.createdAt - right.createdAt
    )

    if (!fromMessages.length) {
      pendingGreenroomCarryBySessionIdRef.current.delete(currentSession.id)
      return
    }

    const targetMessages = Object.values(typedMessagesBySession[currentSession.id] || {})
    const targetSignatures = new Set(
      targetMessages
        .filter((message) => message.roomId === targetGreenroom.id)
        .map(
          (message) =>
            `${message.authorId}:${message.type}:${message.content}:${message.isDmOnly}:${message.createdAt}`
        )
    )

    for (const source of fromMessages) {
      const signature = `${source.authorId}:${source.type}:${source.content}:${source.isDmOnly}:${source.createdAt}`
      if (targetSignatures.has(signature)) {
        continue
      }

      addMessage(currentSession.id, {
        ...source,
        id: crypto.randomUUID() as UUID,
        roomId: targetGreenroom.id,
        createdAt: source.createdAt,
      })
      targetSignatures.add(signature)
    }

    pendingGreenroomCarryBySessionIdRef.current.delete(currentSession.id)
  }, [addMessage, currentRooms, currentSession, typedMessagesBySession, typedRoomsBySession])

  const loadCampaignSettings = useCallback(
    async (campaignId: UUID) => {
      setIsSettingsLoading(true)
      setError(null)

      try {
        const response = await fetch(`${apiUrl}/api/campaigns/${campaignId}/settings`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.message || 'Failed to load campaign settings')
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
        setSettingsLateJoinPolicy(payload.campaign.lateJoinPolicy)
        setSettingsLateJoinGraceMinutes(payload.campaign.lateJoinGraceMinutes)
        setSettingsPosterUrl(payload.campaign.posterUrl || '')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load campaign settings'
        setError(message)
      } finally {
        setIsSettingsLoading(false)
      }
    },
    [apiUrl, token]
  )

  const fetchCampaignSessions = useCallback(
    async (campaignId: UUID): Promise<SessionRecord[]> => {
      const response = await fetch(`${apiUrl}/api/campaigns/${campaignId}/sessions`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.message || 'Failed to load campaign sessions')
      }

      const data = (await response.json()) as { sessions?: SessionRecord[] }
      return Array.isArray(data.sessions) ? data.sessions : []
    },
    [apiUrl, token]
  )

  const loadCampaignSettingsSessionContext = useCallback(
    async (campaignId: UUID) => {
      try {
        const sessions = await fetchCampaignSessions(campaignId)
        setSettingsCampaignSessions(sessions)
        const latestSession = getLatestSessionChronologically(sessions)
        setSettingsReferenceSessionId(latestSession?.id || '')
      } catch {
        setSettingsCampaignSessions([])
        setSettingsReferenceSessionId('')
      }
    },
    [fetchCampaignSessions]
  )

  const openCampaignSettingsModal = useCallback(
    (campaignId: UUID) => {
      setSettingsCampaignId(campaignId)
      setSettingsHomeTab('home')
      setShowCampaignSettingsModal(true)
      void loadCampaignSettings(campaignId)
      void loadCampaignSettingsSessionContext(campaignId)
    },
    [loadCampaignSettings, loadCampaignSettingsSessionContext]
  )

  const ensureSessionMembership = useCallback(
    async (sessionId: UUID) => {
      try {
        const response = await fetch(`${apiUrl}/api/v1/session/${sessionId}/members/join`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

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

      const response = await fetch(`${apiUrl}/api/v1/audio/broadcast/state`, {
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
        const response = await fetch(`${apiUrl}/api/notes/${settingsReferenceSessionId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })

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
          fetch(`${apiUrl}/api/v1/rooms/session/${currentSession.id}`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }),
          fetch(`${apiUrl}/api/v1/presence/${currentSession.id}`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }),
          fetch(`${apiUrl}/api/v1/audio/sessions/${currentSession.id}/state`, {
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

        // Atomic: both rooms and presence replace in a single store update.
        replaceSessionTopology(currentSession.id, nextRooms, nextPresence)

        // On session enter/reconnect, recover session markers from persisted chat history
        // and mirror them across main + greenroom for consistent chronology after refresh.
        void restoreSessionBookendsFromHistory(currentSession.id, nextRooms)

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
        fetch(`${apiUrl}/api/v1/presence/${currentSession.id}/recover`, {
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
    token,
    wsState,
    replaceSessionTopology,
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

    const connectedCount = currentPresence.filter(
      (presence) => presence.state !== PresenceState.IDLE
    ).length

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

      const validateResponse = await fetch(
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

      const response = await fetch(`${apiUrl}/api/campaigns/${campaignId}/join`, {
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
    async (campaignId?: UUID) => {
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

      const preferredSession = getPreferredSession(targetSessions)

      if (preferredSession) {
        await ensureSessionMembership(preferredSession.id)
        setCurrentSession(preferredSession.id)
        return
      }

      const canStartAsDm =
        targetCampaign?.currentDmId === user.id && targetCampaign?.memberRole === 'DM'

      if (!canStartAsDm) {
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
            name: buildDefaultChapterName(targetSessions),
          }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.message || 'Failed to start campaign chapter')
        }

        const payload = (await response.json()) as { session: SessionRecord }
        await ensureSessionMembership(payload.session.id)
        replaceSessions([payload.session, ...targetSessions])
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

    const pendingAutoEnterCampaignId = sessionStorage.getItem(LOBBY_AUTO_ENTER_CAMPAIGN_STORAGE_KEY)

    if (!pendingAutoEnterCampaignId) {
      return
    }

    const pendingCampaign = campaigns.find((campaign) => campaign.id === pendingAutoEnterCampaignId)

    sessionStorage.removeItem(LOBBY_AUTO_ENTER_CAMPAIGN_STORAGE_KEY)

    if (!pendingCampaign) {
      return
    }

    lobbyAutoEnterTriggeredRef.current = true
    const timeoutId = window.setTimeout(() => {
      void handleEnterCampaign(pendingCampaign.id)
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [campaigns, currentSessionId, handleEnterCampaign, isLoadingCampaigns])

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
      lateJoinPolicy: settingsLateJoinPolicy,
      lateJoinGraceMinutes: settingsLateJoinPolicy === 'OPEN' ? 30 : settingsLateJoinGraceMinutes,
    }

    try {
      const response = await fetch(`${apiUrl}/api/campaigns/${settingsCampaignId}/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(normalizedPayload),
      })

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
      const response = await fetch(
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
    window.localStorage.setItem('vtt-theme-mode', nextTheme)
    setThemeMode(nextTheme)
  }

  const handleLogoff = () => {
    if (currentSession && currentSession.dmId !== user.id) {
      void fetch(`${apiUrl}/api/v1/session/${currentSession.id}/members/leave`, {
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
        const response = await fetch(`${apiUrl}/api/campaigns/${campaignId}/sessions/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: buildDefaultChapterName(existingSessions),
          }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.message || 'Failed to start campaign chapter')
        }

        const payload = (await response.json()) as { session: SessionRecord }
        await ensureSessionMembership(payload.session.id)
        replaceSessions([payload.session, ...existingSessions])
        if (options?.carryFromSessionId) {
          scheduleGreenroomCarry(options.carryFromSessionId, payload.session.id)
        }
        setCurrentSession(payload.session.id)
        onSessionCreated?.(payload.session.id)

        if (options?.autoActivate) {
          const transitionResponse = await fetch(
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
          updateSession(payload.session.id, activeSession)
          appendSessionBookendMessages(
            payload.session.id,
            SessionState.ACTIVE,
            payload.session.state
          )
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
      appendSessionBookendMessages,
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

    const previousState =
      (currentSession?.id === sessionId ? currentSession.state : typedSessions[sessionId]?.state) ||
      null

    try {
      const response = await fetch(`${apiUrl}/api/v1/session/${sessionId}/state`, {
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

      appendSessionBookendMessages(sessionId, state, previousState)
      if (state === SessionState.ENDED || state === SessionState.IDLE) {
        setSelectedRoomIdOverride('')
        resetToolbarActionsState()
      }

      setIsGreenroom(state === SessionState.IDLE || state === SessionState.ENDED)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred'
      setError(message)
    }
  }

  const returnToCampaignSelector = async () => {
    if (currentSession && currentSession.dmId !== user.id) {
      try {
        await fetch(`${apiUrl}/api/v1/session/${currentSession.id}/members/leave`, {
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
  }

  const logoutToAuthScreen = () => {
    sessionStorage.removeItem('authToken')
    sessionStorage.removeItem('user')
    window.location.assign('/')
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
      const response = await fetch(`${apiUrl}/api/v1/auth/upgrade`, {
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
  const connectedSpectatorsCount = selectedCampaign?.connectedSpectatorsRounded ?? 0
  const liveConnectedPresenceCount = currentPresence.filter(
    (presence) => presence.state !== PresenceState.IDLE
  ).length
  const hasLivePresence = currentSession !== null && currentPresence.length > 0
  const connectedPlayersWithDm = hasLivePresence
    ? Math.max(0, liveConnectedPresenceCount - connectedSpectatorsCount)
    : selectedCampaign?.connectedPlayersRounded !== undefined || selectedCampaign?.connectedPlayers
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

  return (
    <>
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
              renderToolbar={(actions) => (
                <SessionToolbar
                  actions={actions}
                  statusColorKey={connectionStatus.statusColorKey}
                  statusLabel={connectionStatus.label}
                  coreWsState={connectionStatus.coreWsState}
                  livekitState={connectionStatus.livekitState}
                  sessionState={currentSession.state}
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
                    sessionState={currentSession.state}
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
                if (tab === 'information') {
                  return renderCampaignScaffoldPanel(
                    'Campaign Information',
                    'Read-only during live sessions. Edit campaign metadata from the home screen settings modal only.',
                    [
                      'Campaign overview and metadata (read-only)',
                      'Campaign notes and references',
                      'Policy and visibility guidance',
                    ]
                  )
                }

                if (tab === 'rooms') {
                  return renderCampaignScaffoldPanel(
                    'Groups',
                    'Voice group configuration is being rebuilt around campaign-level controls.',
                    [
                      'DM-only group management',
                      'Greenroom pre-create support',
                      'Group defaults and templates',
                      'Campaign routing and policy',
                    ]
                  )
                }

                if (tab === 'audio') {
                  return renderCampaignScaffoldPanel(
                    'Campaign Audio',
                    'Audio policy controls are being reduced to a cleaner campaign-first surface.',
                    [
                      'Default campaign audio policy',
                      'Environment and override presets',
                      'Broadcast and moderation policy',
                    ]
                  )
                }

                if (tab === 'search') {
                  return (
                    <SearchPanel
                      apiUrl={apiUrl}
                      token={token}
                      sessionId={currentSession.id}
                      role={effectiveSessionRole}
                      rooms={visibleRooms.map((room) => ({
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
                      role={effectiveSessionRole}
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
                      role={effectiveSessionRole}
                      userId={user.id}
                    />
                  )
                }

                if (tab === 'history') {
                  return (
                    <HistoryPanel
                      apiUrl={apiUrl}
                      token={token}
                      sessionId={currentSession.id}
                      role={effectiveSessionRole}
                      userId={user.id}
                    />
                  )
                }

                if (tab === 'settings') {
                  return renderCampaignScaffoldPanel(
                    'Campaign Settings',
                    'Locked while in a campaign. Use home screen settings to update campaign metadata and policy.',
                    [
                      'In-session settings are view-only',
                      'Campaign metadata and invite policy (home screen only)',
                      'Profile and personal preferences',
                    ]
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

      {showUserSettingsModal && (
        <div className="session-modal-backdrop" role="presentation">
          <div
            className="session-modal session-user-settings-modal"
            role="dialog"
            aria-modal="true"
            aria-label="User settings"
          >
            <h4 className="session-inline-form-title">User Settings</h4>
            <SessionUserSettingsPanel
              messageGroupingWindowMs={messageGroupingWindowMs}
              onMessageGroupingWindowChange={setMessageGroupingWindowMs}
            />
            <div className="session-action-row">
              <button
                type="button"
                className="session-button session-button-neutral"
                onClick={() => setShowUserSettingsModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

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
