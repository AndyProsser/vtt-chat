import type { ComponentProps } from 'react'
import type { UUID } from '@shared'
import { SessionWorkspace } from '@/components/workspaces/SessionWorkspace'

type BuildSessionWorkspacePropsParams = {
  hasSessionSelected: boolean
  currentSession: ComponentProps<typeof SessionWorkspace>['currentSession']
  currentPauseStats: ComponentProps<typeof SessionWorkspace>['currentPauseStats']
  configuredCooldownDurationMs: number
  isTransitioningSession: boolean
  canStartFromGreenroom: boolean
  canPauseFromActive: boolean
  canStopFromActive: boolean
  cooldownControlVisible: boolean
  canManageCooldown: boolean
  cooldownControlLockedReason: string | undefined
  canExtendCooldown: boolean
  extendCooldownLockedReason: string | undefined
  onStartSession: ComponentProps<typeof SessionWorkspace>['onStartSession']
  onPauseSession: ComponentProps<typeof SessionWorkspace>['onPauseSession']
  onStopSession: ComponentProps<typeof SessionWorkspace>['onStopSession']
  onCancelCooldown: ComponentProps<typeof SessionWorkspace>['onCancelCooldown']
  onExtendCooldown: ComponentProps<typeof SessionWorkspace>['onExtendCooldown']
  onOpenUserSettings: ComponentProps<typeof SessionWorkspace>['onOpenUserSettings']
  onExitToSelector: ComponentProps<typeof SessionWorkspace>['onExitToSelector']
  apiUrl: string
  token: string
  selectedCampaign: ComponentProps<typeof SessionWorkspace>['selectedCampaign']
  sessions: ComponentProps<typeof SessionWorkspace>['sessions']
  sessionCount: number
  connectedPlayers: number
  connectedSpectatorsCount: number
  effectiveSessionRole: ComponentProps<typeof SessionWorkspace>['effectiveSessionRole']
  effectiveSessionUser: ComponentProps<typeof SessionWorkspace>['effectiveSessionUser']
  visibleRooms: ComponentProps<typeof SessionWorkspace>['visibleRooms']
  roomMembersByRoomId: ComponentProps<typeof SessionWorkspace>['roomMembersByRoomId']
  selectedRoomId: UUID | ''
  onSelectRoom: ComponentProps<typeof SessionWorkspace>['onSelectRoom']
  broadcastModeEnabled: boolean
  onToggleBroadcastMode: ComponentProps<typeof SessionWorkspace>['onToggleBroadcastMode']
  dmAutoTargetOnFirstPlayerJoin: boolean
  dmOverrides: ComponentProps<typeof SessionWorkspace>['dmOverrides']
  currentConditionName: ComponentProps<typeof SessionWorkspace>['currentConditionName']
  roomEnvironmentNames: ComponentProps<typeof SessionWorkspace>['roomEnvironmentNames']
  wsState: ComponentProps<typeof SessionWorkspace>['wsState']
  wsRetrySecondsRemaining: ComponentProps<typeof SessionWorkspace>['wsRetrySecondsRemaining']
  connectionStatus: ComponentProps<typeof SessionWorkspace>['connectionStatus']
  rightRailIndicators: ComponentProps<typeof SessionWorkspace>['rightRailIndicators']
  partyPresenceRefreshVersion: number
  fetchWithAuthGuard: ComponentProps<typeof SessionWorkspace>['fetchWithAuthGuard']
  selectedRoom: ComponentProps<typeof SessionWorkspace>['selectedRoom']
  campaignId: UUID | undefined
  messageGroupingWindowMs: number
  sendWsEvent: ComponentProps<typeof SessionWorkspace>['sendWsEvent']
  isGreenroomChatMode: boolean
  totalSessionDurationMs: number
  canEditCampaignInfo: boolean
  onSaveCampaignInfo: ComponentProps<typeof SessionWorkspace>['onSaveCampaignInfo']
  campaignIdForSettings: UUID | ''
  sessionSettingsName: string
  sessionSettingsPlannedDurationMinutes: number
  defaultSessionDurationMinutes: number
  sessionStartedAt: number | undefined
  canEditSessionSettings: boolean
  canEditEndedSessionName: boolean
  onSessionNameChange: ComponentProps<typeof SessionWorkspace>['onSessionNameChange']
  onPlannedDurationMinutesChange: ComponentProps<
    typeof SessionWorkspace
  >['onPlannedDurationMinutesChange']
  onSaveSessionSettings: ComponentProps<typeof SessionWorkspace>['onSaveSessionSettings']
  isSessionSettingsSaving: boolean
  sessionCampaignPolicy: ComponentProps<typeof SessionWorkspace>['sessionCampaignPolicy']
  characterDraft: ComponentProps<typeof SessionWorkspace>['characterDraft']
  onCharacterFieldChange: ComponentProps<typeof SessionWorkspace>['onCharacterFieldChange']
  onSaveCharacterSettings: ComponentProps<typeof SessionWorkspace>['onSaveCharacterSettings']
  isCharacterSettingsLoading: boolean
  isCharacterSettingsSaving: boolean
  userId: UUID
}

export function buildSessionWorkspaceProps(
  params: BuildSessionWorkspacePropsParams
): ComponentProps<typeof SessionWorkspace> {
  return {
    hasSessionSelected: params.hasSessionSelected,
    currentSession: params.currentSession,
    currentPauseStats: params.currentPauseStats,
    configuredCooldownDurationMs: params.configuredCooldownDurationMs,
    isTransitioningSession: params.isTransitioningSession,
    canStartFromGreenroom: params.canStartFromGreenroom,
    canPauseFromActive: params.canPauseFromActive,
    canStopFromActive: params.canStopFromActive,
    cooldownControlVisible: params.cooldownControlVisible,
    canManageCooldown: params.canManageCooldown,
    cooldownControlLockedReason: params.cooldownControlLockedReason,
    canExtendCooldown: params.canExtendCooldown,
    extendCooldownLockedReason: params.extendCooldownLockedReason,
    onStartSession: params.onStartSession,
    onPauseSession: params.onPauseSession,
    onStopSession: params.onStopSession,
    onCancelCooldown: params.onCancelCooldown,
    onExtendCooldown: params.onExtendCooldown,
    onOpenUserSettings: params.onOpenUserSettings,
    onExitToSelector: params.onExitToSelector,
    apiUrl: params.apiUrl,
    token: params.token,
    selectedCampaign: params.selectedCampaign,
    sessions: params.sessions,
    sessionCount: params.sessionCount,
    connectedPlayers: params.connectedPlayers,
    connectedSpectatorsCount: params.connectedSpectatorsCount,
    effectiveSessionRole: params.effectiveSessionRole,
    effectiveSessionUser: params.effectiveSessionUser,
    visibleRooms: params.visibleRooms,
    roomMembersByRoomId: params.roomMembersByRoomId,
    selectedRoomId: params.selectedRoomId,
    onSelectRoom: params.onSelectRoom,
    broadcastModeEnabled: params.broadcastModeEnabled,
    onToggleBroadcastMode: params.onToggleBroadcastMode,
    dmAutoTargetOnFirstPlayerJoin: params.dmAutoTargetOnFirstPlayerJoin,
    dmOverrides: params.dmOverrides,
    currentConditionName: params.currentConditionName,
    roomEnvironmentNames: params.roomEnvironmentNames,
    wsState: params.wsState,
    wsRetrySecondsRemaining: params.wsRetrySecondsRemaining,
    connectionStatus: params.connectionStatus,
    rightRailIndicators: params.rightRailIndicators,
    partyPresenceRefreshVersion: params.partyPresenceRefreshVersion,
    fetchWithAuthGuard: params.fetchWithAuthGuard,
    selectedRoom: params.selectedRoom,
    campaignId: params.campaignId,
    messageGroupingWindowMs: params.messageGroupingWindowMs,
    sendWsEvent: params.sendWsEvent,
    isGreenroomChatMode: params.isGreenroomChatMode,
    totalSessionDurationMs: params.totalSessionDurationMs,
    canEditCampaignInfo: params.canEditCampaignInfo,
    onSaveCampaignInfo: params.onSaveCampaignInfo,
    campaignIdForSettings: params.campaignIdForSettings,
    sessionSettingsName: params.sessionSettingsName,
    sessionSettingsPlannedDurationMinutes: params.sessionSettingsPlannedDurationMinutes,
    defaultSessionDurationMinutes: params.defaultSessionDurationMinutes,
    sessionStartedAt: params.sessionStartedAt,
    canEditSessionSettings: params.canEditSessionSettings,
    canEditEndedSessionName: params.canEditEndedSessionName,
    onSessionNameChange: params.onSessionNameChange,
    onPlannedDurationMinutesChange: params.onPlannedDurationMinutesChange,
    onSaveSessionSettings: params.onSaveSessionSettings,
    isSessionSettingsSaving: params.isSessionSettingsSaving,
    sessionCampaignPolicy: params.sessionCampaignPolicy,
    characterDraft: params.characterDraft,
    onCharacterFieldChange: params.onCharacterFieldChange,
    onSaveCharacterSettings: params.onSaveCharacterSettings,
    isCharacterSettingsLoading: params.isCharacterSettingsLoading,
    isCharacterSettingsSaving: params.isCharacterSettingsSaving,
    userId: params.userId,
  }
}
