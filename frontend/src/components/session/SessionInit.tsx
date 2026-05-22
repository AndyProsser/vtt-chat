/**
 * Session Initialization
 * Component for creating a new session and transitioning to active state.
 * Tests the full UI → Event → Store pipeline.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentProps } from 'react'
import { SessionState, Role, MessageType, isGreenroomSessionState } from '@shared'
import type { CampaignLobbyStatsUpdatedPayload, EventEnvelope, UUID } from '@shared'
import { PresenceState, RoomType } from '@shared'
import { useStore } from '../../hooks/useStore'
import { useWebSocket } from '../../hooks/useWebSocket'
import { useConnectionStatus } from '../../hooks/useConnectionStatus'
import { useCampaignSettings } from '../../hooks/useCampaignSettings'
import { useCharacterSettings } from '../../hooks/useCharacterSettings'
import { useSessionLifecycle } from '../../hooks/useSessionLifecycle'
import {
  createCampaignSettingsController,
  createCharacterSettingsController,
  createSessionMembershipController,
} from '@/utils/session/sessionController'
import type { RightRailTab } from './CommandCenterFrame'
import { SessionLobbyView } from '../lobby/SessionLobbyView'
import { SessionInitModals } from './SessionInitModals'
import { SessionInitCommandCenter } from './SessionInitCommandCenter'
import type { CharacterSettingsDraft } from '../editor/CampaignRightbarSettings'
import { SessionInitLobbyWorkspaceBranch } from './SessionInitLobbyWorkspaceBranch'
import { useSessionInitCampaignEntryOrchestration } from '@/hooks/session/useSessionInitCampaignEntryOrchestration'
import { useSessionInitCharacterSettingsOrchestration } from '@/hooks/session/useSessionInitCharacterSettingsOrchestration'
import { useSessionInitHydrationLifecycle } from '@/hooks/session/useSessionInitHydrationLifecycle'
import { useSessionInitSettingsOrchestration } from '@/hooks/session/useSessionInitSettingsOrchestration'
import { useSessionInitWsRetryToast } from '@/hooks/session/useSessionInitWsRetryToast'
import { useToast } from '../../hooks/useToast'
import {
  ACTIVE_SESSION_CONTEXT_STORAGE_KEY,
  ALLOWED_CHAT_GROUPING_WINDOWS,
  CHAT_GROUPING_STORAGE_KEY,
  DEFAULT_CHAT_GROUPING_WINDOW_MS,
  DEFAULT_PLANNED_DURATION_MINUTES,
  LOBBY_AUTO_ENTER_CAMPAIGN_STORAGE_KEY,
  LOBBY_CAMPAIGN_FOCUS_STORAGE_KEY,
  LOBBY_NOTICE_STORAGE_KEY,
  MAX_POSTER_DATA_URL_CHARS,
  MAX_POSTER_WIDTH_PX,
} from '../../constants/sessionInit.constants'
import { createHttpTelemetryTransport, telemetryClient } from '../../utils/telemetry'
import { fetchSessionNotesOnce } from '../../utils/notesFetch'
import { generateClientId } from '../../utils/uuid'
import { FRONTEND_THEME_CLASSES, type FrontendThemeMode } from '../../tokens'
import type { Session as SessionRecord } from '@/types/session'
import type { Note } from '@/types/notes'
import type { Message } from '@/types/chat'
import type {
  Room as RoomRecord,
  RoomUser as RoomMember,
  SessionPresence as PresenceRecord,
} from '@/types/room'
import type {
  ActiveSessionContext,
  ApiBroadcastState,
  ApiDiscoverableCampaign,
  ApiPlatformStatusResponse,
  ApiSessionStats,
  SessionInitProps,
} from '@/types/session/session-init'
import {
  type CampaignSettingsPayload,
  type CampaignSummary,
  getCampaignEntryAction,
  getCampaignDisplayState,
  resolveMembershipRole,
} from '@/types/session/campaign'
import {
  buildCharacterDraft,
  buildDefaultChapterName,
  buildRoomEnvironmentPreset,
  DEFAULT_CHARACTER_SETTINGS,
  formatDurationCompact,
  getPreferredSession,
  getVisibleRoomsForSessionState,
  isGreenRoom,
  isSessionBookendMessage,
  normalizeSessionRecord,
  parsePlayerInviteCode,
  resolveGreenroomCacheTtlMs,
  safeLocalStorageGetItem,
  safeLocalStorageRemoveItem,
  safeLocalStorageSetItem,
  SESSION_TIMER_SYNC_POLL_MS,
  toSessionStateValue,
  toValidPostSessionDurationMinutes,
} from '@/utils/session/sessionInit'
import '../../styles/components/session/SessionInit.css'

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
  const [discoverableCampaigns, setDiscoverableCampaigns] = useState<CampaignSummary[]>([])
  const [selectedCampaignId, setSelectedCampaignId] = useState<UUID | ''>('')
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(true)
  const [isCreatingCampaign, setIsCreatingCampaign] = useState(false)
  const [newCampaignName, setNewCampaignName] = useState('')
  const [joinInviteInput, setJoinInviteInput] = useState('')
  const [isJoiningCampaign, setIsJoiningCampaign] = useState(false)
  const [lobbyViewMode, setLobbyViewMode] = useState<'list' | 'workspace'>('list')
  const [lobbyStats, setLobbyStats] = useState<{
    activeSessions: number
    connectedPlayersAndDms: number
    connectedSpectators: number
    peakConcurrentUsers24h: number
    totalTimePlayedLabel: string
    activeCampaigns: number
    pausedCampaigns: number
    averageSessionDurationLabel: string
  }>({
    activeSessions: 0,
    connectedPlayersAndDms: 0,
    connectedSpectators: 0,
    peakConcurrentUsers24h: 0,
    totalTimePlayedLabel: '0m',
    activeCampaigns: 0,
    pausedCampaigns: 0,
    averageSessionDurationLabel: '0m',
  })
  const [showCreateCampaignModal, setShowCreateCampaignModal] = useState(false)
  const [showJoinCampaignModal, setShowJoinCampaignModal] = useState(false)
  const [showUserSettingsModal, setShowUserSettingsModal] = useState(false)
  const [showExitSessionModal, setShowExitSessionModal] = useState(false)
  const [showStopSessionModal, setShowStopSessionModal] = useState(false)
  const [pendingInviteReissueType, setPendingInviteReissueType] = useState<
    'PLAYER' | 'SPECTATOR' | null
  >(null)
  const [exitUpgradePassword, setExitUpgradePassword] = useState('')
  const [exitUpgradeLoading, setExitUpgradeLoading] = useState(false)
  const [exitUpgradeError, setExitUpgradeError] = useState<string | null>(null)
  const [showCampaignSettingsModal, setShowCampaignSettingsModal] = useState(false)
  const [partyPresenceRefreshVersion, setPartyPresenceRefreshVersion] = useState(0)
  const lobbyCampaignReloadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

      if (response.status === 401) {
        forceLogoutToAuthScreen()
        throw new Error('Authentication failed (401)')
      }

      if (response.status === 403) {
        // 403 is frequently a normal authorization denial (not an auth expiry).
        // Only force logout when backend explicitly marks it as unauthorized/authentication failure.
        try {
          const payload = (await response
            .clone()
            .json()
            .catch(() => null)) as { code?: string; message?: string } | null
          const code = payload?.code?.toUpperCase() || ''
          const message = payload?.message?.toLowerCase() || ''
          const shouldForceLogout =
            code === 'UNAUTHORIZED' ||
            message.includes('authentication required') ||
            message.includes('missing authorization')

          if (shouldForceLogout) {
            forceLogoutToAuthScreen()
            throw new Error('Authentication failed (403)')
          }
        } catch {
          // If payload cannot be parsed, keep caller-level handling for 403.
        }
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
  const activeTakeoverUserId = useStore((state) =>
    currentSessionId ? state.mockTakeoverUserIdBySession[currentSessionId] : null
  )
  const setCurrentSession = useStore((state) => state.setCurrentSession)
  const setIsGreenroom = useStore((state) => state.setIsGreenroom)
  const resetToolbarActionsState = useStore((state) => state.resetToolbarActionsState)
  const setToolbarCenterPaneView = useStore((state) => state.setToolbarCenterPaneView)
  const updateSession = useStore((state) => state.updateSession)
  const pauseStats = useStore((state) => state.pauseStats)
  const cooldownExtensionCounts = useStore((state) => state.cooldownExtensionCounts)
  const setCooldownExtensionCount = useStore((state) => state.setCooldownExtensionCount)
  const typedSessions = sessions as Record<UUID, SessionRecord>
  const sessionList: SessionRecord[] = Object.values(typedSessions)
  const currentSession: SessionRecord | null = currentSessionId
    ? (typedSessions[currentSessionId] ?? null)
    : null
  const shouldEnableWs = !!token && (!isCampaignRestorePending || !!currentSessionId)

  const applyLobbyStatsSnapshot = useCallback((snapshot: CampaignLobbyStatsUpdatedPayload) => {
    setLobbyStats({
      activeSessions: Math.max(0, Math.floor(snapshot.activeSessions || 0)),
      connectedPlayersAndDms: Math.max(0, Math.floor(snapshot.connectedPlayersAndDms || 0)),
      connectedSpectators: Math.max(0, Math.floor(snapshot.connectedSpectators || 0)),
      peakConcurrentUsers24h: Math.max(0, Math.floor(snapshot.peakConcurrentUsers24h || 0)),
      totalTimePlayedLabel: formatDurationCompact(snapshot.totalEndedSessionDurationMs || 0),
      activeCampaigns: Math.max(0, Math.floor(snapshot.activeCampaigns || 0)),
      pausedCampaigns: Math.max(0, Math.floor(snapshot.pausedCampaigns || 0)),
      averageSessionDurationLabel: formatDurationCompact(
        snapshot.averageEndedSessionDurationMs || 0
      ),
    })
  }, [])

  const loadCampaigns = useCallback(
    async ({ showLoading = true, surfaceError = true } = {}) => {
      if (showLoading) {
        setIsLoadingCampaigns(true)
      }
      if (surfaceError) {
        setError(null)
      }

      try {
        const response = await fetchWithAuthGuard(`${apiUrl}/api/campaigns`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.message || 'Failed to load campaigns')
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
        return nextCampaigns
      } catch (err) {
        if (surfaceError) {
          const message = err instanceof Error ? err.message : 'An error occurred'
          setError(message)
        }
        return null
      } finally {
        if (showLoading) {
          setIsLoadingCampaigns(false)
        }
      }
    },
    [apiUrl, clearSessions, fetchWithAuthGuard, token]
  )

  const loadDiscoverableCampaigns = useCallback(
    async ({ surfaceError = false } = {}) => {
      if (user.authType === 'GUEST') {
        setDiscoverableCampaigns([])
        return []
      }

      try {
        const response = await fetchWithAuthGuard(`${apiUrl}/api/campaigns/discover`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.message || 'Failed to load discoverable campaigns')
        }

        const data = (await response.json()) as { campaigns?: ApiDiscoverableCampaign[] }
        const nextCampaigns = (data.campaigns || []).map((campaign) => ({
          ...campaign,
          latestSessionState: campaign.activeSessionState ?? null,
          isMember: false,
        })) as CampaignSummary[]

        setDiscoverableCampaigns(nextCampaigns)
        return nextCampaigns
      } catch (err) {
        setDiscoverableCampaigns([])
        if (surfaceError) {
          const message = err instanceof Error ? err.message : 'An error occurred'
          setError(message)
        }
        return null
      }
    },
    [apiUrl, fetchWithAuthGuard, token, user.authType]
  )

  const loadLobbyCampaignData = useCallback(
    async ({ showLoading = true, surfaceError = true } = {}) => {
      const nextCampaigns = await loadCampaigns({ showLoading, surfaceError })

      // Discover campaigns are secondary UX data. Never let discover failures
      // block or delay the member campaign list from rendering.
      void loadDiscoverableCampaigns({ surfaceError: false })

      return nextCampaigns
    },
    [loadCampaigns, loadDiscoverableCampaigns]
  )

  const loadLobbyStats = useCallback(async () => {
    try {
      const statusResponse = await fetchWithAuthGuard(`${apiUrl}/api/platform/status`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!statusResponse.ok) {
        const errorData = await statusResponse.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to load lobby stats')
      }

      const statusPayload = (await statusResponse.json()) as ApiPlatformStatusResponse
      if (statusPayload.lobbyStats) {
        applyLobbyStatsSnapshot(statusPayload.lobbyStats)
        return
      }

      setLobbyStats((current) => ({
        ...current,
        activeSessions:
          typeof statusPayload.activeSessions === 'number'
            ? Math.max(0, Math.floor(statusPayload.activeSessions))
            : current.activeSessions,
        peakConcurrentUsers24h:
          typeof statusPayload.peakConcurrentUsers24h === 'number'
            ? Math.max(0, Math.floor(statusPayload.peakConcurrentUsers24h))
            : current.peakConcurrentUsers24h,
      }))
    } catch {
      // Keep the existing lobby snapshot when refresh fails.
    }
  }, [apiUrl, applyLobbyStatsSnapshot, fetchWithAuthGuard, token])

  const handleCampaignListInvalidated = useCallback(() => {
    if (lobbyCampaignReloadTimeoutRef.current) {
      clearTimeout(lobbyCampaignReloadTimeoutRef.current)
    }

    lobbyCampaignReloadTimeoutRef.current = setTimeout(() => {
      void loadLobbyCampaignData({ showLoading: false, surfaceError: false })
    }, 250)
  }, [loadLobbyCampaignData])

  const handleLobbyStatsUpdated = useCallback(
    (event: EventEnvelope) => {
      const payload = event.payload as Partial<CampaignLobbyStatsUpdatedPayload>
      if (typeof payload.activeSessions !== 'number') {
        return
      }

      applyLobbyStatsSnapshot(payload as CampaignLobbyStatsUpdatedPayload)
    },
    [applyLobbyStatsSnapshot]
  )
  const handlePartyPresenceUpdated = useCallback(
    (event: EventEnvelope) => {
      const payload = event.payload as { campaignId?: UUID }
      if (!payload.campaignId || payload.campaignId !== selectedCampaignId) {
        return
      }

      setPartyPresenceRefreshVersion((current) => current + 1)
    },
    [selectedCampaignId]
  )

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
    enabled: shouldEnableWs,
    onAuthFailure: handleWebSocketAuthFailure,
    onCampaignListInvalidated: handleCampaignListInvalidated,
    onLobbyStatsUpdated: handleLobbyStatsUpdated,
    onPartyPresenceUpdated: handlePartyPresenceUpdated,
  })

  useEffect(() => {
    return () => {
      if (lobbyCampaignReloadTimeoutRef.current) {
        clearTimeout(lobbyCampaignReloadTimeoutRef.current)
      }
    }
  }, [])

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
  const isTakeoverActive = Boolean(activeTakeoverUserId)
  const effectiveActorUserId = (activeTakeoverUserId || user.id) as UUID
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
  const typedMessagesBySession = messages as Record<UUID, Record<UUID, Message>>
  const takeoverPresence = useMemo(
    () =>
      activeTakeoverUserId
        ? currentPresence.find((presence) => presence.userId === activeTakeoverUserId) || null
        : null,
    [activeTakeoverUserId, currentPresence]
  )
  const selectedRoomId = useMemo<UUID | ''>(() => {
    if (!visibleRooms.length) {
      return ''
    }

    if (
      !isTakeoverActive &&
      selectedRoomIdOverride &&
      visibleRooms.some((room) => room.id === selectedRoomIdOverride)
    ) {
      return selectedRoomIdOverride
    }

    const ownPresence = currentPresence.find((presence) => presence.userId === effectiveActorUserId)
    if (
      ownPresence?.primaryRoomId &&
      visibleRooms.some((room) => room.id === ownPresence.primaryRoomId)
    ) {
      return ownPresence.primaryRoomId
    }

    const mainRoom = visibleRooms.find((room) => room.type === RoomType.MAIN)
    return (mainRoom || visibleRooms[0]).id
  }, [
    currentPresence,
    effectiveActorUserId,
    isTakeoverActive,
    selectedRoomIdOverride,
    visibleRooms,
  ])
  const selectedRoom = useMemo(
    () => visibleRooms.find((room) => room.id === selectedRoomId) || null,
    [selectedRoomId, visibleRooms]
  )
  const isGreenroomChatMode = Boolean(selectedRoom && isGreenRoom(selectedRoom))
  const connectedRoomId = useMemo<UUID | ''>(() => {
    const ownPresence = currentPresence.find((presence) => presence.userId === effectiveActorUserId)
    return ownPresence?.primaryRoomId || ''
  }, [currentPresence, effectiveActorUserId])

  useEffect(() => {
    if (!currentSession) {
      setPrivateRoomCleanMode(false)
      return
    }

    const ownPresence = currentPresence.find((presence) => presence.userId === effectiveActorUserId)
    const ownRoomType = ownPresence?.primaryRoomId
      ? currentRooms.find((room) => room.id === ownPresence.primaryRoomId)?.type
      : undefined

    setPrivateRoomCleanMode(ownRoomType === RoomType.PRIVATE)
  }, [currentPresence, currentRooms, currentSession, effectiveActorUserId, setPrivateRoomCleanMode])

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

  useEffect(() => {
    if (!currentSessionId) {
      return
    }

    let cancelled = false

    const syncSessionAnchors = async () => {
      try {
        const response = await fetchWithAuthGuard(`${apiUrl}/api/session/${currentSessionId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!response.ok) {
          return
        }

        const payload = (await response.json().catch(() => ({}))) as SessionRecord
        if (!payload?.id || cancelled) {
          return
        }

        updateSession(payload.id, normalizeSessionRecord(payload))
      } catch {
        // Timer drift correction polling is best-effort and should not disrupt session UX.
      }
    }

    void syncSessionAnchors()
    const timerId = window.setInterval(() => {
      void syncSessionAnchors()
    }, SESSION_TIMER_SYNC_POLL_MS)

    return () => {
      cancelled = true
      window.clearInterval(timerId)
    }
  }, [apiUrl, currentSessionId, fetchWithAuthGuard, token, updateSession])

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
                  id: (entry.id || generateClientId('message')) as UUID,
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
          id: generateClientId('message') as UUID,
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

  const {
    loadCampaignSettings,
    loadDmVoiceTargetingSetting,
    saveDmVoiceTargetingSetting,
    saveSessionSettings,
    openLobbyCampaignWorkspace,
    saveCampaignSettings,
    handleSaveCampaignInfoPanel,
  } = useSessionInitSettingsOrchestration({
    apiUrl,
    token,
    fetchWithAuthGuard,
    campaignSettingsController,
    campaignSettingsActions,
    currentSession,
    sessionSettingsName,
    sessionSettingsDescription,
    sessionSettingsPlannedDurationMinutes,
    setIsSessionSettingsSaving,
    updateSession,
    settingsDmAutoTargetOnFirstPlayerJoin,
    settingsCampaignId,
    settingsName,
    settingsDescription,
    settingsPosterUrl,
    settingsVisibility,
    settingsSpectatorsEnabled,
    settingsSpectatorMax,
    settingsSpectatorWaitlistEnabled,
    settingsSpectatorReconnectGraceSecs,
    settingsExtensionSyncPolicy,
    settingsPostSessionChatEnabled,
    settingsPostSessionChatDurationMinutes,
    settingsLateJoinPolicy,
    settingsLateJoinGraceMinutes,
    settingsData,
    setCampaigns,
    setSelectedCampaignId,
    setLobbyViewMode,
    setError,
    setLobbyNotice,
  })

  const { loadUserCharacters, saveCharacterSettings, handleCharacterFieldChange } =
    useSessionInitCharacterSettingsOrchestration({
      characterSettingsController,
      characterSettingsActions,
      selectedCampaignId,
      selectedCharacterId,
      characterSettingsDraft,
      setError,
      setLobbyNotice,
    })

  useEffect(() => {
    void loadUserCharacters()
  }, [loadUserCharacters])

  useEffect(() => {
    if (!selectedCampaignId || !currentSession?.id) {
      return
    }

    void loadDmVoiceTargetingSetting(selectedCampaignId)
  }, [currentSession?.id, loadDmVoiceTargetingSetting, selectedCampaignId])

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
    void Promise.all([loadLobbyCampaignData(), loadLobbyStats()])
  }, [loadLobbyCampaignData, loadLobbyStats])

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

  useSessionInitHydrationLifecycle({
    apiUrl,
    token,
    wsState,
    currentSession,
    fetchWithAuthGuard,
    setSelectedRoomIdOverride,
    replaceSessionTopology,
    replaceSessionStatsSnapshot,
    setMockTakeoverUserId,
    restoreSessionBookendsFromHistory,
    resetSessionAudioState,
    clearActiveEffects,
    setEnvironment,
    replaceRoomEnvironmentNames,
    replaceDMOverrides,
    setBroadcastState,
    lastHydratedSessionFingerprintRef,
    prevWsStateRef,
  })

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

    // Greenroom messages are preserved in Zustand until the server emits
    // CHAT:ROOM_CONTEXT_CLEARED (only on CLEANUP). Do not evict them locally.
    greenroomCleanupTimerRef.current = null

    return () => {
      if (greenroomCleanupTimerRef.current !== null) {
        window.clearTimeout(greenroomCleanupTimerRef.current)
        greenroomCleanupTimerRef.current = null
      }
    }
  }, [
    currentPresence,
    currentSessionStats,
    currentSession,
    isGreenroom,
    selectedCampaignId,
    sessionList,
    typedRoomsBySession,
  ])

  const { handleCreateCampaign, handleJoinCampaign, handleEnterCampaign, startCampaignSession } =
    useSessionInitCampaignEntryOrchestration({
      apiUrl,
      token,
      userId: user.id,
      userAuthType: user.authType,
      campaigns,
      selectedCampaignId,
      newCampaignName,
      joinInviteInput,
      setCampaigns,
      setSelectedCampaignId,
      setShowCreateCampaignModal,
      setShowJoinCampaignModal,
      setNewCampaignName,
      setJoinInviteInput,
      setLobbyViewMode,
      setIsCreatingCampaign,
      setIsJoiningCampaign,
      setError,
      setLobbyNotice,
      fetchWithAuthGuard,
      fetchCampaignSessionsData,
      ensureSessionMembership,
      replaceSessions,
      setCurrentSession,
      openLobbyCampaignWorkspace,
      onSessionCreated,
    })

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

  const handleSaveCampaignSettings: NonNullable<
    ComponentProps<typeof SessionInitModals>['onSaveCampaignSettings']
  > = (event) => {
    event.preventDefault()
    void (async () => {
      await saveCampaignSettings()
      setShowCampaignSettingsModal(false)
    })()
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

  const requestInviteReissue = (inviteType: 'PLAYER' | 'SPECTATOR') => {
    setPendingInviteReissueType(inviteType)
  }

  const handleConfirmInviteReissue = async () => {
    if (!pendingInviteReissueType) {
      return
    }

    const inviteType = pendingInviteReissueType
    setPendingInviteReissueType(null)
    await reissueInvite(inviteType)

    // After reissuing, copy the new invite link to clipboard
    if (settingsData) {
      const code =
        inviteType === 'PLAYER' ? settingsData.inviteCode : settingsData.spectatorInviteCode
      if (code) {
        const basePath = inviteType === 'PLAYER' ? '/join/' : '/watch/'
        const inviteUrl = `${window.location.origin}${basePath}${encodeURIComponent(code)}`
        try {
          await navigator.clipboard.writeText(inviteUrl)
          setLobbyNotice(`${inviteType === 'PLAYER' ? 'Player' : 'Spectator'} invite URL copied.`)
        } catch {
          setError('Failed to copy invite URL to clipboard.')
        }
      }
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

  const handleStartSession = async (sessionId: UUID) => {
    if (currentSession?.id === sessionId && currentSession.state === SessionState.ENDED) {
      if (!selectedCampaignId) {
        setError('Select a campaign before starting a new session.')
        return
      }

      const nextSessionId = await startCampaignSession(selectedCampaignId, sessionList)
      if (nextSessionId) {
        await handleTransitionSession(nextSessionId, SessionState.ACTIVE)
      }
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

  const handleStopSession = async () => {
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
          extensionCount?: number
        }

        if (!response.ok) {
          if (
            response.status === 409 &&
            typeof payload.message === 'string' &&
            /up to 3 times per session/i.test(payload.message)
          ) {
            setCooldownExtensionCount(sessionId, 3)
          }

          throw new Error(payload.message || 'Failed to extend cooldown')
        }

        if (payload.session) {
          updateSession(sessionId, normalizeSessionRecord(payload.session))
        }

        if (typeof payload.extensionCount === 'number' && Number.isFinite(payload.extensionCount)) {
          setCooldownExtensionCount(sessionId, payload.extensionCount)
        }
      } catch (error) {
        if (error instanceof Error && /up to 3 times per session/i.test(error.message)) {
          setCooldownExtensionCount(sessionId, 3)
        }

        setError(error instanceof Error ? error.message : 'Failed to extend cooldown')
      }
    },
    [apiUrl, fetchWithAuthGuard, setCooldownExtensionCount, token, updateSession]
  )

  const handleConfirmStopSession = async () => {
    if (!currentSession) {
      setShowStopSessionModal(false)
      return
    }

    setShowStopSessionModal(false)
    await handleTransitionSession(currentSession.id, SessionState.COOLDOWN)
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
            : state === SessionState.COOLDOWN
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
    if (currentSession) {
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
  const greenroomRosterCount = useMemo(() => {
    if (!currentSession || !isGreenroom) {
      return undefined
    }

    const greenroom = currentRooms.find((room) => isGreenRoom(room))
    if (!greenroom) {
      return undefined
    }

    const members = typedRoomMembers[greenroom.id] || []
    const uniqueUserIds = new Set<UUID>()
    for (const member of members) {
      if (member.role === Role.SYSTEM) {
        continue
      }
      uniqueUserIds.add(member.userId)
    }

    return uniqueUserIds.size
  }, [currentRooms, currentSession, isGreenroom, typedRoomMembers])
  const liveConnectedPresenceCount = currentPresence.filter(
    (presence) => presence.state !== PresenceState.OFFLINE
  ).length
  const hasLivePresence = currentSession !== null && currentPresence.length > 0
  const connectedPlayers = isGreenroom
    ? (greenroomRosterCount ??
      (currentSessionStats
        ? currentSessionStats.connectedPlayersWithDm
        : hasLivePresence
          ? Math.max(0, liveConnectedPresenceCount - connectedSpectatorsCount)
          : selectedCampaign?.connectedPlayersRounded !== undefined ||
              selectedCampaign?.connectedPlayers
            ? Math.max(
                0,
                (selectedCampaign?.connectedPlayersRounded ??
                  selectedCampaign?.connectedPlayers ??
                  0) + (selectedCampaign?.dmOnline ? 1 : 0)
              )
            : Math.max(0, liveConnectedPresenceCount - connectedSpectatorsCount)))
    : currentSessionStats
      ? currentSessionStats.connectedPlayersWithDm
      : hasLivePresence
        ? Math.max(0, liveConnectedPresenceCount - connectedSpectatorsCount)
        : selectedCampaign?.connectedPlayersRounded !== undefined ||
            selectedCampaign?.connectedPlayers
          ? Math.max(
              0,
              (selectedCampaign?.connectedPlayersRounded ??
                selectedCampaign?.connectedPlayers ??
                0) + (selectedCampaign?.dmOnline ? 1 : 0)
            )
          : Math.max(0, liveConnectedPresenceCount - connectedSpectatorsCount)
  const membershipRole = resolveMembershipRole(selectedCampaign?.memberRole)
  const effectiveSessionRole: Role = isTakeoverActive
    ? Role.PLAYER
    : currentSession && currentSession.dmId === user.id
      ? Role.DM
      : membershipRole
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
    currentSession?.state === SessionState.COOLDOWN &&
    (effectiveSessionRole === Role.DM || effectiveSessionRole === Role.PLAYER)
  const canManageCooldown =
    currentSession?.state === SessionState.COOLDOWN &&
    (currentSession?.dmId === user.id || (effectiveSessionRole === Role.PLAYER && isDmDisconnected))
  const cooldownControlLockedReason =
    cooldownControlVisible && !canManageCooldown
      ? effectiveSessionRole === Role.PLAYER
        ? 'Cooldown controls unlock for players only if the DM disconnects.'
        : 'Only the DM can control cooldown.'
      : undefined
  const currentCooldownExtensionCount = currentSession
    ? (cooldownExtensionCounts[currentSession.id] ?? 0)
    : 0
  const canExtendCooldown = Boolean(canManageCooldown) && currentCooldownExtensionCount < 3
  const extendCooldownLockedReason = !canManageCooldown
    ? cooldownControlLockedReason
    : currentCooldownExtensionCount >= 3
      ? 'Cooldown extention limit reached'
      : undefined
  const takeoverDisplayName =
    takeoverPresence?.characterName || takeoverPresence?.username || user.username
  // Preserve the JWT `role` as-is; set `campaignMembershipRole` so components can
  // distinguish the campaign-scoped role from the global account role.
  const effectiveSessionUser =
    effectiveSessionRole === user.role && !isTakeoverActive
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
          id: effectiveActorUserId,
          username: takeoverDisplayName,
          role: effectiveSessionRole,
          campaignMembershipRole: effectiveSessionRole as unknown as 'DM' | 'PLAYER' | 'SPECTATOR',
        }
  const canStartFromGreenroom = !isTakeoverActive && currentSession?.dmId === user.id && isGreenroom
  const canPauseFromActive =
    !isTakeoverActive &&
    currentSession?.dmId === user.id &&
    (currentSession?.state === SessionState.ACTIVE || currentSession?.state === SessionState.PAUSED)
  const canStopFromActive =
    !isTakeoverActive &&
    currentSession?.dmId === user.id &&
    (currentSession?.state === SessionState.ACTIVE || currentSession?.state === SessionState.PAUSED)
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

  const handleRoomSelection = useCallback(
    (roomId: UUID) => {
      if (isTakeoverActive) {
        return
      }

      setSelectedRoomIdOverride(roomId)
    },
    [isTakeoverActive, setSelectedRoomIdOverride]
  )

  useSessionInitWsRetryToast({
    wsState,
    wsError,
    wsRetryWindowExpired,
    sessionLifecycleActions,
    wsRetryWindowStartRef,
    wsRetryToastTimerRef,
    wsErrorMessageRef,
    retryConnection,
    showToast,
  })

  return (
    <>
      <div
        className={`session-init-shell ${hasSessionSelected ? 'session-init-shell-session' : 'session-init-shell-home session-init-shell--lobby'}`}
      >
        {!hasSessionSelected && lobbyViewMode === 'list' && (
          <SessionLobbyView
            campaigns={campaigns}
            discoverableCampaigns={discoverableCampaigns}
            lobbyStats={lobbyStats}
            selectedCampaignId={selectedCampaignId}
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
            onOpenCampaignSettings={openLobbyCampaignWorkspace}
            onEnterCampaign={(campaignId) => {
              void handleEnterCampaign(campaignId)
            }}
            onJoinRequest={() => {
              setError('Join request flow is not wired into SessionInit yet.')
            }}
            onWatchCampaign={() => {
              setError('Watch flow is not wired into SessionInit yet.')
            }}
            onError={setError}
          />
        )}

        <SessionInitLobbyWorkspaceBranch
          hasSessionSelected={hasSessionSelected}
          lobbyViewMode={lobbyViewMode}
          selectedCampaign={selectedCampaign || null}
          membershipRole={membershipRole}
          themeMode={themeMode}
          isCreatingCampaign={isCreatingCampaign}
          isJoiningCampaign={isJoiningCampaign}
          apiUrl={apiUrl}
          token={token}
          currentSessionId={currentSessionId || null}
          currentSessionState={
            currentSessionId ? (typedSessions[currentSessionId]?.state ?? null) : null
          }
          userId={user.id}
          partyPresenceRefreshVersion={partyPresenceRefreshVersion}
          fetchWithAuthGuard={fetchWithAuthGuard}
          connectionStatus={{
            statusColorKey: connectionStatus.statusColorKey,
            label: connectionStatus.label,
            coreWsState: connectionStatus.coreWsState as 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED',
          }}
          settingsCampaignSessionsCount={settingsCampaignSessions.length}
          settingsCampaignTotalDurationMs={settingsCampaignTotalDurationMs}
          settingsData={settingsData}
          isInviteReissuing={isInviteReissuing}
          isSettingsLoading={isSettingsLoading}
          isSettingsSaving={isSettingsSaving}
          settingsName={settingsName}
          settingsDescription={settingsDescription}
          settingsPosterUrl={settingsPosterUrl}
          settingsVisibility={settingsVisibility}
          settingsSpectatorsEnabled={settingsSpectatorsEnabled}
          settingsSpectatorMax={settingsSpectatorMax}
          settingsSpectatorWaitlistEnabled={settingsSpectatorWaitlistEnabled}
          settingsSpectatorReconnectGraceSecs={settingsSpectatorReconnectGraceSecs}
          settingsPostSessionChatEnabled={settingsPostSessionChatEnabled}
          settingsPostSessionChatDurationMinutes={settingsPostSessionChatDurationMinutes}
          settingsExtensionSyncPolicy={settingsExtensionSyncPolicy}
          settingsLateJoinPolicy={settingsLateJoinPolicy}
          settingsLateJoinGraceMinutes={settingsLateJoinGraceMinutes}
          settingsDmAutoTargetOnFirstPlayerJoin={settingsDmAutoTargetOnFirstPlayerJoin}
          selectedCampaignId={selectedCampaignId}
          characterSettingsDraft={characterSettingsDraft}
          isCharacterSettingsLoading={isCharacterSettingsLoading}
          isCharacterSettingsSaving={isCharacterSettingsSaving}
          onSettingsNameChange={(value) => campaignSettingsActions.setSettingsName(value)}
          onSettingsDescriptionChange={(value) =>
            campaignSettingsActions.setSettingsDescription(value)
          }
          onPosterFileSelected={handlePosterFileSelected}
          onSettingsPosterUrlChange={(value) => campaignSettingsActions.setSettingsPosterUrl(value)}
          onSettingsVisibilityChange={(value) => campaignSettingsActions.setSettingsVisibility(value)}
          onSettingsSpectatorsEnabledChange={(value) =>
            campaignSettingsActions.setSettingsSpectatorsEnabled(value)
          }
          onSettingsSpectatorMaxChange={(value) =>
            campaignSettingsActions.setSettingsSpectatorMax(value)
          }
          onSettingsSpectatorWaitlistEnabledChange={(value) =>
            campaignSettingsActions.setSettingsSpectatorWaitlistEnabled(value)
          }
          onSettingsSpectatorReconnectGraceSecsChange={(value) =>
            campaignSettingsActions.setSettingsSpectatorReconnectGraceSecs(value)
          }
          onSettingsPostSessionChatEnabledChange={(value) =>
            campaignSettingsActions.setSettingsPostSessionChatEnabled(value)
          }
          onSettingsPostSessionChatDurationMinutesChange={(value) =>
            campaignSettingsActions.setSettingsPostSessionChatDurationMinutes(value)
          }
          onSettingsExtensionSyncPolicyChange={(value) =>
            campaignSettingsActions.setSettingsExtensionSyncPolicy(value)
          }
          onSettingsLateJoinPolicyChange={(value) =>
            campaignSettingsActions.setSettingsLateJoinPolicy(value)
          }
          onSettingsLateJoinGraceMinutesChange={(value) =>
            campaignSettingsActions.setSettingsLateJoinGraceMinutes(value)
          }
          onSettingsDmAutoTargetOnFirstPlayerJoinChange={(value) =>
            campaignSettingsActions.setSettingsDmAutoTargetOnFirstPlayerJoin(value)
          }
          onCopyInviteUrl={(inviteType) => {
            void copyInviteUrl(inviteType)
          }}
          onReissueInvite={(inviteType) => {
            requestInviteReissue(inviteType)
          }}
          onSaveCampaignSettings={() => {
            void saveCampaignSettings()
          }}
          onCharacterFieldChange={handleCharacterFieldChange}
          onSaveCharacterSettings={() => {
            void saveCharacterSettings()
          }}
          onBackToLobby={() => {
            setLobbyViewMode('list')
          }}
          onCreateCampaign={() => setShowCreateCampaignModal(true)}
          onJoinCampaign={() => setShowJoinCampaignModal(true)}
          onToggleTheme={handleToggleTheme}
          onOpenUserSettings={() => setShowUserSettingsModal(true)}
          onLogoff={handleLogoff}
          onLaunch={(campaignId) => {
            setLobbyViewMode('list')
            void handleEnterCampaign(campaignId)
          }}
          onSaveCampaignInfo={handleSaveCampaignInfoPanel}
          isLaunchDisabled={selectedCampaign ? getCampaignEntryAction(selectedCampaign).disabled : true}
          launchDisabledReason={
            selectedCampaign
              ? (getCampaignEntryAction(selectedCampaign).reason ?? 'Select a campaign first.')
              : 'Select a campaign first.'
          }
        />

        <SessionInitCommandCenter
          hasSessionSelected={hasSessionSelected}
          currentSession={currentSession}
          currentPauseStats={currentPauseStats}
          configuredCooldownDurationMs={configuredCooldownDurationMs}
          canStartFromGreenroom={canStartFromGreenroom}
          canPauseFromActive={canPauseFromActive}
          canStopFromActive={canStopFromActive}
          cooldownControlVisible={cooldownControlVisible}
          canManageCooldown={Boolean(canManageCooldown)}
          cooldownControlLockedReason={cooldownControlLockedReason}
          canExtendCooldown={canExtendCooldown}
          extendCooldownLockedReason={extendCooldownLockedReason}
          onStartSession={handleStartSession}
          onPauseSession={handlePauseSession}
          onStopSession={handleStopSession}
          onCancelCooldown={handleCancelCooldown}
          onExtendCooldown={(sessionId, durationMs) => {
            void handleExtendCooldown(sessionId, durationMs)
          }}
          onOpenUserSettings={() => setShowUserSettingsModal(true)}
          onExitToSelector={handleExitToCampaignSelector}
          apiUrl={apiUrl}
          token={token}
          selectedCampaign={selectedCampaign ?? null}
          sessionCount={sessionList.length}
          connectedPlayers={connectedPlayers}
          connectedSpectatorsCount={connectedSpectatorsCount}
          effectiveSessionRole={effectiveSessionRole}
          effectiveSessionUser={effectiveSessionUser}
          visibleRooms={visibleRooms}
          roomMembersByRoomId={typedRoomMembers}
          selectedRoomId={selectedRoomId}
          onSelectRoom={handleRoomSelection}
          broadcastModeEnabled={broadcastModeEnabled}
          onToggleBroadcastMode={handleToggleBroadcastMode}
          dmAutoTargetOnFirstPlayerJoin={settingsDmAutoTargetOnFirstPlayerJoin}
          dmOverrides={dmOverrides}
          currentConditionName={currentConditionName}
          roomEnvironmentNames={roomEnvironmentNames}
          wsState={wsState}
          wsRetrySecondsRemaining={wsRetrySecondsRemaining}
          connectionStatus={connectionStatus}
          rightRailIndicators={rightRailIndicators}
          selectedRoom={selectedRoom ?? null}
          campaignId={selectedCampaign?.id as UUID | undefined}
          messageGroupingWindowMs={messageGroupingWindowMs}
          sendWsEvent={send}
          isGreenroomChatMode={isGreenroomChatMode}
          onOpenNotesWorkspace={() => setToolbarCenterPaneView('notes')}
          totalSessionDurationMs={settingsCampaignTotalDurationMs}
          canEditCampaignInfo={Boolean(selectedCampaign && selectedCampaign.currentDmId === user.id)}
          onSaveCampaignInfo={handleSaveCampaignInfoPanel}
          campaignIdForSettings={selectedCampaignId}
          sessionSettingsName={sessionSettingsName}
          sessionSettingsDescription={sessionSettingsDescription}
          sessionSettingsPlannedDurationMinutes={sessionSettingsPlannedDurationMinutes}
          canEditSessionSettings={canEditSessionSettings}
          onSessionNameChange={setSessionSettingsName}
          onSessionDescriptionChange={setSessionSettingsDescription}
          onPlannedDurationMinutesChange={handlePlannedDurationMinutesChange}
          onSaveSessionSettings={() => {
            void saveSessionSettings()
          }}
          isSessionSettingsSaving={isSessionSettingsSaving}
          onDmAutoTargetChange={(value) =>
            campaignSettingsActions.setSettingsDmAutoTargetOnFirstPlayerJoin(value)
          }
          onSaveDmAutoTarget={() => {
            if (selectedCampaignId) void saveDmVoiceTargetingSetting(selectedCampaignId)
          }}
          isDmVoiceTargetingSettingSaving={isDmVoiceTargetingSettingSaving}
          isDmVoiceTargetingSettingLoading={isDmVoiceTargetingSettingLoading}
          characterDraft={characterSettingsDraft}
          onCharacterFieldChange={handleCharacterFieldChange}
          onSaveCharacterSettings={() => {
            void saveCharacterSettings()
          }}
          isCharacterSettingsLoading={isCharacterSettingsLoading}
          isCharacterSettingsSaving={isCharacterSettingsSaving}
          userId={user.id}
        />
      </div>

      <SessionInitModals
        apiUrl={apiUrl}
        token={token}
        user={user}
        selectedCampaignName={selectedCampaign?.name}
        showCreateCampaignModal={showCreateCampaignModal}
        isCreatingCampaign={isCreatingCampaign}
        newCampaignName={newCampaignName}
        onCreateCampaignSubmit={handleCreateCampaign}
        onNewCampaignNameChange={setNewCampaignName}
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
          requestInviteReissue(inviteType)
        }}
        showReissueInviteModal={pendingInviteReissueType !== null}
        reissueInviteType={pendingInviteReissueType}
        onCloseReissueInviteModal={() => setPendingInviteReissueType(null)}
        onConfirmReissueInvite={() => {
          void handleConfirmInviteReissue()
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
        currentSessionState={currentSession?.state}
        effectiveSessionRole={effectiveSessionRole}
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
