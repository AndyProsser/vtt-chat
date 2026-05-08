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
import { Icon } from '../ui/Icon'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../core-ui'
import { useToast } from '../../hooks/useToast'
import { isGreenRoomName, ROOM_NAMES } from '../../constants/roomPresence.constants'
import { createHttpTelemetryTransport, telemetryClient } from '../../utils/telemetry'
import { FRONTEND_THEME_CLASSES, type FrontendThemeMode } from '../../tokens'
import type { Session as SessionRecord } from '@/types/session'
import type { Note } from '@/types/notes'
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
    const mainRooms = rooms.filter((room) => room.type === RoomType.MAIN)
    return mainRooms.length ? mainRooms : rooms
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
  const [exitUpgradePassword, setExitUpgradePassword] = useState('')
  const [exitUpgradeLoading, setExitUpgradeLoading] = useState(false)
  const [exitUpgradeError, setExitUpgradeError] = useState<string | null>(null)
  const [showCampaignSettingsModal, setShowCampaignSettingsModal] = useState(false)
  const [settingsCampaignId, setSettingsCampaignId] = useState<UUID | ''>('')
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
  const lastHydratedSessionIdRef = useRef<UUID | null>(null)

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
  const addMessage = useStore((state) => state.addMessage)
  const sessionTransitionNotice = useStore((state) => state.sessionTransitionNotice)
  const dmOverrides = useStore((state) => state.dmOverrides)
  const broadcastModeEnabled = useStore((state) => state.broadcastModeEnabled)
  const setBroadcastState = useStore((state) => state.setBroadcastState)
  const setEnvironment = useStore((state) => state.setEnvironment)
  const roomEnvironmentNames = useStore((state) => state.roomEnvironmentNames)
  const replaceRoomEnvironmentNames = useStore((state) => state.replaceRoomEnvironmentNames)
  const clearRoomEnvironmentName = useStore((state) => state.clearRoomEnvironmentName)
  const replaceDMOverrides = useStore((state) => state.replaceDMOverrides)
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

  const getSessionBookendRoomIds = useCallback((): UUID[] => {
    const targetIds = new Set<UUID>()

    for (const room of currentRooms) {
      if (room.type === RoomType.MAIN || isGreenRoom(room)) {
        targetIds.add(room.id)
      }
    }

    if (targetIds.size === 0 && selectedRoomId) {
      targetIds.add(selectedRoomId)
    }

    return Array.from(targetIds)
  }, [currentRooms, selectedRoomId])

  const appendSessionBookendMessages = useCallback(
    (sessionId: UUID, nextState: SessionState) => {
      if (nextState !== SessionState.ACTIVE && nextState !== SessionState.ENDED) {
        return
      }

      const timestamp = Date.now()
      const label = nextState === SessionState.ACTIVE ? 'Session Start' : 'Session End'
      const content = `${label}: ${formatSessionBookendTimestamp(timestamp)}`

      for (const roomId of getSessionBookendRoomIds()) {
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
    },
    [addMessage, getSessionBookendRoomIds]
  )

  const appendMissingPreviousSummaryNote = useCallback(
    async (sessionId: UUID) => {
      const previousSession = sessionList.find((candidate) => candidate.id !== sessionId)
      if (!previousSession) {
        return
      }

      const localPreviousNotes = Object.values(typedNotesBySession[previousSession.id] || {})
      let hasSummary = localPreviousNotes.some(
        (note) => Array.isArray(note.tags) && note.tags.includes(SESSION_SUMMARY_TAG)
      )

      if (!hasSummary) {
        try {
          const response = await fetch(`${apiUrl}/api/notes/${previousSession.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          })

          if (response.ok) {
            const data = await response.json().catch(() => ({}))
            const fetchedNotes = Array.isArray(data?.notes) ? data.notes : []
            hasSummary = fetchedNotes.some(
              (note: any) => Array.isArray(note?.tags) && note.tags.includes(SESSION_SUMMARY_TAG)
            )
          }
        } catch {
          // Best effort: if the summary lookup fails, skip injecting a possibly incorrect reminder.
          return
        }
      }

      if (hasSummary) {
        return
      }

      const timestamp = Date.now()
      const content = 'Session Note: No previous session summary available.'

      for (const roomId of getSessionBookendRoomIds()) {
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
    },
    [addMessage, apiUrl, getSessionBookendRoomIds, sessionList, token, typedNotesBySession]
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

  const openCampaignSettingsModal = useCallback(
    (campaignId: UUID) => {
      setSettingsCampaignId(campaignId)
      setShowCampaignSettingsModal(true)
      void loadCampaignSettings(campaignId)
    },
    [loadCampaignSettings]
  )

  const fetchCampaignSessions = useCallback(
    async (campaignId: UUID): Promise<SessionRecord[]> => {
      const response = await fetch(`${apiUrl}/api/campaigns/${campaignId}/sessions`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to load campaign sessions')
      }

      const data = await response.json()
      return (data.sessions || []) as SessionRecord[]
    },
    [apiUrl, token]
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
      lastHydratedSessionIdRef.current = null
      return
    }

    const sessionChanged = lastHydratedSessionIdRef.current !== currentSession.id
    const isReconnect = wsState === 'connected' && prev !== 'connected'

    if (!sessionChanged && !isReconnect) {
      return
    }

    lastHydratedSessionIdRef.current = currentSession.id

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
    setBroadcastState,
    setEnvironment,
    replaceRoomEnvironmentNames,
    replaceDMOverrides,
  ])

  useEffect(() => {
    if (!currentSession || currentRooms.length === 0) {
      return
    }

    if (currentSession.state === SessionState.ACTIVE) {
      const mainRoom = currentRooms.find((room) => room.type === RoomType.MAIN)
      if (mainRoom) {
        clearRoomEnvironmentName(mainRoom.id)
      }
      return
    }

    if (
      currentSession.state === SessionState.IDLE ||
      currentSession.state === SessionState.PAUSED
    ) {
      const greenRoom = currentRooms.find((room) => isGreenRoom(room))
      if (greenRoom) {
        clearRoomEnvironmentName(greenRoom.id)
      }
    }
  }, [clearRoomEnvironmentName, currentRooms, currentSession])

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
      options?: { autoActivate?: boolean }
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
          appendSessionBookendMessages(payload.session.id, SessionState.ACTIVE)
          void appendMissingPreviousSummaryNote(payload.session.id)
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
      setCurrentSession,
      token,
      updateSession,
      appendMissingPreviousSummaryNote,
      appendSessionBookendMessages,
    ]
  )

  const handleStartSession = async (sessionId: UUID) => {
    if (currentSession?.id === sessionId && currentSession.state === SessionState.ENDED) {
      if (!selectedCampaignId) {
        setError('Select a campaign before starting a new session.')
        return
      }

      await startCampaignSession(selectedCampaignId, sessionList, { autoActivate: true })
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
    const shouldEnd =
      typeof window === 'undefined'
        ? true
        : window.confirm(
            'End this session now? This closes the current chapter for everyone and moves players back to greenroom/offline state.'
          )

    if (!shouldEnd) {
      return
    }

    await handleTransitionSession(sessionId, SessionState.ENDED)
  }

  const handleTransitionSession = async (sessionId: UUID, state: SessionState) => {
    setError(null)

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

      appendSessionBookendMessages(sessionId, state)
      if (state === SessionState.ACTIVE) {
        void appendMissingPreviousSummaryNote(sessionId)
      }
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
  const connectedSpectatorsCount = selectedCampaign?.connectedSpectatorsRounded ?? 0
  const connectedPlayersWithDm =
    selectedCampaign?.connectedPlayersRounded !== undefined || selectedCampaign?.connectedPlayers
      ? Math.max(
          0,
          (selectedCampaign?.connectedPlayersRounded ?? selectedCampaign?.connectedPlayers ?? 0) +
            (selectedCampaign?.dmOnline ? 1 : 0)
        )
      : Math.max(0, currentPresence.length - connectedSpectatorsCount)
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
  const canStartFromGreenroom =
    currentSession?.dmId === user.id &&
    (currentSession?.state === SessionState.IDLE || currentSession?.state === SessionState.ENDED)
  const canPauseFromActive =
    currentSession?.dmId === user.id &&
    (currentSession?.state === SessionState.ACTIVE || currentSession?.state === SessionState.PAUSED)
  const canStopFromActive =
    currentSession?.dmId === user.id &&
    (currentSession?.state === SessionState.ACTIVE || currentSession?.state === SessionState.PAUSED)

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
                if (tab === 'rooms') {
                  return (
                    <SessionRoomsStatusPanel
                      rooms={visibleRooms.map((room) => ({
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
                      role={effectiveSessionRole}
                      sessionId={currentSession.id}
                      dmUserId={currentSession.dmId}
                      rooms={visibleRooms.map((room) => ({
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
                      key={`journal:${currentSession.id}:${user.id}`}
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
                      key={`history:${currentSession.id}:${user.id}`}
                      apiUrl={apiUrl}
                      token={token}
                      sessionId={currentSession.id}
                      role={effectiveSessionRole}
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
                  disabled={isSettingsSaving || !settingsData || !settingsName.trim()}
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

            {isSettingsLoading ? (
              <div className="session-status-message">Loading campaign settings...</div>
            ) : !settingsData ? (
              <div className="session-status-message">Unable to load campaign settings.</div>
            ) : (
              <div className="session-campaign-settings-grid session-campaign-settings-grid-dialog">
                <div className="session-campaign-settings-column">
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
    </>
  )
}
