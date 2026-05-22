/**
 * Session Initialization
 * Component for creating a new session and transitioning to active state.
 * Tests the full UI → Event → Store pipeline.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SessionState, Role, isGreenroomSessionState } from '@shared'
import type { UUID } from '@shared'
import { PresenceState, RoomType } from '@shared'
import { useStore } from '@/hooks/useStore'
import { useWebSocket } from '../../hooks/useWebSocket'
import { useCampaignSettings } from '../../hooks/useCampaignSettings'
import { useCharacterSettings } from '../../hooks/useCharacterSettings'
import { useSessionLifecycle } from '../../hooks/useSessionLifecycle'
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
import { useWorkspacesActiveSessionContext } from '@/hooks/session/useWorkspacesActiveSessionContext'
import { useWorkspacesUiEffects } from '@/hooks/session/useWorkspacesUiEffects'
import { useWorkspacesApiBootstrap } from '@/hooks/session/useWorkspacesApiBootstrap'
import { useWorkspacesSessionAnchors } from '@/hooks/session/useWorkspacesSessionAnchors'
import { useWorkspacesGreenroomCarryLifecycle } from '@/hooks/session/useWorkspacesGreenroomCarryLifecycle'
import { useWorkspacesAudioProjection } from '@/hooks/session/useWorkspacesAudioProjection'
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
import type { Session as SessionRecord } from '@/types/session'
import type {
  Room as RoomRecord,
  RoomUser as RoomMember,
  SessionPresence as PresenceRecord,
} from '@/types/room'
import type {
  ApiBroadcastState,
  ApiSessionStats,
  WorkspacesProps as WorkspaceInitializationProps,
} from '@/types/session/workspaces'
import {
  buildCharacterDraft,
  getVisibleRoomsForSessionState,
  isGreenRoom,
  safeLocalStorageGetItem,
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

  const {
    clearPersistedActiveSessionContext,
    forceLogoutToAuthScreen,
    fetchWithAuthGuard,
    handleWebSocketAuthFailure,
    campaignSettingsController,
    characterSettingsController,
    sessionMembershipController,
  } = useWorkspacesApiBootstrap({
    apiUrl,
    token,
  })

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

  useWorkspacesAudioProjection({
    currentSession,
    currentPresence,
    effectiveActorUserId,
    currentRooms,
    setPrivateRoomCleanMode,
    connectedRoomId,
    currentEnvironment,
    clearEnvironment,
    roomEnvironmentNames,
    setEnvironment,
  })

  const { restoreSessionBookendsFromHistory } = useWorkspacesSessionAnchors({
    apiUrl,
    token,
    currentSessionId,
    fetchWithAuthGuard,
    updateSession,
    addMessage,
  })

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

  useWorkspacesGreenroomCarryLifecycle({
    currentSession,
    currentRooms,
    typedRoomsBySession,
    pendingGreenroomCarryBySessionIdRef,
  })

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

  useWorkspacesUiEffects({
    messageGroupingWindowMs,
    activeTransitionNotice,
    setDismissedTransitionEventId,
    error,
    setError,
    lobbyNotice,
    setLobbyNotice,
    showToast,
  })

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

  useWorkspacesActiveSessionContext({
    isLoadingCampaigns,
    currentSessionId,
    lobbyAutoEnterTriggeredRef,
    campaigns,
    clearPersistedActiveSessionContext,
    setIsCampaignRestorePending,
    handleEnterCampaign,
    currentSession,
    selectedCampaignId,
  })

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
