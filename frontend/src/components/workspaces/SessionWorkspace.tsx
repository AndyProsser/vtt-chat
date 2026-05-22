import type { ComponentProps } from 'react'
import { MessageType, Role, SessionState } from '@shared'
import type { UUID } from '@shared'
import { AudioPanel } from '@/components/workspaces/session/audio/AudioPanel'
import { ChatWindow } from '@/components/workspaces/session/chat/ChatWindow'
import { NotesPanel } from '@/components/workspaces/shared/panels/NotesPanel'
import { ReconnectBanner } from '@/components/ui/ReconnectBanner'
import type { Session as SessionRecord } from '@/types/session'
import type { Room as RoomRecord, RoomUser as RoomMember } from '@/types/room'
import { CampaignInformationPanel } from '@/components/workspaces/shared/panels/CampaignInformationPanel'
import { CampaignPartyPanel } from '@/components/workspaces/shared/panels/CampaignPartyPanel'
import { CampaignRightbarSettings } from '@/components/workspaces/shared/panels/CampaignRightbarSettings'
import { CampaignScaffoldPanel } from '@/components/workspaces/shared/panels/CampaignScaffoldPanel'
import { SessionWorkspaceFrame } from '@/components/workspaces/shared/toolbar/SessionWorkspaceFrame'
import { HistoryPanel } from '@/components/workspaces/shared/panels/HistoryPanel'
import { JournalPanel } from '@/components/workspaces/shared/panels/JournalPanel'
import { NotesRailPanel } from '@/components/workspaces/shared/panels/NotesRailPanel'
import { LeftRailPanel } from '@/components/workspaces/session/LeftRailPanel'
import { RightRailContent } from '@/components/workspaces/session/RightRailContent'
import { SessionToolbar } from '@/components/workspaces/shared/toolbar/SessionToolbar'
import { SpectatorWaitScreen } from '@/components/workspaces/session/SpectatorWaitScreen'
import type { CampaignSummary } from '@/types/session/campaign'

type SessionWorkspaceProps = {
  hasSessionSelected: boolean
  currentSession: SessionRecord | null
  currentPauseStats: {
    pauseStartedAt: number | undefined
    cumulativePauseMs: number
    pauseCount: number
  }
  configuredCooldownDurationMs: number
  canStartFromGreenroom: boolean
  canPauseFromActive: boolean
  canStopFromActive: boolean
  cooldownControlVisible: boolean
  canManageCooldown: boolean
  cooldownControlLockedReason: string | undefined
  canExtendCooldown: boolean
  extendCooldownLockedReason: string | undefined
  onStartSession: (sessionId: UUID) => void
  onPauseSession: (sessionId: UUID) => void
  onStopSession: () => void
  onCancelCooldown: (sessionId: UUID) => void
  onExtendCooldown: (sessionId: UUID, durationMs: number) => void
  onOpenUserSettings: () => void
  onExitToSelector: () => void
  apiUrl: string
  token: string
  selectedCampaign: CampaignSummary | null
  sessionCount: number
  connectedPlayers: number
  connectedSpectatorsCount: number
  effectiveSessionRole: Role
  effectiveSessionUser: {
    id: UUID
    username: string
    role: Role
    authType?: 'FULL' | 'GUEST'
  }
  visibleRooms: RoomRecord[]
  roomMembersByRoomId: Record<UUID, RoomMember[]>
  selectedRoomId: UUID | ''
  onSelectRoom: (roomId: UUID) => void
  broadcastModeEnabled: boolean
  onToggleBroadcastMode: ComponentProps<typeof LeftRailPanel>['onToggleBroadcastMode']
  dmAutoTargetOnFirstPlayerJoin: boolean
  dmOverrides: ComponentProps<typeof LeftRailPanel>['dmOverrides']
  currentConditionName: string | undefined
  roomEnvironmentNames: ComponentProps<typeof LeftRailPanel>['roomEnvironmentNames']
  wsState: ComponentProps<typeof ReconnectBanner>['wsState']
  wsRetrySecondsRemaining: number | null
  connectionStatus: {
    statusColorKey: ComponentProps<typeof SessionToolbar>['statusColorKey']
    label: string
    coreWsState: ComponentProps<typeof SessionToolbar>['coreWsState']
    livekitState: ComponentProps<typeof SessionToolbar>['livekitState']
  }
  rightRailIndicators: ComponentProps<typeof SessionWorkspaceFrame>['rightRailIndicators']
  partyPresenceRefreshVersion: number
  fetchWithAuthGuard: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  selectedRoom: RoomRecord | null
  campaignId: UUID | undefined
  messageGroupingWindowMs: number
  sendWsEvent: ComponentProps<typeof ChatWindow>['sendWsEvent']
  isGreenroomChatMode: boolean
  onOpenNotesWorkspace: () => void
  totalSessionDurationMs: number
  canEditCampaignInfo: boolean
  onSaveCampaignInfo: ComponentProps<typeof CampaignInformationPanel>['onSaveCampaignInfo']
  campaignIdForSettings: UUID | ''
  sessionSettingsName: string
  sessionSettingsDescription: string
  sessionSettingsPlannedDurationMinutes: number
  canEditSessionSettings: boolean
  onSessionNameChange: (value: string) => void
  onSessionDescriptionChange: (value: string) => void
  onPlannedDurationMinutesChange: (value: number) => void
  onSaveSessionSettings: () => void
  isSessionSettingsSaving: boolean
  onDmAutoTargetChange: (value: boolean) => void
  onSaveDmAutoTarget: () => void
  isDmVoiceTargetingSettingSaving: boolean
  isDmVoiceTargetingSettingLoading: boolean
  characterDraft: ComponentProps<typeof CampaignRightbarSettings>['characterDraft']
  onCharacterFieldChange: ComponentProps<typeof CampaignRightbarSettings>['onCharacterFieldChange']
  onSaveCharacterSettings: () => void
  isCharacterSettingsLoading: boolean
  isCharacterSettingsSaving: boolean
  userId: UUID
}

export function SessionWorkspace(props: SessionWorkspaceProps) {
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
        renderLeftRail={() => (
          <div className="session-left-rail-stack" data-ui-component="SessionLeftRailStack">
            <LeftRailPanel
              apiUrl={props.apiUrl}
              token={props.token}
              sessionId={currentSession.id}
              campaignName={props.selectedCampaign?.name || 'Campaign'}
              campaignDescription={props.selectedCampaign?.description}
              role={props.effectiveSessionRole}
              sessionName={currentSession.name}
              sessionState={currentSession.state}
              sessionCount={props.sessionCount}
              connectedPlayersCount={props.connectedPlayers}
              connectedSpectatorsCount={props.connectedSpectatorsCount}
              dmUserId={currentSession.dmId}
              currentUserId={props.effectiveSessionUser.id}
              rooms={props.visibleRooms.map((room) => ({
                id: room.id,
                name: room.name,
                type: room.type,
              }))}
              roomMembersByRoomId={props.roomMembersByRoomId}
              sessionEndedAt={currentSession.endedAt}
              cooldownDurationMs={props.configuredCooldownDurationMs}
              selectedRoomId={props.selectedRoomId}
              onSelectRoom={props.onSelectRoom}
              broadcastModeEnabled={props.broadcastModeEnabled}
              onToggleBroadcastMode={props.onToggleBroadcastMode}
              dmAutoTargetOnFirstPlayerJoin={props.dmAutoTargetOnFirstPlayerJoin}
              dmOverrides={props.dmOverrides}
              currentConditionName={props.currentConditionName}
              roomEnvironmentNames={props.roomEnvironmentNames}
            />
            {props.selectedRoomId ? (
              <aside
                className="session-left-rail-card session-left-rail-card--audio"
                aria-label="Voice panel"
              >
                <AudioPanel
                  sessionId={currentSession.id}
                  roomId={props.selectedRoomId}
                  role={props.effectiveSessionRole}
                />
              </aside>
            ) : null}
          </div>
        )}
        renderCenterPane={(view) => (
          <div
            className="session-command-center-pane"
            data-ui-component="SessionCenterPaneShell"
            data-ui-state={view}
          >
            {props.effectiveSessionRole === Role.SPECTATOR &&
            (currentSession.state === SessionState.IDLE ||
              currentSession.state === SessionState.PAUSED ||
              currentSession.state === SessionState.COOLDOWN ||
              currentSession.state === SessionState.ENDED ||
              currentSession.state === SessionState.CLEANUP) ? (
              <SpectatorWaitScreen
                sessionState={currentSession.state}
                sessionEndedAt={currentSession.endedAt}
                cooldownDurationMs={props.configuredCooldownDurationMs}
              />
            ) : view === 'chat' ? (
              <div className="session-live-comms">
                <section className="session-live-comms__chat" aria-label="Chat panel">
                  {props.selectedRoomId ? (
                    <ChatWindow
                      apiUrl={props.apiUrl}
                      token={props.token}
                      sessionId={currentSession.id}
                      roomId={props.selectedRoomId}
                      campaignId={props.campaignId}
                      roomName={props.selectedRoom?.name}
                      roomType={props.selectedRoom?.type}
                      user={props.effectiveSessionUser}
                      messageGroupingWindowMs={props.messageGroupingWindowMs}
                      sendWsEvent={props.sendWsEvent}
                      forceMessageType={props.isGreenroomChatMode ? MessageType.OOC : undefined}
                    />
                  ) : (
                    <div className="session-greenroom-placeholder">
                      <h4>Greenroom Chat Standby</h4>
                      <p>
                        Start the session to open live chat and stream right-side tools over this
                        workspace.
                      </p>
                    </div>
                  )}
                </section>
              </div>
            ) : (
              <NotesPanel
                apiUrl={props.apiUrl}
                token={props.token}
                sessionId={currentSession.id}
                user={props.effectiveSessionUser}
              />
            )}
          </div>
        )}
        renderRightRailTab={(tab) => {
          return (
            <RightRailContent
              tab={tab}
              informationPanel={
                <CampaignInformationPanel
                  campaign={props.selectedCampaign ?? null}
                  sessionCount={props.sessionCount}
                  totalSessionDurationMs={props.totalSessionDurationMs}
                  canEdit={props.canEditCampaignInfo}
                  onSaveCampaignInfo={props.onSaveCampaignInfo}
                />
              }
              partyPanel={
                props.campaignId ? (
                  <CampaignPartyPanel
                    key={`${props.campaignId}:${currentSession.id}:${props.effectiveSessionUser.id}`}
                    campaignId={props.campaignId}
                    campaignName={props.selectedCampaign?.name}
                    apiUrl={props.apiUrl}
                    authToken={props.token}
                    currentSessionId={currentSession.id}
                    currentSessionState={currentSession.state}
                    currentUserId={props.effectiveSessionUser.id}
                    partyPresenceRefreshVersion={props.partyPresenceRefreshVersion}
                    fetchWithAuthGuard={props.fetchWithAuthGuard}
                  />
                ) : (
                  <CampaignScaffoldPanel
                    title="Party"
                    subtitle="Party roster is unavailable until a campaign is selected."
                    sections={[
                      'Select or open a campaign session',
                      'Party presence snapshots will load automatically',
                    ]}
                  />
                )
              }
              roomsPanel={
                <CampaignScaffoldPanel
                  title="Groups"
                  subtitle="Voice group configuration is being rebuilt around campaign-level controls."
                  sections={[
                    'DM-only group management',
                    'Greenroom pre-create support',
                    'Group defaults and templates',
                    'Campaign routing and policy',
                  ]}
                  campaignName={props.selectedCampaign?.name}
                />
              }
              audioPanel={
                <CampaignScaffoldPanel
                  title="Campaign Audio"
                  subtitle="Audio policy controls are being reduced to a cleaner campaign-first surface."
                  sections={[
                    'Default campaign audio policy',
                    'Environment and override presets',
                    'Broadcast and moderation policy',
                  ]}
                  campaignName={props.selectedCampaign?.name}
                />
              }
              notesPanel={
                <NotesRailPanel
                  apiUrl={props.apiUrl}
                  token={props.token}
                  sessionId={currentSession.id}
                  role={props.effectiveSessionRole}
                  onOpenNotesWorkspace={props.onOpenNotesWorkspace}
                />
              }
              journalPanel={
                <JournalPanel
                  apiUrl={props.apiUrl}
                  token={props.token}
                  sessionId={currentSession.id}
                  sessionName={currentSession.name}
                  role={props.effectiveSessionRole}
                  userId={props.userId}
                />
              }
              historyPanel={
                <HistoryPanel
                  apiUrl={props.apiUrl}
                  token={props.token}
                  sessionId={currentSession.id}
                  role={props.effectiveSessionRole}
                  userId={props.userId}
                />
              }
              settingsPanel={
                <CampaignRightbarSettings
                  role={
                    props.effectiveSessionRole === 'DM'
                      ? 'DM'
                      : props.effectiveSessionRole === 'PLAYER'
                        ? 'PLAYER'
                        : 'SPECTATOR'
                  }
                  campaignId={props.campaignIdForSettings || null}
                  sessionName={props.sessionSettingsName}
                  sessionDescription={props.sessionSettingsDescription}
                  plannedDurationMinutes={props.sessionSettingsPlannedDurationMinutes}
                  sessionStateLabel={currentSession.state}
                  canEditSessionSettings={props.canEditSessionSettings}
                  onSessionNameChange={props.onSessionNameChange}
                  onSessionDescriptionChange={props.onSessionDescriptionChange}
                  onPlannedDurationMinutesChange={props.onPlannedDurationMinutesChange}
                  onSaveSessionSettings={props.onSaveSessionSettings}
                  isSessionSaving={props.isSessionSettingsSaving}
                  dmAutoTarget={props.dmAutoTargetOnFirstPlayerJoin}
                  onDmAutoTargetChange={props.onDmAutoTargetChange}
                  onSaveDmAutoTarget={props.onSaveDmAutoTarget}
                  isSaving={props.isDmVoiceTargetingSettingSaving}
                  isLoading={props.isDmVoiceTargetingSettingLoading}
                  characterDraft={props.characterDraft}
                  onCharacterFieldChange={props.onCharacterFieldChange}
                  onSaveCharacterSettings={props.onSaveCharacterSettings}
                  isCharacterLoading={props.isCharacterSettingsLoading}
                  isCharacterSaving={props.isCharacterSettingsSaving}
                />
              }
            />
          )
        }}
      />
    </div>
  )
}
