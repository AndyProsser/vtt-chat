import { useCallback, useState } from 'react'
import { ReconnectBanner } from '@/components/ui/ReconnectBanner'
import { SessionWorkspaceFrame } from '@/components/workspaces/session/WorkspaceFrame'
import { SessionToolbar } from '@/components/workspaces/shared/toolbar/SessionToolbar'
import { SessionWorkspaceLeftRail } from '@/components/workspaces/session/LeftRail'
import { SessionWorkspaceCenterPane } from '@/components/workspaces/session/CenterPane'
import { SessionWorkspaceRightRailTab } from '@/components/workspaces/session/RightRailTab'
import type { SessionWorkspaceProps } from '@/types/sessionWorkspace'

export function SessionWorkspace(props: SessionWorkspaceProps) {
  const [forcedRightRailTab, setForcedRightRailTab] = useState<'settings' | null>(null)
  const [playerSettingsFocusRequestKey, setPlayerSettingsFocusRequestKey] = useState(0)

  if (!props.hasSessionSelected || !props.currentSession) {
    return null
  }

  const currentSession = props.currentSession
  const workspaceDiagnosticState = `${props.effectiveSessionRole}|${currentSession.state}`
  const handleOpenPlayerSettingsFromParty = useCallback(() => {
    setPlayerSettingsFocusRequestKey((current) => current + 1)
    setForcedRightRailTab('settings')
  }, [])

  return (
    <div
      className="session-command-center"
      data-ui-component="SessionWorkspace"
      data-ui-state={workspaceDiagnosticState}
    >
      <SessionWorkspaceFrame
        role={props.effectiveSessionRole}
        forcedRightRailTab={forcedRightRailTab}
        onForcedRightRailTabApplied={() => setForcedRightRailTab(null)}
        rightRailIndicators={props.rightRailIndicators}
        renderSystemToasts={() => (
          <ReconnectBanner
            wsState={props.wsState}
            manualRetryCountdownSeconds={props.wsRetrySecondsRemaining}
          />
        )}
        renderToolbar={(actions) => (
          <SessionToolbar
            actions={actions}
            statusColorKey={props.connectionStatus.statusColorKey}
            statusLabel={props.connectionStatus.label}
            coreWsState={props.connectionStatus.coreWsState}
            livekitState={props.connectionStatus.livekitState}
            sessionState={currentSession.state}
            sessionStartedAt={currentSession.startedAt}
            sessionPausedAt={currentSession.pausedAt ?? props.currentPauseStats.pauseStartedAt}
            sessionEndedAt={currentSession.endedAt}
            cooldownEndsAt={currentSession.cooldownExpiresAt}
            cumulativePauseMs={props.currentPauseStats.cumulativePauseMs}
            pauseCount={props.currentPauseStats.pauseCount}
            cooldownDurationMs={props.configuredCooldownDurationMs}
            canStartSession={props.canStartFromGreenroom}
            canPauseSession={props.canPauseFromActive}
            canStopSession={props.canStopFromActive}
            showCooldownControls={props.cooldownControlVisible}
            canManageCooldown={Boolean(props.canManageCooldown)}
            cooldownControlLockedReason={props.cooldownControlLockedReason}
            canExtendCooldown={props.canExtendCooldown}
            extendCooldownLockedReason={props.extendCooldownLockedReason}
            onStartSession={() => props.onStartSession(currentSession.id)}
            onPauseSession={() => props.onPauseSession(currentSession.id)}
            onStopSession={props.onStopSession}
            onCancelCooldown={() => props.onCancelCooldown(currentSession.id)}
            onExtendCooldown={() =>
              props.onExtendCooldown(currentSession.id, props.configuredCooldownDurationMs)
            }
            onOpenUserSettings={props.onOpenUserSettings}
            onExitToSelector={props.onExitToSelector}
          />
        )}
        renderLeftRail={({ openRightRailTab }) => (
          <SessionWorkspaceLeftRail
            onOpenInfoPanel={() => openRightRailTab('information')}
            apiUrl={props.apiUrl}
            token={props.token}
            sessionId={currentSession.id}
            selectedCampaignName={props.selectedCampaign?.name}
            selectedCampaignDescription={props.selectedCampaign?.description ?? undefined}
            effectiveSessionRole={props.effectiveSessionRole}
            sessionState={currentSession.state}
            sessionName={currentSession.name}
            sessionCount={props.sessionCount}
            connectedPlayers={props.connectedPlayers}
            connectedSpectatorsCount={props.connectedSpectatorsCount}
            dmUserId={currentSession.dmId}
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
            sessionEndedAt={currentSession.endedAt}
            configuredCooldownDurationMs={props.configuredCooldownDurationMs}
          />
        )}
        renderCenterPane={(view) => (
          <SessionWorkspaceCenterPane
            view={view}
            effectiveSessionRole={props.effectiveSessionRole}
            currentSessionState={currentSession.state}
            sessionEndedAt={currentSession.endedAt}
            configuredCooldownDurationMs={props.configuredCooldownDurationMs}
            selectedRoomId={props.selectedRoomId}
            apiUrl={props.apiUrl}
            token={props.token}
            currentSessionId={currentSession.id}
            selectedRoom={props.selectedRoom}
            campaignId={props.campaignId}
            effectiveSessionUser={props.effectiveSessionUser}
            messageGroupingWindowMs={props.messageGroupingWindowMs}
            sendWsEvent={props.sendWsEvent}
            isGreenroomChatMode={props.isGreenroomChatMode}
          />
        )}
        renderRightRailTab={(tab) => (
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
            currentSessionId={currentSession.id}
            currentSessionName={currentSession.name}
            currentSessionState={currentSession.state}
            effectiveSessionUserId={props.effectiveSessionUser.id}
            partyPresenceRefreshVersion={props.partyPresenceRefreshVersion}
            fetchWithAuthGuard={props.fetchWithAuthGuard}
            effectiveSessionRole={props.effectiveSessionRole}
            userId={props.userId}
            sessionSettingsName={props.sessionSettingsName}
            sessionSettingsDescription={props.sessionSettingsDescription}
            sessionSettingsPlannedDurationMinutes={props.sessionSettingsPlannedDurationMinutes}
            canEditSessionSettings={props.canEditSessionSettings}
            onSessionNameChange={props.onSessionNameChange}
            onSessionDescriptionChange={props.onSessionDescriptionChange}
            onPlannedDurationMinutesChange={props.onPlannedDurationMinutesChange}
            onSaveSessionSettings={props.onSaveSessionSettings}
            isSessionSettingsSaving={props.isSessionSettingsSaving}
            dmAutoTargetOnFirstPlayerJoin={props.dmAutoTargetOnFirstPlayerJoin}
            onDmAutoTargetChange={props.onDmAutoTargetChange}
            onSaveDmAutoTarget={props.onSaveDmAutoTarget}
            isDmVoiceTargetingSettingSaving={props.isDmVoiceTargetingSettingSaving}
            isDmVoiceTargetingSettingLoading={props.isDmVoiceTargetingSettingLoading}
            campaignIdForSettings={props.campaignIdForSettings}
            characterDraft={props.characterDraft}
            onCharacterFieldChange={props.onCharacterFieldChange}
            onSaveCharacterSettings={props.onSaveCharacterSettings}
            isCharacterSettingsLoading={props.isCharacterSettingsLoading}
            isCharacterSettingsSaving={props.isCharacterSettingsSaving}
            onRequestOpenPlayerSettings={handleOpenPlayerSettingsFromParty}
            playerSettingsFocusRequestKey={playerSettingsFocusRequestKey}
          />
        )}
      />
    </div>
  )
}
