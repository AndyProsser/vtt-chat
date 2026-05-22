/**
 * Session Initialization
 * Component for creating a new session and transitioning to active state.
 * Tests the full UI → Event → Store pipeline.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SessionState, Role, MessageType, isGreenroomSessionState } from '@shared'
import type { UUID } from '@shared'
import { PresenceState, RoomType } from '@shared'
import { useStore } from '@/hooks/useStore'
import { useWebSocket } from '../../hooks/useWebSocket'
import { useCampaignSettings } from '../../hooks/useCampaignSettings'
import { useCharacterSettings } from '../../hooks/useCharacterSettings'
import { useSessionLifecycle } from '../../hooks/useSessionLifecycle'
import {
  createCampaignSettingsController,
  createCharacterSettingsController,
  createSessionMembershipController,
} from '@/utils/session/sessionController'
import { TooltipProvider } from '@/components/ui'
import type { RightRailTab } from '@/types/ui'
import { LobbyView } from '@/components/workspaces/lobby/LobbyView'
import { buildLobbyWorkspaceProps } from '@/components/workspaces/lobby/lobbyWorkspace.props'
import { LobbyModals } from '@/components/workspaces/lobby/modals/LobbyModals'
import { buildLobbyModalsProps } from '@/components/workspaces/lobby/lobbyModals.props'
import { SessionWorkspace } from './SessionWorkspace'
import { buildSessionWorkspaceProps } from '@/components/workspaces/session/sessionWorkspace.props'
import { SessionModals } from '@/components/workspaces/session/modals/SessionModals'
import { buildSessionModalsProps } from '@/components/workspaces/session/modals/sessionModals.props'
import type { CharacterSettingsDraft } from '@/components/workspaces/shared/panels/CampaignRightbarSettings'
import { EditorWorkspace } from './EditorWorkspace'
import { buildEditorWorkspaceProps } from '@/components/workspaces/editor/editorWorkspace.props'
import { SharedModals } from '@/components/workspaces/shared/modals/SharedModals'
import { buildSharedModalsProps } from '@/components/workspaces/shared/modals/sharedModals.props'
import type { ModalsProps } from '@/types/modals'
import { useWorkspacesCampaignEntryOrchestration } from '@/hooks/session/useWorkspacesCampaignEntryOrchestration'
import { useWorkspacesCharacterSettingsOrchestration } from '@/hooks/session/useWorkspacesCharacterSettingsOrchestration'
import { useWorkspacesHydrationLifecycle } from '@/hooks/session/useWorkspacesHydrationLifecycle'
import { useWorkspacesSettingsOrchestration } from '@/hooks/session/useWorkspacesSettingsOrchestration'
import { useWorkspacesSettingsReferenceNotes } from '@/hooks/session/useWorkspacesSettingsReferenceNotes'
import { useWorkspacesWsRetryToast } from '@/hooks/session/useWorkspacesWsRetryToast'
import { useWorkspacesTelemetry } from '@/hooks/session/useWorkspacesTelemetry'
import { useWorkspacesGreenroomCleanup } from '@/hooks/session/useWorkspacesGreenroomCleanup'
import { useWorkspacesLobbyData } from '@/hooks/session/useWorkspacesLobbyData'
import { useWorkspacesSessionOrchestration } from '@/hooks/session/useWorkspacesSessionOrchestration'
import { useWorkspacesDerivedState } from '@/hooks/session/useWorkspacesDerivedState'
import { useWorkspacesCampaignSettingsActions } from '@/hooks/session/useWorkspacesCampaignSettingsActions'
import { useFrontendThemeMode } from '@/hooks/useFrontendThemeMode'
import { useToast } from '@/hooks/useToast'
import {
  ACTIVE_SESSION_CONTEXT_STORAGE_KEY,
  ALLOWED_CHAT_GROUPING_WINDOWS,
  CHAT_GROUPING_STORAGE_KEY,
  DEFAULT_CHAT_GROUPING_WINDOW_MS,
  DEFAULT_PLANNED_DURATION_MINUTES,
  LOBBY_AUTO_ENTER_CAMPAIGN_STORAGE_KEY,
} from '@/constants/workspaces.constants'
import { generateClientId } from '../../utils/uuid'
import type { Session as SessionRecord } from '@/types/session'
import type { Message } from '@/types/chat'
import type {
  Room as RoomRecord,
  RoomUser as RoomMember,
  SessionPresence as PresenceRecord,
} from '@/types/room'
import type {
  ActiveSessionContext,
  ApiBroadcastState,
  ApiSessionStats,
  WorkspacesProps as WorkspaceInitializationProps,
} from '@/types/session/workspaces'
import {
  buildCharacterDraft,
  buildRoomEnvironmentPreset,
  getVisibleRoomsForSessionState,
  isGreenRoom,
  isSessionBookendMessage,
  normalizeSessionRecord,
  safeLocalStorageGetItem,
  safeLocalStorageRemoveItem,
  safeLocalStorageSetItem,
  SESSION_TIMER_SYNC_POLL_MS,
} from '@/utils/session/workspaces'
import type { EditorWorkspaceView } from '@/types/workspaces'
import '@/styles/components/workspaces/session/workspaces/Workspaces.css'

export function WorkspaceInitialization({
  apiUrl,
  wsUrl,
  token,
  user,
  onSessionCreated,
  onReady,
}: WorkspaceInitializationProps) {
  const showToast = useToast()
  const { themeMode, toggleThemeMode } = useFrontendThemeMode()
  const [isCreatingCampaign, setIsCreatingCampaign] = useState(false)
  const [newCampaignName, setNewCampaignName] = useState('')
  const [joinInviteInput, setJoinInviteInput] = useState('')
  const [isJoiningCampaign, setIsJoiningCampaign] = useState(false)
  const [editorWorkspaceView, setEditorWorkspaceView] = useState<EditorWorkspaceView>('lobby')
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
  const {
    campaigns,
    setCampaigns,
    discoverableCampaigns,
    selectedCampaignId,
    setSelectedCampaignId,
    isLoadingCampaigns,
    lobbyStats,
    partyPresenceRefreshVersion,
    handleCampaignListInvalidated,
    handleLobbyStatsUpdated,
    handlePartyPresenceUpdated,
  } = useWorkspacesLobbyData({
    apiUrl,
    token,
    userAuthType: user.authType,
    fetchWithAuthGuard,
    clearSessions,
    replaceSessions,
    fetchCampaignSessionsData,
    setError,
    setLobbyNotice,
  })

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
    openEditorCampaignWorkspace,
    saveCampaignSettings,
    handleSaveCampaignInfoPanel,
  } = useWorkspacesSettingsOrchestration({
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
    setEditorWorkspaceView,
    setError,
    setLobbyNotice,
  })

  const { loadUserCharacters, saveCharacterSettings, handleCharacterFieldChange } =
    useWorkspacesCharacterSettingsOrchestration({
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

  useWorkspacesSettingsReferenceNotes({
    showCampaignSettingsModal,
    settingsReferenceSessionId,
    apiUrl,
    token,
    addNote,
    setIsSettingsReferenceNotesLoading: campaignSettingsActions.setIsSettingsReferenceNotesLoading,
    setSettingsReferenceNotesError: campaignSettingsActions.setSettingsReferenceNotesError,
  })

  useWorkspacesTelemetry({
    apiUrl,
    token,
    wsState,
    currentSessionId: currentSession?.id,
    wsTelemetryPrevRef,
  })

  useWorkspacesHydrationLifecycle({
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

  useWorkspacesGreenroomCleanup({
    selectedCampaignId,
    hasCurrentSession: Boolean(currentSession),
    isGreenroom,
    currentSessionStats,
    currentPresence,
  })

  const { handleCreateCampaign, handleJoinCampaign, handleEnterCampaign, startCampaignSession } =
    useWorkspacesCampaignEntryOrchestration({
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
      setEditorWorkspaceView,
      setIsCreatingCampaign,
      setIsJoiningCampaign,
      setError,
      setLobbyNotice,
      fetchWithAuthGuard,
      fetchCampaignSessionsData,
      ensureSessionMembership,
      replaceSessions,
      setCurrentSession,
      openEditorCampaignWorkspace,
      onSessionCreated,
    })

  const {
    handleToggleBroadcastMode,
    handleStartSession,
    handlePauseSession,
    handleStopSession,
    handleCancelCooldown,
    handleExtendCooldown,
    handleConfirmStopSession,
    handleLogoff,
    handleExitToCampaignSelector,
    handleConfirmExitAsFullAccount,
    handleSkipGuestUpgrade,
    handleUpgradeAndExit,
  } = useWorkspacesSessionOrchestration({
    apiUrl,
    token,
    userId: user.id,
    currentSession,
    selectedCampaignId,
    sessionList,
    fetchWithAuthGuard,
    startCampaignSession,
    updateSession,
    setBroadcastState,
    setCooldownExtensionCount,
    setIsGreenroom,
    resetToolbarActionsState,
    setSelectedRoomIdOverride,
    setCurrentSession,
    clearPersistedActiveSessionContext,
    forceLogoutToAuthScreen,
    setShowStopSessionModal,
    showStopSessionModal,
    setShowExitSessionModal,
    setExitUpgradeError,
    exitUpgradePassword,
    setExitUpgradePassword,
    setExitUpgradeLoading,
    setError,
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

  const {
    pendingInviteReissueType,
    setPendingInviteReissueType,
    handleSaveCampaignSettings,
    handlePosterFileSelected,
    copyInviteUrl,
    requestInviteReissue,
    handleConfirmInviteReissue,
  } = useWorkspacesCampaignSettingsActions({
    apiUrl,
    token,
    fetchWithAuthGuard,
    settingsCampaignId,
    settingsData,
    loadCampaignSettings,
    saveCampaignSettings,
    setIsInviteReissuing: campaignSettingsActions.setIsInviteReissuing,
    setSettingsPosterUrl: campaignSettingsActions.setSettingsPosterUrl,
    setError,
    setLobbyNotice,
    setShowCampaignSettingsModal,
  })

  const handleSaveCampaignSettingsSubmit: NonNullable<ModalsProps['onSaveCampaignSettings']> =
    handleSaveCampaignSettings

  const handleToggleTheme = toggleThemeMode
  const {
    hasSessionSelected,
    connectionStatus,
    selectedCampaign,
    settingsReferenceSession,
    settingsCampaignTotalDurationMs,
    connectedSpectatorsCount,
    connectedPlayers,
    membershipRole,
    effectiveSessionRole,
    isDmDisconnected,
    configuredCooldownDurationMs,
    cooldownControlVisible,
    canManageCooldown,
    cooldownControlLockedReason,
    canExtendCooldown,
    extendCooldownLockedReason,
    effectiveSessionUser,
    canStartFromGreenroom,
    canPauseFromActive,
    canStopFromActive,
    leaveSessionWarning,
    canEditSessionSettings,
  } = useWorkspacesDerivedState({
    wsState,
    currentSession,
    selectedRoomId,
    campaigns,
    selectedCampaignId,
    settingsCampaignSessions,
    settingsReferenceSessionId,
    currentSessionStats,
    currentPresence,
    isGreenroom,
    currentRooms,
    typedRoomMembers,
    activeTakeoverUserId,
    takeoverPresence,
    user,
    settingsPostSessionChatDurationMinutes,
    cooldownExtensionCounts,
  })

  useEffect(() => {
    if (!error) return

    showToast({
      id: `workspaces:error:${error}`,
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
      id: `workspaces:notice:${lobbyNotice}`,
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

  useWorkspacesWsRetryToast({
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

  const lobbyWorkspaceProps = buildLobbyWorkspaceProps({
    hasSessionSelected,
    editorWorkspaceView,
    campaigns,
    discoverableCampaigns,
    lobbyStats,
    selectedCampaignId,
    isLoadingCampaigns,
    isCreatingCampaign,
    isJoiningCampaign,
    themeMode,
    connectionStatus,
    onSelectCampaign: setSelectedCampaignId,
    onCreateCampaign: () => setShowCreateCampaignModal(true),
    onJoinCampaign: () => setShowJoinCampaignModal(true),
    onToggleTheme: handleToggleTheme,
    onOpenUserSettings: () => setShowUserSettingsModal(true),
    onLogoff: handleLogoff,
    onOpenCampaignSettings: openEditorCampaignWorkspace,
    onEnterCampaign: (campaignId) => {
      void handleEnterCampaign(campaignId)
    },
    onJoinRequest: () => {
      setError('Join request flow is not wired into Workspaces yet.')
    },
    onWatchCampaign: () => {
      setError('Watch flow is not wired into Workspaces yet.')
    },
    onError: setError,
  })

  const editorWorkspaceProps = buildEditorWorkspaceProps({
    hasSessionSelected,
    editorWorkspaceView,
    selectedCampaign: selectedCampaign || null,
    membershipRole,
    themeMode,
    apiUrl,
    token,
    currentSessionId: currentSessionId || null,
    currentSessionState: currentSessionId ? (typedSessions[currentSessionId]?.state ?? null) : null,
    userId: user.id,
    partyPresenceRefreshVersion,
    fetchWithAuthGuard,
    connectionStatus,
    settingsCampaignSessionsCount: settingsCampaignSessions.length,
    settingsCampaignTotalDurationMs,
    settingsData,
    isInviteReissuing,
    isSettingsLoading,
    isSettingsSaving,
    settingsName,
    settingsDescription,
    settingsPosterUrl,
    settingsVisibility,
    settingsSpectatorsEnabled,
    settingsSpectatorMax,
    settingsSpectatorWaitlistEnabled,
    settingsSpectatorReconnectGraceSecs,
    settingsPostSessionChatEnabled,
    settingsPostSessionChatDurationMinutes,
    settingsExtensionSyncPolicy,
    settingsLateJoinPolicy,
    settingsLateJoinGraceMinutes,
    settingsDmAutoTargetOnFirstPlayerJoin,
    selectedCampaignId,
    characterSettingsDraft,
    isCharacterSettingsLoading,
    isCharacterSettingsSaving,
    onSettingsNameChange: (value) => campaignSettingsActions.setSettingsName(value),
    onSettingsDescriptionChange: (value) => campaignSettingsActions.setSettingsDescription(value),
    onPosterFileSelected: handlePosterFileSelected,
    onSettingsPosterUrlChange: (value) => campaignSettingsActions.setSettingsPosterUrl(value),
    onSettingsVisibilityChange: (value) => campaignSettingsActions.setSettingsVisibility(value),
    onSettingsSpectatorsEnabledChange: (value) =>
      campaignSettingsActions.setSettingsSpectatorsEnabled(value),
    onSettingsSpectatorMaxChange: (value) => campaignSettingsActions.setSettingsSpectatorMax(value),
    onSettingsSpectatorWaitlistEnabledChange: (value) =>
      campaignSettingsActions.setSettingsSpectatorWaitlistEnabled(value),
    onSettingsSpectatorReconnectGraceSecsChange: (value) =>
      campaignSettingsActions.setSettingsSpectatorReconnectGraceSecs(value),
    onSettingsPostSessionChatEnabledChange: (value) =>
      campaignSettingsActions.setSettingsPostSessionChatEnabled(value),
    onSettingsPostSessionChatDurationMinutesChange: (value) =>
      campaignSettingsActions.setSettingsPostSessionChatDurationMinutes(value),
    onSettingsExtensionSyncPolicyChange: (value) =>
      campaignSettingsActions.setSettingsExtensionSyncPolicy(value),
    onSettingsLateJoinPolicyChange: (value) =>
      campaignSettingsActions.setSettingsLateJoinPolicy(value),
    onSettingsLateJoinGraceMinutesChange: (value) =>
      campaignSettingsActions.setSettingsLateJoinGraceMinutes(value),
    onSettingsDmAutoTargetOnFirstPlayerJoinChange: (value) =>
      campaignSettingsActions.setSettingsDmAutoTargetOnFirstPlayerJoin(value),
    onCopyInviteUrl: (inviteType) => {
      void copyInviteUrl(inviteType)
    },
    onReissueInvite: (inviteType) => {
      requestInviteReissue(inviteType)
    },
    onSaveCampaignSettings: () => {
      void saveCampaignSettings()
    },
    onCharacterFieldChange: handleCharacterFieldChange,
    onSaveCharacterSettings: () => {
      void saveCharacterSettings()
    },
    onBackToLobby: () => {
      setEditorWorkspaceView('lobby')
    },
    onToggleTheme: handleToggleTheme,
    onOpenUserSettings: () => setShowUserSettingsModal(true),
    onLogoff: handleLogoff,
    onLaunch: (campaignId) => {
      setEditorWorkspaceView('lobby')
      void handleEnterCampaign(campaignId)
    },
    onSaveCampaignInfo: handleSaveCampaignInfoPanel,
  })

  const sessionWorkspaceProps = buildSessionWorkspaceProps({
    hasSessionSelected,
    currentSession,
    currentPauseStats,
    configuredCooldownDurationMs,
    canStartFromGreenroom,
    canPauseFromActive,
    canStopFromActive,
    cooldownControlVisible,
    canManageCooldown: Boolean(canManageCooldown),
    cooldownControlLockedReason,
    canExtendCooldown,
    extendCooldownLockedReason,
    onStartSession: handleStartSession,
    onPauseSession: handlePauseSession,
    onStopSession: handleStopSession,
    onCancelCooldown: handleCancelCooldown,
    onExtendCooldown: (sessionId, durationMs) => {
      void handleExtendCooldown(sessionId, durationMs)
    },
    onOpenUserSettings: () => setShowUserSettingsModal(true),
    onExitToSelector: handleExitToCampaignSelector,
    apiUrl,
    token,
    selectedCampaign: selectedCampaign ?? null,
    sessionCount: sessionList.length,
    connectedPlayers,
    connectedSpectatorsCount,
    effectiveSessionRole,
    effectiveSessionUser,
    visibleRooms,
    roomMembersByRoomId: typedRoomMembers,
    selectedRoomId,
    onSelectRoom: handleRoomSelection,
    broadcastModeEnabled,
    onToggleBroadcastMode: handleToggleBroadcastMode,
    dmAutoTargetOnFirstPlayerJoin: settingsDmAutoTargetOnFirstPlayerJoin,
    dmOverrides,
    currentConditionName,
    roomEnvironmentNames,
    wsState,
    wsRetrySecondsRemaining,
    connectionStatus,
    rightRailIndicators,
    partyPresenceRefreshVersion,
    fetchWithAuthGuard,
    selectedRoom: selectedRoom ?? null,
    campaignId: selectedCampaign?.id as UUID | undefined,
    messageGroupingWindowMs,
    sendWsEvent: send,
    isGreenroomChatMode,
    onOpenNotesWorkspace: () => setToolbarCenterPaneView('notes'),
    totalSessionDurationMs: settingsCampaignTotalDurationMs,
    canEditCampaignInfo: Boolean(selectedCampaign && selectedCampaign.currentDmId === user.id),
    onSaveCampaignInfo: handleSaveCampaignInfoPanel,
    campaignIdForSettings: selectedCampaignId,
    sessionSettingsName,
    sessionSettingsDescription,
    sessionSettingsPlannedDurationMinutes,
    canEditSessionSettings,
    onSessionNameChange: setSessionSettingsName,
    onSessionDescriptionChange: setSessionSettingsDescription,
    onPlannedDurationMinutesChange: handlePlannedDurationMinutesChange,
    onSaveSessionSettings: () => {
      void saveSessionSettings()
    },
    isSessionSettingsSaving,
    onDmAutoTargetChange: (value) =>
      campaignSettingsActions.setSettingsDmAutoTargetOnFirstPlayerJoin(value),
    onSaveDmAutoTarget: () => {
      if (selectedCampaignId) void saveDmVoiceTargetingSetting(selectedCampaignId)
    },
    isDmVoiceTargetingSettingSaving,
    isDmVoiceTargetingSettingLoading,
    characterDraft: characterSettingsDraft,
    onCharacterFieldChange: handleCharacterFieldChange,
    onSaveCharacterSettings: () => {
      void saveCharacterSettings()
    },
    isCharacterSettingsLoading,
    isCharacterSettingsSaving,
    userId: user.id,
  })

  const lobbyModalsProps = buildLobbyModalsProps({
    showCreateCampaignModal,
    user,
    newCampaignName,
    isCreatingCampaign,
    onCloseCreateCampaign: () => setShowCreateCampaignModal(false),
    onCreateCampaignSubmit: handleCreateCampaign,
    onNewCampaignNameChange: setNewCampaignName,
    showJoinCampaignModal,
    joinInviteInput,
    isJoiningCampaign,
    onJoinCampaignSubmit: handleJoinCampaign,
    onJoinInviteInputChange: setJoinInviteInput,
    onCloseJoinCampaign: () => setShowJoinCampaignModal(false),
    showCampaignSettingsModal,
    settingsHomeTab,
    onSettingsHomeTabChange: (tab) => campaignSettingsActions.setSettingsHomeTab(tab),
    settingsCampaignSessions,
    settingsReferenceSessionId,
    onSettingsReferenceSessionChange: (sessionId) =>
      campaignSettingsActions.setSettingsReferenceSessionId(sessionId),
    settingsReferenceSession: settingsReferenceSession || null,
    isSettingsLoading,
    settingsData,
    isSettingsSaving,
    onCloseCampaignSettings: () => setShowCampaignSettingsModal(false),
    onSaveCampaignSettings: handleSaveCampaignSettingsSubmit,
    settingsName,
    onSettingsNameChange: (name) => campaignSettingsActions.setSettingsName(name),
    settingsDescription,
    onSettingsDescriptionChange: (desc) => campaignSettingsActions.setSettingsDescription(desc),
    onPosterFileSelected: handlePosterFileSelected,
    isInviteReissuing,
    onCopyInviteUrl: (inviteType) => {
      void copyInviteUrl(inviteType)
    },
    onReissueInvite: (inviteType) => {
      requestInviteReissue(inviteType)
    },
    showReissueInviteModal: pendingInviteReissueType !== null,
    reissueInviteType: pendingInviteReissueType,
    onCloseReissueInviteModal: () => setPendingInviteReissueType(null),
    onConfirmReissueInvite: () => {
      void handleConfirmInviteReissue()
    },
    settingsVisibility,
    onSettingsVisibilityChange: (vis) => campaignSettingsActions.setSettingsVisibility(vis),
    settingsSpectatorsEnabled,
    onSettingsSpectatorsEnabledChange: (enabled) =>
      campaignSettingsActions.setSettingsSpectatorsEnabled(enabled),
    settingsSpectatorMax,
    onSettingsSpectatorMaxChange: (max) => campaignSettingsActions.setSettingsSpectatorMax(max),
    settingsSpectatorWaitlistEnabled,
    onSettingsSpectatorWaitlistEnabledChange: (enabled) =>
      campaignSettingsActions.setSettingsSpectatorWaitlistEnabled(enabled),
    settingsSpectatorReconnectGraceSecs,
    onSettingsSpectatorReconnectGraceSecsChange: (secs) =>
      campaignSettingsActions.setSettingsSpectatorReconnectGraceSecs(secs),
    settingsPostSessionChatEnabled,
    onSettingsPostSessionChatEnabledChange: (enabled) =>
      campaignSettingsActions.setSettingsPostSessionChatEnabled(enabled),
    settingsPostSessionChatDurationMinutes,
    onSettingsPostSessionChatDurationMinutesChange: (value) =>
      campaignSettingsActions.setSettingsPostSessionChatDurationMinutes(value),
    settingsExtensionSyncPolicy,
    onSettingsExtensionSyncPolicyChange: (policy) =>
      campaignSettingsActions.setSettingsExtensionSyncPolicy(policy),
    settingsLateJoinPolicy,
    onSettingsLateJoinPolicyChange: (policy) =>
      campaignSettingsActions.setSettingsLateJoinPolicy(policy),
    settingsLateJoinGraceMinutes,
    onSettingsLateJoinGraceMinutesChange: (mins) =>
      campaignSettingsActions.setSettingsLateJoinGraceMinutes(mins),
    selectedCampaignName: selectedCampaign?.name,
  })

  const sharedModalsProps = buildSharedModalsProps({
    showUserSettingsModal,
    onUserSettingsOpenChange: setShowUserSettingsModal,
    messageGroupingWindowMs,
    onMessageGroupingWindowChange: setMessageGroupingWindowMs,
    apiUrl,
    token,
    user,
  })

  const sessionModalsProps = buildSessionModalsProps({
    showExitSessionModal,
    leaveSessionWarning,
    user,
    exitUpgradePassword,
    onExitUpgradePasswordChange: setExitUpgradePassword,
    exitUpgradeLoading,
    exitUpgradeError,
    onCloseExitSession: () => setShowExitSessionModal(false),
    onSkipGuestUpgrade: handleSkipGuestUpgrade,
    onUpgradeAndExit: () => {
      void handleUpgradeAndExit()
    },
    onConfirmExitAsFullAccount: handleConfirmExitAsFullAccount,
    showStopSessionModal,
    onCloseStopSession: () => setShowStopSessionModal(false),
    onConfirmStopSession: () => {
      void handleConfirmStopSession()
    },
  })

  return (
    <>
      <div
        className={`workspaces-shell ${hasSessionSelected ? 'workspaces-shell-session' : 'workspaces-shell-home workspaces-shell--lobby'}`}
      >
        {lobbyWorkspaceProps && <LobbyView {...lobbyWorkspaceProps} />}

        <EditorWorkspace {...editorWorkspaceProps} />

        <SessionWorkspace {...sessionWorkspaceProps} />
      </div>

      <TooltipProvider delayDuration={140}>
        <>
          <LobbyModals {...lobbyModalsProps} />

          <SharedModals {...sharedModalsProps} />

          <SessionModals {...sessionModalsProps} />
        </>
      </TooltipProvider>
    </>
  )
}
