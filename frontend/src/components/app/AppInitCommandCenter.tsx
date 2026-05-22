import type { ComponentProps } from 'react'
import { MessageType, Role, SessionState } from '@shared'
import type { UUID } from '@shared'
import { AudioPanel } from '@/components/app/workspaces/session/audio/AudioPanel'
import { ChatWindow } from '@/components/app/workspaces/session/chat/ChatWindow'
import { NotesPanel } from '@/components/app/workspaces/session/notes/NotesPanel'
import { ReconnectBanner } from '@/components/ui/ReconnectBanner'
import type { Session as SessionRecord } from '@/types/session'
import type { Room as RoomRecord, RoomUser as RoomMember } from '@/types/room'
import { CampaignInformationPanel } from '@/components/shared/CampaignInformationPanel'
import { CampaignRightbarSettings } from '@/components/app/workspaces/shared/rightbar/CampaignRightbarSettings'
import { CampaignScaffoldPanel } from '@/components/shared/CampaignScaffoldPanel'
import { CommandCenterFrame } from '@/components/app/workspaces/shared/toolbar/CommandCenterFrame'
import { HistoryPanel } from '@/components/app/workspaces/shared/rightbar/HistoryPanel'
import { JournalPanel } from '@/components/app/workspaces/shared/rightbar/JournalPanel'
import { NotesRailPanel } from '@/components/app/workspaces/shared/rightbar/NotesRailPanel'
import { SessionLeftRailPanel } from '@/components/app/workspaces/session/SessionLeftRailPanel'
import { SessionRightRailContent } from '@/components/app/workspaces/shared/rightbar/SessionRightRailContent'
import { SessionToolbar } from '@/components/app/workspaces/shared/toolbar/SessionToolbar'
import { SpectatorWaitScreen } from '@/components/app/workspaces/session/SpectatorWaitScreen'
import type { CampaignSummary } from '@/types/session/campaign'

type AppInitCommandCenterProps = {
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
  onToggleBroadcastMode: ComponentProps<typeof SessionLeftRailPanel>['onToggleBroadcastMode']
  dmAutoTargetOnFirstPlayerJoin: boolean
  dmOverrides: ComponentProps<typeof SessionLeftRailPanel>['dmOverrides']
  currentConditionName: string | undefined
  roomEnvironmentNames: ComponentProps<typeof SessionLeftRailPanel>['roomEnvironmentNames']
  wsState: ComponentProps<typeof ReconnectBanner>['wsState']
  wsRetrySecondsRemaining: number | null
  connectionStatus: {
    statusColorKey: ComponentProps<typeof SessionToolbar>['statusColorKey']
    label: string
    coreWsState: ComponentProps<typeof SessionToolbar>['coreWsState']
    livekitState: ComponentProps<typeof SessionToolbar>['livekitState']
  }
  rightRailIndicators: ComponentProps<typeof CommandCenterFrame>['rightRailIndicators']
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

export function AppInitCommandCenter(props: AppInitCommandCenterProps) {
  if (!props.hasSessionSelected || !props.currentSession) {
    return null
  }

  const currentSession = props.currentSession

  return (
    <div className="session-command-center">
      <CommandCenterFrame
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
            sessionPausedAt={
              currentSession.pausedAt ?? props.currentPauseStats.pauseStartedAt
            }
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
          <div className="session-left-rail-stack">
            <SessionLeftRailPanel
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
          <div className="session-command-center-pane">
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
            <SessionRightRailContent
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
