import { Role, type SessionState, type UUID } from '@shared'
import { DEFAULT_PLANNED_DURATION_MINUTES } from '@/constants/sessionInit.constants'
import { toValidPostSessionDurationMinutes } from '@/utils/session/sessionInit'
import {
  CampaignRightbarSettings,
  type CharacterSettingsDraft,
} from '@/components/app/workspaces/shared/rightbar/CampaignRightbarSettings'
import { LobbyCampaignSettingsPanel } from '@/components/app/workspaces/lobby/LobbyCampaignSettingsPanel'
import { LobbyCampaignWorkspaceView } from '@/components/app/workspaces/lobby/LobbyCampaignWorkspaceView'
import type { CampaignSettingsPayload, CampaignSummary } from '@/types/session/campaign'

type AppInitLobbyWorkspaceBranchProps = {
  hasSessionSelected: boolean
  lobbyViewMode: 'list' | 'workspace'
  selectedCampaign: CampaignSummary | null
  membershipRole: Role
  themeMode: 'light' | 'dark'
  isCreatingCampaign: boolean
  isJoiningCampaign: boolean
  apiUrl: string
  token: string
  currentSessionId: UUID | null
  currentSessionState: SessionState | null
  userId: UUID
  partyPresenceRefreshVersion: number
  fetchWithAuthGuard: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  connectionStatus: {
    statusColorKey: string
    label: string
    coreWsState: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED'
  }
  settingsCampaignSessionsCount: number
  settingsCampaignTotalDurationMs: number
  settingsData: CampaignSettingsPayload | null
  isInviteReissuing: boolean
  isSettingsLoading: boolean
  isSettingsSaving: boolean
  settingsName: string
  settingsDescription: string
  settingsPosterUrl: string
  settingsVisibility: 'PUBLIC' | 'PRIVATE'
  settingsSpectatorsEnabled: boolean
  settingsSpectatorMax: number
  settingsSpectatorWaitlistEnabled: boolean
  settingsSpectatorReconnectGraceSecs: number
  settingsPostSessionChatEnabled: boolean
  settingsPostSessionChatDurationMinutes: number
  settingsExtensionSyncPolicy: 'ALLOW' | 'DM_ONLY' | 'NONE'
  settingsLateJoinPolicy: 'OPEN' | 'SCREENED' | 'BLOCKED'
  settingsLateJoinGraceMinutes: number
  settingsDmAutoTargetOnFirstPlayerJoin: boolean
  selectedCampaignId: UUID | ''
  characterSettingsDraft: CharacterSettingsDraft
  isCharacterSettingsLoading: boolean
  isCharacterSettingsSaving: boolean
  onSettingsNameChange: (value: string) => void
  onSettingsDescriptionChange: (value: string) => void
  onPosterFileSelected: (event: React.ChangeEvent<HTMLInputElement>) => void
  onSettingsPosterUrlChange: (value: string) => void
  onSettingsVisibilityChange: (value: 'PUBLIC' | 'PRIVATE') => void
  onSettingsSpectatorsEnabledChange: (value: boolean) => void
  onSettingsSpectatorMaxChange: (value: number) => void
  onSettingsSpectatorWaitlistEnabledChange: (value: boolean) => void
  onSettingsSpectatorReconnectGraceSecsChange: (value: number) => void
  onSettingsPostSessionChatEnabledChange: (value: boolean) => void
  onSettingsPostSessionChatDurationMinutesChange: (value: number) => void
  onSettingsExtensionSyncPolicyChange: (value: 'ALLOW' | 'DM_ONLY' | 'NONE') => void
  onSettingsLateJoinPolicyChange: (value: 'OPEN' | 'SCREENED' | 'BLOCKED') => void
  onSettingsLateJoinGraceMinutesChange: (value: number) => void
  onSettingsDmAutoTargetOnFirstPlayerJoinChange: (value: boolean) => void
  onCopyInviteUrl: (inviteType: 'PLAYER' | 'SPECTATOR') => void
  onReissueInvite: (inviteType: 'PLAYER' | 'SPECTATOR') => void
  onSaveCampaignSettings: () => void
  onCharacterFieldChange: (field: keyof CharacterSettingsDraft, value: string | number) => void
  onSaveCharacterSettings: () => void
  onBackToLobby: () => void
  onCreateCampaign: () => void
  onJoinCampaign: () => void
  onToggleTheme: () => void
  onOpenUserSettings: () => void
  onLogoff: () => void
  onLaunch: (campaignId: UUID) => void
  onSaveCampaignInfo: (
    campaignId: UUID,
    updates: {
      name: string
      description: string
      posterUrl: string | null
      integrationSyncPolicy: 'ALLOW' | 'DM_ONLY' | 'NONE'
    }
  ) => Promise<void>
  isLaunchDisabled: boolean
  launchDisabledReason: string
}

export function AppInitLobbyWorkspaceBranch(props: AppInitLobbyWorkspaceBranchProps) {
  if (props.hasSessionSelected || props.lobbyViewMode !== 'workspace') {
    return null
  }

  return (
    <LobbyCampaignWorkspaceView
      campaign={props.selectedCampaign}
      role={props.membershipRole}
      themeMode={props.themeMode}
      isCreatingCampaign={props.isCreatingCampaign}
      isJoiningCampaign={props.isJoiningCampaign}
      apiUrl={props.apiUrl}
      authToken={props.token}
      currentSessionId={props.currentSessionId}
      currentSessionState={props.currentSessionState}
      currentUserId={props.userId}
      partyPresenceRefreshVersion={props.partyPresenceRefreshVersion}
      fetchWithAuthGuard={props.fetchWithAuthGuard}
      connectionStatus={props.connectionStatus}
      sessionCount={props.settingsCampaignSessionsCount}
      totalSessionDurationMs={props.settingsCampaignTotalDurationMs}
      canEditCampaignInfo={Boolean(
        props.selectedCampaign && props.selectedCampaign.currentDmId === props.userId
      )}
      isLaunchDisabled={props.isLaunchDisabled}
      launchDisabledReason={props.launchDisabledReason}
      showInviteWidget={Boolean(
        props.selectedCampaign && props.selectedCampaign.currentDmId === props.userId
      )}
      joinUrl={
        props.settingsData?.inviteCode
          ? `${window.location.origin}/join/${encodeURIComponent(props.settingsData.inviteCode)}`
          : props.selectedCampaign?.inviteCode
            ? `${window.location.origin}/join/${encodeURIComponent(props.selectedCampaign.inviteCode)}`
            : ''
      }
      watchUrl={
        props.settingsData?.spectatorInviteCode || props.selectedCampaign?.spectatorInviteCode
          ? `${window.location.origin}/watch/${encodeURIComponent(props.settingsData?.spectatorInviteCode || props.selectedCampaign?.spectatorInviteCode || '')}`
          : ''
      }
      spectatorsEnabled={
        props.settingsData
          ? props.settingsData.spectatorPolicy !== 'NONE'
          : Boolean(props.selectedCampaign?.spectatorsEnabled)
      }
      isInviteReissuing={props.isInviteReissuing}
      settingsPanel={
        props.membershipRole === Role.DM ? (
          <LobbyCampaignSettingsPanel
            campaignName={props.selectedCampaign?.name}
            isLoading={props.isSettingsLoading}
            isSaving={props.isSettingsSaving}
            isInviteReissuing={props.isInviteReissuing}
            settingsData={props.settingsData}
            settingsName={props.settingsName}
            onSettingsNameChange={props.onSettingsNameChange}
            settingsDescription={props.settingsDescription}
            onSettingsDescriptionChange={props.onSettingsDescriptionChange}
            onPosterFileSelected={props.onPosterFileSelected}
            settingsPosterUrl={props.settingsPosterUrl}
            onSettingsPosterUrlChange={props.onSettingsPosterUrlChange}
            onRemovePoster={() => props.onSettingsPosterUrlChange('')}
            settingsVisibility={props.settingsVisibility}
            onSettingsVisibilityChange={props.onSettingsVisibilityChange}
            settingsSpectatorsEnabled={props.settingsSpectatorsEnabled}
            onSettingsSpectatorsEnabledChange={props.onSettingsSpectatorsEnabledChange}
            settingsSpectatorMax={props.settingsSpectatorMax}
            onSettingsSpectatorMaxChange={props.onSettingsSpectatorMaxChange}
            settingsSpectatorWaitlistEnabled={props.settingsSpectatorWaitlistEnabled}
            onSettingsSpectatorWaitlistEnabledChange={
              props.onSettingsSpectatorWaitlistEnabledChange
            }
            settingsSpectatorReconnectGraceSecs={props.settingsSpectatorReconnectGraceSecs}
            onSettingsSpectatorReconnectGraceSecsChange={
              props.onSettingsSpectatorReconnectGraceSecsChange
            }
            settingsPostSessionChatEnabled={props.settingsPostSessionChatEnabled}
            onSettingsPostSessionChatEnabledChange={props.onSettingsPostSessionChatEnabledChange}
            settingsPostSessionChatDurationMinutes={props.settingsPostSessionChatDurationMinutes}
            onSettingsPostSessionChatDurationMinutesChange={(value) =>
              props.onSettingsPostSessionChatDurationMinutesChange(
                toValidPostSessionDurationMinutes(value)
              )
            }
            settingsExtensionSyncPolicy={props.settingsExtensionSyncPolicy}
            onSettingsExtensionSyncPolicyChange={props.onSettingsExtensionSyncPolicyChange}
            settingsLateJoinPolicy={props.settingsLateJoinPolicy}
            onSettingsLateJoinPolicyChange={props.onSettingsLateJoinPolicyChange}
            settingsLateJoinGraceMinutes={props.settingsLateJoinGraceMinutes}
            onSettingsLateJoinGraceMinutesChange={props.onSettingsLateJoinGraceMinutesChange}
            settingsDmAutoTargetOnFirstPlayerJoin={props.settingsDmAutoTargetOnFirstPlayerJoin}
            onSettingsDmAutoTargetOnFirstPlayerJoinChange={
              props.onSettingsDmAutoTargetOnFirstPlayerJoinChange
            }
            onCopyInviteUrl={props.onCopyInviteUrl}
            onReissueInvite={props.onReissueInvite}
            onSave={props.onSaveCampaignSettings}
          />
        ) : props.membershipRole === Role.PLAYER ? (
          <CampaignRightbarSettings
            role="PLAYER"
            campaignId={props.selectedCampaignId || null}
            sessionName=""
            sessionDescription=""
            plannedDurationMinutes={DEFAULT_PLANNED_DURATION_MINUTES}
            sessionStateLabel="IDLE"
            canEditSessionSettings={false}
            onSessionNameChange={() => {
              // Offline player settings do not expose session controls.
            }}
            onSessionDescriptionChange={() => {
              // Offline player settings do not expose session controls.
            }}
            onPlannedDurationMinutesChange={() => {
              // Offline player settings do not expose session controls.
            }}
            onSaveSessionSettings={() => {
              // Offline player settings do not expose session controls.
            }}
            isSessionSaving={false}
            dmAutoTarget={props.settingsDmAutoTargetOnFirstPlayerJoin}
            onDmAutoTargetChange={() => {
              // Offline player settings do not expose DM controls.
            }}
            onSaveDmAutoTarget={() => {
              // Offline player settings do not expose DM controls.
            }}
            isSaving={false}
            isLoading={false}
            characterDraft={props.characterSettingsDraft}
            onCharacterFieldChange={props.onCharacterFieldChange}
            onSaveCharacterSettings={props.onSaveCharacterSettings}
            isCharacterLoading={props.isCharacterSettingsLoading}
            isCharacterSaving={props.isCharacterSettingsSaving}
          />
        ) : (
          <div className="session-status-message">
            Spectators do not have editable campaign settings in offline mode.
          </div>
        )
      }
      onBackToLobby={props.onBackToLobby}
      onCreateCampaign={props.onCreateCampaign}
      onJoinCampaign={props.onJoinCampaign}
      onToggleTheme={props.onToggleTheme}
      onOpenUserSettings={props.onOpenUserSettings}
      onLogoff={props.onLogoff}
      onLaunch={props.onLaunch}
      onCopyInviteUrl={props.onCopyInviteUrl}
      onReissueInvite={props.onReissueInvite}
      onSaveCampaignInfo={props.onSaveCampaignInfo}
    />
  )
}
