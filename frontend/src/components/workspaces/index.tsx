/**
 * Session Initialization
 * Component for creating a new session and transitioning to active state.
 * Tests the full UI → Event → Store pipeline.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
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
import {
  SessionWorkspaceChromeConnector,
  SESSION_WORKSPACE_CONNECTOR_PLACEHOLDERS,
} from '@/components/workspaces/session/SessionWorkspaceChromeConnector'
import { SessionModals } from '@/components/workspaces/session/modals/SessionModals'
import { buildSessionModalsProps } from '@/components/workspaces/session/modals/sessionModals.props'
import type { PlayerSettingsPanel } from '@/components/workspaces/shared/panels/PlayerSettingsPanel'
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
import { useWorkspacesActiveSessionContext } from '@/hooks/session/useWorkspacesActiveSessionContext'
import { useWorkspacesUiEffects } from '@/hooks/session/useWorkspacesUiEffects'
import { useWorkspacesApiBootstrap } from '@/hooks/session/useWorkspacesApiBootstrap'
import { useWorkspacesSessionAnchors } from '@/hooks/session/useWorkspacesSessionAnchors'
import { useWorkspacesGreenroomCarryLifecycle } from '@/hooks/session/useWorkspacesGreenroomCarryLifecycle'
import { useWorkspacesSettingsStateBridge } from '@/hooks/session/useWorkspacesSettingsStateBridge'
import { useWorkspacesInitializationLifecycle } from '@/hooks/session/useWorkspacesInitializationLifecycle'
import { useWorkspacesLobbyData } from '@/hooks/session/useWorkspacesLobbyData'
import { useWorkspacesMemoryPressureGuard } from '@/hooks/session/useWorkspacesMemoryPressureGuard'
import { useWorkspacesSessionOrchestration } from '@/hooks/session/useWorkspacesSessionOrchestration'
import { useWorkspacesCampaignSettingsActions } from '@/hooks/session/useWorkspacesCampaignSettingsActions'
import { useWorkspacesUiCallbacks } from '@/hooks/session/useWorkspacesUiCallbacks'
import { useCampaignSessionsDataFetcher } from '@/hooks/session/useCampaignSessionsDataFetcher'
import { useConnectionStatus } from '@/hooks/useConnectionStatus'
import { useSessionLeaveWarning } from '@/hooks/session/useSessionLeaveWarning'
import { useFrontendThemeMode } from '@/hooks/useFrontendThemeMode'
import { useToast } from '@/hooks/useToast'
import { isJournalNote } from '@/utils/notesPanel'
import { DEFAULT_PLANNED_DURATION_MINUTES } from '@/constants/workspaces.constants'
import type { Session as SessionRecord } from '@/types/session'
import { resolveMembershipRole } from '@/types/session/campaign'
import type {
  ApiBroadcastState,
  WorkspacesProps as WorkspaceInitializationProps,
} from '@/types/session/workspaces'
import {
  getInitialCampaignRestorePending,
  getInitialMessageGroupingWindowMs,
  toNullableUuid,
} from '@/utils/session/workspaceInitialization'
import { toValidPostSessionDurationMinutes } from '@/utils/session/workspaces'
import type { EditorWorkspaceView } from '@/types/workspaces'
import '@/styles/components/workspaces/Workspaces.css'

const EMPTY_PAUSE_STATS = {
  cumulativePauseMs: 0,
  pauseCount: 0,
  pauseStartedAt: undefined,
}

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
  const [isDeletingCampaign, setIsDeletingCampaign] = useState(false)
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
    settingsDefaultSessionDurationMins,
    settingsSupportedPlatforms,
  } = campaignSettings

  // Character settings hook
  const [characterSettings, characterSettingsActions] = useCharacterSettings()
  const {
    isCharacterSettingsLoading,
    isCharacterSettingsSaving,
    userCharacters,
    selectedCharacterId,
    characterSettingsPanel,
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
  const [sessionSettingsPlannedDurationMinutes, setSessionSettingsPlannedDurationMinutes] =
    useState(DEFAULT_PLANNED_DURATION_MINUTES)
  const [isSessionSettingsSaving, setIsSessionSettingsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lobbyNotice, setLobbyNotice] = useState<string | null>(null)
  const [dismissedTransitionEventId, setDismissedTransitionEventId] = useState<string | null>(null)
  const [messageGroupingWindowMs, setMessageGroupingWindowMs] = useState<number>(
    getInitialMessageGroupingWindowMs
  )
  const lobbyAutoEnterTriggeredRef = useRef(false)
  const pendingGreenroomCarryBySessionIdRef = useRef<Map<UUID, UUID>>(new Map())
  const hasSignaledReadyRef = useRef(false)
  const [isCampaignRestorePending, setIsCampaignRestorePending] = useState<boolean>(
    getInitialCampaignRestorePending
  )

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

  const fetchCampaignSessionsData = useCampaignSessionsDataFetcher({
    apiUrl,
    token,
    fetchWithAuthGuard,
  })

  // Store
  const currentSessionId = useStore((state) => state.currentSessionId)
  const currentSession = useStore((state) => {
    if (!state.currentSessionId) {
      return null
    }

    const sessionsById = state.sessions as Record<UUID, SessionRecord>
    return sessionsById[state.currentSessionId] ?? null
  })
  const sessionList = useStore(
    useShallow((state) => Object.values(state.sessions as Record<UUID, SessionRecord>))
  )
  const addNote = useStore((state) => state.addNote)
  const addMessage = useStore((state) => state.addMessage)
  const currentTransitionNotice = useStore((state) => {
    if (!state.currentSessionId) {
      return undefined
    }

    return state.sessionTransitionNotice[state.currentSessionId]
  })
  const setBroadcastState = useStore((state) => state.setBroadcastState)
  const setEnvironment = useStore((state) => state.setEnvironment)
  const replaceRoomEnvironmentNames = useStore((state) => state.replaceRoomEnvironmentNames)
  const replaceDMOverrides = useStore((state) => state.replaceDMOverrides)
  const clearSessions = useStore((state) => state.clearSessions)
  const replaceSessions = useStore((state) => state.replaceSessions)
  const replaceSessionTopology = useStore((state) => state.replaceSessionTopology)
  const replaceSessionStatsSnapshot = useStore((state) => state.replaceSessionStatsSnapshot)
  const setMockTakeoverUserId = useStore((state) => state.setMockTakeoverUserId)
  const setCurrentSession = useStore((state) => state.setCurrentSession)
  const setIsGreenroom = useStore((state) => state.setIsGreenroom)
  const resetToolbarActionsState = useStore((state) => state.resetToolbarActionsState)
  const setToolbarCenterPaneView = useStore((state) => state.setToolbarCenterPaneView)
  const setSelectedRoomIdOverride = useStore((state) => state.setSelectedRoomIdOverride)
  const selectedRoomIdOverrideBySessionId = useStore(
    (state) => state.selectedRoomIdOverrideBySessionId
  )
  const selectedRoomIdOverride = selectedRoomIdOverrideBySessionId[currentSessionId || ''] ?? ''
  const updateSession = useStore((state) => state.updateSession)
  const setCooldownExtensionCount = useStore((state) => state.setCooldownExtensionCount)
  const cooldownExtensionCounts = useStore((state) => state.cooldownExtensionCounts)
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
    loadLobbyCampaignData,
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

  const selectedCharacter = useMemo(
    () =>
      userCharacters.find((character) => character.id === selectedCharacterId) ||
      userCharacters.find((character) => character.isActive) ||
      userCharacters[0] ||
      null,
    [selectedCharacterId, userCharacters]
  )

  const handlePlannedDurationMinutesChange = useCallback((nextValue: number) => {
    if (!Number.isFinite(nextValue)) {
      return
    }

    const clamped = Math.max(15, Math.min(720, Math.round(nextValue)))
    setSessionSettingsPlannedDurationMinutes(clamped)
  }, [])

  const {
    loadCampaignSettings,
    saveSessionSettings,
    openEditorCampaignWorkspace,
    saveCampaignSettings,
    handleSaveCampaignInfoPanel,
    loadDmVoiceTargetingSetting,
  } = useWorkspacesSettingsOrchestration({
    apiUrl,
    token,
    fetchWithAuthGuard,
    campaignSettingsController,
    campaignSettingsActions,
    currentSession,
    sessionSettingsName,
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
    settingsDefaultSessionDurationMins,
    settingsSupportedPlatforms,
    settingsData,
    setCampaigns,
    setSelectedCampaignId,
    setEditorWorkspaceView,
    setError,
    setLobbyNotice,
  })

  const { handleCharacterFieldChange, saveCharacterSettings, loadUserCharacters } =
    useWorkspacesCharacterSettingsOrchestration({
      characterSettingsController,
      characterSettingsActions,
      selectedCampaignId,
      selectedCharacterId,
      characterSettingsPanel,
      setError,
      setLobbyNotice,
    })

  useWorkspacesSettingsStateBridge({
    currentSession,
    defaultPlannedDurationMinutes: DEFAULT_PLANNED_DURATION_MINUTES,
    setSessionSettingsName,
    setSessionSettingsPlannedDurationMinutes,
    selectedCharacter,
    setSelectedCharacterId: characterSettingsActions.setSelectedCharacterId,
    setCharacterSettingsDraft: characterSettingsActions.setCharacterSettingsDraft,
  })

  const { restoreSessionBookendsFromHistory } = useWorkspacesSessionAnchors({
    apiUrl,
    token,
    currentSessionId,
    currentSessionState: currentSession?.state ?? null,
    wsState,
    fetchWithAuthGuard,
    updateSession,
    addMessage,
  })

  const activeTransitionNotice =
    currentTransitionNotice && currentTransitionNotice.eventId !== dismissedTransitionEventId
      ? currentTransitionNotice
      : undefined

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

  useWorkspacesMemoryPressureGuard({
    enabled: true,
    showToast,
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
    setEnvironment,
    replaceRoomEnvironmentNames,
    replaceDMOverrides,
    setBroadcastState,
    lastHydratedSessionFingerprintRef,
    prevWsStateRef,
  })

  useWorkspacesInitializationLifecycle({
    currentSessionId,
    currentSession,
    isLoadingCampaigns,
    isCampaignRestorePending,
    hasSignaledReadyRef,
    onReady,
    loadUserCharacters,
    selectedCampaignId,
    loadDmVoiceTargetingSetting,
  })

  const ensureSessionMembership = useCallback(
    async (sessionId: UUID) => {
      await sessionMembershipController.ensureSessionMembership(sessionId)
    },
    [sessionMembershipController]
  )

  const handleRoomSelection = useCallback(
    (roomId: UUID) => {
      if (currentSessionId) {
        setSelectedRoomIdOverride(currentSessionId, roomId)
      }
    },
    [currentSessionId, setSelectedRoomIdOverride]
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

  const {
    handleCreateCampaign,
    handleJoinCampaign,
    handleEnterCampaign,
    startCampaignSession,
    handleJoinRequest,
    handleWatchCampaign,
    handleLoadPendingJoinRequests,
    handleResolveJoinRequest,
    handleDeleteCampaign,
  } = useWorkspacesCampaignEntryOrchestration({
    apiUrl,
    token,
    userId: user.id,
    userAuthType: user.authType,
    campaigns,
    selectedCampaignId,
    sessionNameBase: sessionSettingsName,
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
    refreshLobbyCampaignData: loadLobbyCampaignData,
    setError,
    setLobbyNotice,
    fetchWithAuthGuard,
    fetchCampaignSessionsData,
    ensureSessionMembership,
    replaceSessions,
    setCurrentSession,
    openEditorCampaignWorkspace,
    onSessionCreated,
    onCampaignDeleted: () => {
      setIsDeletingCampaign(false)
    },
  })

  const {
    activeTransitionSessionId,
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

  const {
    handleToggleTheme,
    handleOpenCreateCampaignModal,
    handleOpenJoinCampaignModal,
    handleOpenUserSettingsModal,
    handleBackToLobbyWorkspace,
    handleLaunchFromEditor,
  } = useWorkspacesUiCallbacks({
    toggleThemeMode,
    setShowCreateCampaignModal,
    setShowJoinCampaignModal,
    setShowUserSettingsModal,
    setEditorWorkspaceView,
    handleEnterCampaign,
  })

  const hasSessionSelected = Boolean(currentSession)
  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null
  const settingsReferenceSession =
    settingsCampaignSessions.find((session) => session.id === settingsReferenceSessionId) ?? null
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
  const connectionStatus = useConnectionStatus({
    wsState,
    sessionId: currentSession?.id ?? null,
    roomId: selectedRoomIdOverride || null,
  })
  const membershipRole = resolveMembershipRole(selectedCampaign?.memberRole)
  const configuredCooldownDurationMs = Math.max(
    60_000,
    toValidPostSessionDurationMinutes(settingsPostSessionChatDurationMinutes) * 60_000
  )
  const effectiveSessionRole = currentSession?.dmId === user.id ? Role.DM : membershipRole
  const leaveSessionWarning = useSessionLeaveWarning(effectiveSessionRole, currentSession?.state)
  const canEditSessionSettings =
    currentSession?.state === SessionState.IDLE ||
    currentSession?.state === SessionState.ACTIVE ||
    currentSession?.state === SessionState.PAUSED
  const canEditEndedSessionName =
    Boolean(currentSession?.dmId === user.id) && currentSession?.state === SessionState.ENDED

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
    onCreateCampaign: handleOpenCreateCampaignModal,
    onJoinCampaign: handleOpenJoinCampaignModal,
    onToggleTheme: handleToggleTheme,
    onOpenUserSettings: handleOpenUserSettingsModal,
    onLogoff: handleLogoff,
    onOpenCampaignSettings: openEditorCampaignWorkspace,
    onEnterCampaign: (campaignId) => {
      void handleEnterCampaign(campaignId)
    },
    onJoinRequest: handleJoinRequest,
    onWatchCampaign: handleWatchCampaign,
    onLoadPendingJoinRequests: handleLoadPendingJoinRequests,
    onResolveJoinRequest: handleResolveJoinRequest,
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
    currentSessionState: currentSession?.state ?? null,
    userId: user.id,
    partyPresenceRefreshVersion,
    fetchWithAuthGuard,
    connectionStatus,
    settingsCampaignSessionsCount: settingsCampaignSessions.length,
    settingsCampaignTotalDurationMs,
    settingsCampaignSessions,
    settingsReferenceSessionId: toNullableUuid(settingsReferenceSessionId),
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
    settingsDefaultSessionDurationMins,
    settingsSupportedPlatforms,
    sessionSettingsName,
    selectedCampaignId,
    characterSettingsPanel,
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
    onSettingsDefaultSessionDurationMinsChange: (value) =>
      campaignSettingsActions.setSettingsDefaultSessionDurationMins(value),
    onSettingsSupportedPlatformsChange: (value) =>
      campaignSettingsActions.setSettingsSupportedPlatforms(value),
    onSessionNameChange: setSessionSettingsName,
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
    onSettingsReferenceSessionChange: (sessionId) =>
      campaignSettingsActions.setSettingsReferenceSessionId(sessionId),
    onBackToLobby: handleBackToLobbyWorkspace,
    onToggleTheme: handleToggleTheme,
    onOpenUserSettings: handleOpenUserSettingsModal,
    onLaunch: handleLaunchFromEditor,
    onSaveCampaignInfo: handleSaveCampaignInfoPanel,
    onDeleteCampaign: async (campaignId) => {
      setIsDeletingCampaign(true)
      try {
        await handleDeleteCampaign(campaignId)
      } finally {
        setIsDeletingCampaign(false)
      }
    },
    isDeletingCampaign,
  })

  const handleSessionWorkspaceExtendCooldown = useCallback(
    (sessionId: UUID, durationMs: number) => {
      void handleExtendCooldown(sessionId, durationMs)
    },
    [handleExtendCooldown]
  )

  const handleSessionWorkspaceSaveSettings = useCallback(() => {
    void saveSessionSettings()
    void saveCampaignSettings()
  }, [saveCampaignSettings, saveSessionSettings])

  const handleSessionWorkspaceSaveCharacterSettings = useCallback(() => {
    void saveCharacterSettings()
  }, [saveCharacterSettings])

  const sessionWorkspaceCampaignPolicy = useMemo(
    () => ({
      settingsDmAutoTargetOnFirstPlayerJoin,
      onSettingsDmAutoTargetOnFirstPlayerJoinChange: (value: boolean) =>
        campaignSettingsActions.setSettingsDmAutoTargetOnFirstPlayerJoin(value),
      settingsLateJoinPolicy,
      onSettingsLateJoinPolicyChange: (value: typeof settingsLateJoinPolicy) =>
        campaignSettingsActions.setSettingsLateJoinPolicy(value),
      settingsLateJoinGraceMinutes,
      onSettingsLateJoinGraceMinutesChange: (value: number) =>
        campaignSettingsActions.setSettingsLateJoinGraceMinutes(value),
      settingsSpectatorsEnabled,
      onSettingsSpectatorsEnabledChange: (value: boolean) =>
        campaignSettingsActions.setSettingsSpectatorsEnabled(value),
      settingsSpectatorMax,
      onSettingsSpectatorMaxChange: (value: number) =>
        campaignSettingsActions.setSettingsSpectatorMax(value),
      settingsSpectatorWaitlistEnabled,
      onSettingsSpectatorWaitlistEnabledChange: (value: boolean) =>
        campaignSettingsActions.setSettingsSpectatorWaitlistEnabled(value),
      settingsSpectatorReconnectGraceSecs,
      onSettingsSpectatorReconnectGraceSecsChange: (value: number) =>
        campaignSettingsActions.setSettingsSpectatorReconnectGraceSecs(value),
      settingsPostSessionChatEnabled,
      onSettingsPostSessionChatEnabledChange: (value: boolean) =>
        campaignSettingsActions.setSettingsPostSessionChatEnabled(value),
    }),
    [
      campaignSettingsActions,
      settingsDmAutoTargetOnFirstPlayerJoin,
      settingsLateJoinGraceMinutes,
      settingsLateJoinPolicy,
      settingsPostSessionChatEnabled,
      settingsSpectatorMax,
      settingsSpectatorReconnectGraceSecs,
      settingsSpectatorWaitlistEnabled,
      settingsSpectatorsEnabled,
    ]
  )

  const sessionWorkspaceProps = useMemo(
    () =>
      buildSessionWorkspaceProps({
        hasSessionSelected,
        currentSession,
        currentPauseStats: SESSION_WORKSPACE_CONNECTOR_PLACEHOLDERS.currentPauseStats,
        configuredCooldownDurationMs,
        isTransitioningSession: activeTransitionSessionId === currentSession?.id,
        canStartFromGreenroom: false,
        canPauseFromActive: false,
        canStopFromActive: false,
        cooldownControlVisible: false,
        canManageCooldown: false,
        cooldownControlLockedReason: undefined,
        canExtendCooldown: false,
        extendCooldownLockedReason: undefined,
        onStartSession: handleStartSession,
        onPauseSession: handlePauseSession,
        onStopSession: handleStopSession,
        onCancelCooldown: handleCancelCooldown,
        onExtendCooldown: handleSessionWorkspaceExtendCooldown,
        onOpenUserSettings: handleOpenUserSettingsModal,
        onExitToSelector: handleExitToCampaignSelector,
        apiUrl,
        token,
        selectedCampaign: selectedCampaign ?? null,
        sessions: sessionList,
        sessionCount: sessionList.length,
        connectedPlayers: 0,
        connectedSpectatorsCount: 0,
        effectiveSessionRole,
        effectiveSessionUser: user,
        selectedRoomId: '',
        onSelectRoom: handleRoomSelection,
        onToggleBroadcastMode: handleToggleBroadcastMode,
        dmAutoTargetOnFirstPlayerJoin: settingsDmAutoTargetOnFirstPlayerJoin,
        wsState,
        wsRetrySecondsRemaining,
        rightRailIndicators: SESSION_WORKSPACE_CONNECTOR_PLACEHOLDERS.rightRailIndicators,
        partyPresenceRefreshVersion,
        fetchWithAuthGuard,
        campaignId: selectedCampaign?.id as UUID | undefined,
        messageGroupingWindowMs,
        sendWsEvent: send,
        totalSessionDurationMs: settingsCampaignTotalDurationMs,
        canEditCampaignInfo: Boolean(selectedCampaign && selectedCampaign.currentDmId === user.id),
        onSaveCampaignInfo: handleSaveCampaignInfoPanel,
        campaignIdForSettings: selectedCampaignId,
        sessionSettingsName,
        sessionSettingsPlannedDurationMinutes,
        defaultSessionDurationMinutes: settingsDefaultSessionDurationMins,
        sessionStartedAt: currentSession?.startedAt,
        canEditSessionSettings,
        canEditEndedSessionName,
        onSessionNameChange: setSessionSettingsName,
        onPlannedDurationMinutesChange: handlePlannedDurationMinutesChange,
        onSaveSessionSettings: handleSessionWorkspaceSaveSettings,
        isSessionSettingsSaving,
        sessionCampaignPolicy: sessionWorkspaceCampaignPolicy,
        characterDraft: characterSettingsPanel,
        onCharacterFieldChange: handleCharacterFieldChange,
        onSaveCharacterSettings: handleSessionWorkspaceSaveCharacterSettings,
        isCharacterSettingsLoading,
        isCharacterSettingsSaving,
        userId: user.id,
      }),
    [
      activeTransitionSessionId,
      apiUrl,
      canEditSessionSettings,
      canEditEndedSessionName,
      characterSettingsPanel,
      configuredCooldownDurationMs,
      connectionStatus,
      currentSession,
      effectiveSessionRole,
      fetchWithAuthGuard,
      handleCancelCooldown,
      handleCharacterFieldChange,
      handleOpenUserSettingsModal,
      handlePauseSession,
      handlePlannedDurationMinutesChange,
      handleRoomSelection,
      handleSessionWorkspaceExtendCooldown,
      handleSessionWorkspaceSaveCharacterSettings,
      handleSessionWorkspaceSaveSettings,
      handleExitToCampaignSelector,
      handleSaveCampaignInfoPanel,
      handleStartSession,
      handleStopSession,
      handleToggleBroadcastMode,
      hasSessionSelected,
      isCharacterSettingsLoading,
      isCharacterSettingsSaving,
      isSessionSettingsSaving,
      messageGroupingWindowMs,
      partyPresenceRefreshVersion,
      selectedCampaign,
      selectedCampaignId,
      send,
      sessionList,
      sessionSettingsName,
      sessionSettingsPlannedDurationMinutes,
      sessionWorkspaceCampaignPolicy,
      settingsCampaignTotalDurationMs,
      settingsDefaultSessionDurationMins,
      settingsDmAutoTargetOnFirstPlayerJoin,
      setSessionSettingsName,
      token,
      user,
      wsRetrySecondsRemaining,
      wsState,
    ]
  )

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

        <SessionWorkspaceChromeConnector
          baseProps={sessionWorkspaceProps}
          campaigns={campaigns}
          selectedCampaignId={selectedCampaignId}
          settingsCampaignSessions={settingsCampaignSessions}
          settingsReferenceSessionId={settingsReferenceSessionId}
          settingsPostSessionChatDurationMinutes={settingsPostSessionChatDurationMinutes}
          cooldownExtensionCounts={cooldownExtensionCounts}
          user={user}
        />
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
