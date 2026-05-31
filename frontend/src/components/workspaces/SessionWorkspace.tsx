import { memo, useCallback, useState } from 'react'
import { ReconnectBanner } from '@/components/ui/ReconnectBanner'
import { SessionWorkspaceFrame } from '@/components/workspaces/session/WorkspaceFrame'
import { SessionToolbar } from '@/components/workspaces/shared/toolbar/SessionToolbar'
import { SessionWorkspaceLeftRail } from '@/components/workspaces/session/LeftRail'
import { SessionWorkspaceCenterPane } from '@/components/workspaces/session/CenterPane'
import { SessionWorkspaceRightRailTab } from '@/components/workspaces/session/RightRailTab'
import type { ToolbarActionModel } from '@/types/toolbar'
import type { CenterPaneView, RightRailTab } from '@/types/ui'
import type { SessionWorkspaceProps } from '@/types/sessionWorkspace'

function SessionWorkspaceComponent(props: SessionWorkspaceProps) {
  const [forcedRightRailTab, setForcedRightRailTab] = useState<'settings' | null>(null)
  const [playerSettingsFocusRequestKey, setPlayerSettingsFocusRequestKey] = useState(0)
  const [chatUnreadCount, setChatUnreadCount] = useState(0)
  const handleOpenPlayerSettingsFromParty = useCallback(() => {
    setPlayerSettingsFocusRequestKey((current) => current + 1)
    setForcedRightRailTab('settings')
  }, [])
  const handleForcedRightRailTabApplied = useCallback(() => {
    setForcedRightRailTab(null)
  }, [])
  const handleStartSession = useCallback(() => {
    if (!props.currentSession) {
      return
    }

    props.onStartSession(props.currentSession.id)
  }, [props.currentSession, props.onStartSession])

  const handlePauseSession = useCallback(() => {
    if (!props.currentSession) {
      return
    }

    props.onPauseSession(props.currentSession.id)
  }, [props.currentSession, props.onPauseSession])

  const handleCancelCooldown = useCallback(() => {
    if (!props.currentSession) {
      return
    }

    props.onCancelCooldown(props.currentSession.id)
  }, [props.currentSession, props.onCancelCooldown])

  const handleExtendCooldown = useCallback(() => {
    if (!props.currentSession) {
      return
    }

    props.onExtendCooldown(props.currentSession.id, props.configuredCooldownDurationMs)
  }, [props.configuredCooldownDurationMs, props.currentSession, props.onExtendCooldown])

  const renderSystemToasts = useCallback(
    () => (
      <ReconnectBanner
        wsState={props.wsState}
        manualRetryCountdownSeconds={props.wsRetrySecondsRemaining}
      />
    ),
    [props.wsRetrySecondsRemaining, props.wsState]
  )

  const renderToolbar = useCallback(
    (actions: ToolbarActionModel) => {
      if (!props.currentSession) {
        return null
      }

      return (
        <SessionToolbar
          actions={actions}
          statusColorKey={props.connectionStatus.statusColorKey}
          statusLabel={props.connectionStatus.label}
          coreWsState={props.connectionStatus.coreWsState}
          livekitState={props.connectionStatus.livekitState}
          sessionId={props.currentSession.id}
          sessionState={props.currentSession.state}
          cooldownDurationMs={props.configuredCooldownDurationMs}
          isTransitioningSession={props.isTransitioningSession}
          canStartSession={props.canStartFromGreenroom}
          canPauseSession={props.canPauseFromActive}
          canStopSession={props.canStopFromActive}
          showCooldownControls={props.cooldownControlVisible}
          canManageCooldown={Boolean(props.canManageCooldown)}
          cooldownControlLockedReason={props.cooldownControlLockedReason}
          canExtendCooldown={props.canExtendCooldown}
          extendCooldownLockedReason={props.extendCooldownLockedReason}
          onStartSession={handleStartSession}
          onPauseSession={handlePauseSession}
          onStopSession={props.onStopSession}
          onCancelCooldown={handleCancelCooldown}
          onExtendCooldown={handleExtendCooldown}
          onOpenUserSettings={props.onOpenUserSettings}
          onExitToSelector={props.onExitToSelector}
        />
      )
    },
    [
      props.canExtendCooldown,
      props.canManageCooldown,
      props.canPauseFromActive,
      props.canStartFromGreenroom,
      props.canStopFromActive,
      props.configuredCooldownDurationMs,
      props.connectionStatus.coreWsState,
      props.connectionStatus.label,
      props.connectionStatus.livekitState,
      props.connectionStatus.statusColorKey,
      props.cooldownControlLockedReason,
      props.cooldownControlVisible,
      props.extendCooldownLockedReason,
      handleCancelCooldown,
      handleExtendCooldown,
      handlePauseSession,
      handleStartSession,
      props.isTransitioningSession,
      props.currentSession,
      props.onExitToSelector,
      props.onOpenUserSettings,
      props.onStopSession,
    ]
  )

  const renderLeftRail = useCallback(
    ({
      openInformationPanel,
    }: {
      openRightRailTab: (tab: RightRailTab) => void
      openInformationPanel: () => void
    }) => {
      if (!props.currentSession) {
        return null
      }

      return (
        <SessionWorkspaceLeftRail
          onOpenInfoPanel={openInformationPanel}
          apiUrl={props.apiUrl}
          token={props.token}
          sessionId={props.currentSession.id}
          selectedCampaignName={props.selectedCampaign?.name}
          selectedCampaignDescription={props.selectedCampaign?.description ?? undefined}
          effectiveSessionRole={props.effectiveSessionRole}
          sessionState={props.currentSession.state}
          sessionName={props.currentSession.name}
          sessionCount={props.sessionCount}
          connectedPlayers={props.connectedPlayers}
          connectedSpectatorsCount={props.connectedSpectatorsCount}
          dmUserId={props.currentSession.dmId}
          effectiveSessionUserId={props.effectiveSessionUser.id}
          visibleRooms={props.visibleRooms}
          roomMembersByRoomId={props.roomMembersByRoomId}
          selectedRoomId={props.selectedRoomId}
          onSelectRoom={props.onSelectRoom}
          broadcastModeEnabled={props.broadcastModeEnabled}
          onToggleBroadcastMode={props.onToggleBroadcastMode}
          dmAutoTargetOnFirstPlayerJoin={props.dmAutoTargetOnFirstPlayerJoin}
          dmOverrides={props.dmOverrides}
          currentConditionName={props.currentConditionName}
          roomEnvironmentNames={props.roomEnvironmentNames ?? {}}
          sessionEndedAt={props.currentSession.endedAt}
          configuredCooldownDurationMs={props.configuredCooldownDurationMs}
        />
      )
    },
    [
      props.apiUrl,
      props.broadcastModeEnabled,
      props.configuredCooldownDurationMs,
      props.connectedPlayers,
      props.connectedSpectatorsCount,
      props.currentConditionName,
      props.currentSession,
      props.dmAutoTargetOnFirstPlayerJoin,
      props.dmOverrides,
      props.effectiveSessionRole,
      props.effectiveSessionUser.id,
      props.onSelectRoom,
      props.onToggleBroadcastMode,
      props.roomEnvironmentNames,
      props.roomMembersByRoomId,
      props.selectedCampaign,
      props.selectedRoomId,
      props.sessionCount,
      props.token,
      props.visibleRooms,
    ]
  )

  const renderCenterPane = useCallback(
    (view: CenterPaneView) => {
      if (!props.currentSession) {
        return null
      }

      return (
        <SessionWorkspaceCenterPane
          view={view}
          effectiveSessionRole={props.effectiveSessionRole}
          currentSessionState={props.currentSession.state}
          sessionEndedAt={props.currentSession.endedAt}
          configuredCooldownDurationMs={props.configuredCooldownDurationMs}
          selectedRoomId={props.selectedRoomId}
          apiUrl={props.apiUrl}
          token={props.token}
          currentSessionId={props.currentSession.id}
          selectedRoom={props.selectedRoom}
          campaignId={props.campaignId}
          effectiveSessionUser={props.effectiveSessionUser}
          messageGroupingWindowMs={props.messageGroupingWindowMs}
          sendWsEvent={props.sendWsEvent}
          isGreenroomChatMode={props.isGreenroomChatMode}
          onPendingNewMessageCountChange={setChatUnreadCount}
        />
      )
    },
    [
      props.apiUrl,
      props.campaignId,
      props.configuredCooldownDurationMs,
      props.currentSession,
      props.effectiveSessionRole,
      props.effectiveSessionUser,
      props.isGreenroomChatMode,
      props.messageGroupingWindowMs,
      props.selectedRoom,
      props.selectedRoomId,
      props.sendWsEvent,
      props.token,
    ]
  )

  const renderRightRailTab = useCallback(
    (tab: RightRailTab) => {
      if (!props.currentSession) {
        return null
      }

      return (
        <SessionWorkspaceRightRailTab
          tab={tab}
          selectedCampaign={props.selectedCampaign}
          sessions={props.sessions}
          sessionCount={props.sessionCount}
          totalSessionDurationMs={props.totalSessionDurationMs}
          canEditCampaignInfo={props.canEditCampaignInfo}
          onSaveCampaignInfo={props.onSaveCampaignInfo}
          campaignId={props.campaignId}
          apiUrl={props.apiUrl}
          token={props.token}
          currentSessionId={props.currentSession.id}
          currentSessionName={props.currentSession.name}
          currentSessionState={props.currentSession.state}
          effectiveSessionUserId={props.effectiveSessionUser.id}
          partyPresenceRefreshVersion={props.partyPresenceRefreshVersion}
          fetchWithAuthGuard={props.fetchWithAuthGuard}
          effectiveSessionRole={props.effectiveSessionRole}
          userId={props.userId}
          sessionSettingsName={props.sessionSettingsName}
          sessionSettingsPlannedDurationMinutes={props.sessionSettingsPlannedDurationMinutes}
          defaultSessionDurationMinutes={props.defaultSessionDurationMinutes}
          sessionStartedAt={props.currentSession.startedAt}
          canEditSessionSettings={props.canEditSessionSettings}
          canEditEndedSessionName={props.canEditEndedSessionName}
          onSessionNameChange={props.onSessionNameChange}
          onPlannedDurationMinutesChange={props.onPlannedDurationMinutesChange}
          onSaveSessionSettings={props.onSaveSessionSettings}
          isSessionSettingsSaving={props.isSessionSettingsSaving}
          sessionCampaignPolicy={props.sessionCampaignPolicy}
          campaignIdForSettings={props.campaignIdForSettings}
          characterDraft={props.characterDraft}
          onCharacterFieldChange={props.onCharacterFieldChange}
          onSaveCharacterSettings={props.onSaveCharacterSettings}
          isCharacterSettingsLoading={props.isCharacterSettingsLoading}
          isCharacterSettingsSaving={props.isCharacterSettingsSaving}
          onRequestOpenPlayerSettings={handleOpenPlayerSettingsFromParty}
          playerSettingsFocusRequestKey={playerSettingsFocusRequestKey}
        />
      )
    },
    [
      handleOpenPlayerSettingsFromParty,
      playerSettingsFocusRequestKey,
      props.apiUrl,
      props.canEditCampaignInfo,
      props.canEditEndedSessionName,
      props.canEditSessionSettings,
      props.campaignId,
      props.campaignIdForSettings,
      props.characterDraft,
      props.currentSession,
      props.defaultSessionDurationMinutes,
      props.effectiveSessionRole,
      props.effectiveSessionUser.id,
      props.fetchWithAuthGuard,
      props.isCharacterSettingsLoading,
      props.isCharacterSettingsSaving,
      props.isSessionSettingsSaving,
      props.onCharacterFieldChange,
      props.onPlannedDurationMinutesChange,
      props.onSaveCampaignInfo,
      props.onSaveCharacterSettings,
      props.onSaveSessionSettings,
      props.onSessionNameChange,
      props.partyPresenceRefreshVersion,
      props.selectedCampaign,
      props.sessionCampaignPolicy,
      props.sessionCount,
      props.sessionSettingsName,
      props.sessionSettingsPlannedDurationMinutes,
      props.sessions,
      props.token,
      props.totalSessionDurationMs,
      props.userId,
    ]
  )

  if (!props.hasSessionSelected || !props.currentSession) {
    return null
  }

  const currentSession = props.currentSession
  const workspaceDiagnosticState = `${props.effectiveSessionRole}|${currentSession.state}`

  return (
    <div
      className="session-command-center"
      data-ui-component="SessionWorkspace"
      data-ui-state={workspaceDiagnosticState}
    >
      <SessionWorkspaceFrame
        role={props.effectiveSessionRole}
        forcedRightRailTab={forcedRightRailTab}
        onForcedRightRailTabApplied={handleForcedRightRailTabApplied}
        rightRailIndicators={props.rightRailIndicators}
        chatIndicatorCount={chatUnreadCount}
        renderSystemToasts={renderSystemToasts}
        renderToolbar={renderToolbar}
        renderLeftRail={renderLeftRail}
        renderCenterPane={renderCenterPane}
        renderRightRailTab={renderRightRailTab}
      />
    </div>
  )
}

export const SessionWorkspace = memo(SessionWorkspaceComponent)
