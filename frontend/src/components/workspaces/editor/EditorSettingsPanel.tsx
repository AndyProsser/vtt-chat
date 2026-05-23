import { Role } from '@shared'
import { DEFAULT_PLANNED_DURATION_MINUTES } from '@/constants/workspaces.constants'
import { toValidPostSessionDurationMinutes } from '@/utils/session/workspaces'
import {
  SessionSettingsPanel,
  type CharacterSettingsDraft,
} from '@/components/workspaces/session/SessionSettingsPanel'
import { CampaignSettingsPanel } from '@/components/workspaces/shared/panels/CampaignSettingsPanel'
import type { CampaignSettingsPayload, CampaignSummary } from '@/types/session/campaign'

type EditorSettingsPanelProps = {
  membershipRole: Role
  selectedCampaign: CampaignSummary | null
  selectedCampaignId: string | ''
  userId: string
  settingsData: CampaignSettingsPayload | null
  isInviteReissuing: boolean
  isSettingsLoading: boolean
  isSettingsSaving: boolean
  settingsName: string
  onSettingsNameChange: (value: string) => void
  settingsDescription: string
  onSettingsDescriptionChange: (value: string) => void
  onPosterFileSelected: (event: React.ChangeEvent<HTMLInputElement>) => void
  settingsPosterUrl: string
  onSettingsPosterUrlChange: (value: string) => void
  settingsVisibility: 'PUBLIC' | 'PRIVATE'
  onSettingsVisibilityChange: (value: 'PUBLIC' | 'PRIVATE') => void
  settingsSpectatorsEnabled: boolean
  onSettingsSpectatorsEnabledChange: (value: boolean) => void
  settingsSpectatorMax: number
  onSettingsSpectatorMaxChange: (value: number) => void
  settingsSpectatorWaitlistEnabled: boolean
  onSettingsSpectatorWaitlistEnabledChange: (value: boolean) => void
  settingsSpectatorReconnectGraceSecs: number
  onSettingsSpectatorReconnectGraceSecsChange: (value: number) => void
  settingsPostSessionChatEnabled: boolean
  onSettingsPostSessionChatEnabledChange: (value: boolean) => void
  settingsPostSessionChatDurationMinutes: number
  onSettingsPostSessionChatDurationMinutesChange: (value: number) => void
  settingsExtensionSyncPolicy: 'ALLOW' | 'DM_ONLY' | 'NONE'
  onSettingsExtensionSyncPolicyChange: (value: 'ALLOW' | 'DM_ONLY' | 'NONE') => void
  settingsLateJoinPolicy: 'OPEN' | 'SCREENED' | 'BLOCKED'
  onSettingsLateJoinPolicyChange: (value: 'OPEN' | 'SCREENED' | 'BLOCKED') => void
  settingsLateJoinGraceMinutes: number
  onSettingsLateJoinGraceMinutesChange: (value: number) => void
  settingsDmAutoTargetOnFirstPlayerJoin: boolean
  onSettingsDmAutoTargetOnFirstPlayerJoinChange: (value: boolean) => void
  onCopyInviteUrl: (inviteType: 'PLAYER' | 'SPECTATOR') => void
  onReissueInvite: (inviteType: 'PLAYER' | 'SPECTATOR') => void
  onSaveCampaignSettings: () => void
  characterSettingsDraft: CharacterSettingsDraft
  onCharacterFieldChange: (field: keyof CharacterSettingsDraft, value: string | number) => void
  onSaveCharacterSettings: () => void
  isCharacterSettingsLoading: boolean
  isCharacterSettingsSaving: boolean
}

export function EditorSettingsPanel(props: EditorSettingsPanelProps) {
  if (props.membershipRole === Role.DM) {
    return (
      <CampaignSettingsPanel
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
        onSettingsSpectatorWaitlistEnabledChange={props.onSettingsSpectatorWaitlistEnabledChange}
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
    )
  }

  if (props.membershipRole === Role.PLAYER) {
    return (
      <SessionSettingsPanel
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
    )
  }

  return (
    <div className="workspaces-status-message">
      Spectators do not have editable campaign settings in offline mode.
    </div>
  )
}
