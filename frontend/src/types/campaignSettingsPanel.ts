import type { ChangeEvent, ReactNode } from 'react'
import type { CampaignSettingsPayload } from '@/types/session/campaign'

export type CampaignSettingsPanelProps = {
  campaignName?: string
  isLoading: boolean
  isSaving: boolean
  isInviteReissuing: boolean
  settingsData: CampaignSettingsPayload | null
  settingsName: string
  onSettingsNameChange: (value: string) => void
  settingsDescription: string
  onSettingsDescriptionChange: (value: string) => void
  onPosterFileSelected: (event: ChangeEvent<HTMLInputElement>) => void
  settingsPosterUrl: string
  onSettingsPosterUrlChange: (value: string) => void
  onRemovePoster: () => void
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
  settingsDefaultSessionDurationMins: number
  onSettingsDefaultSessionDurationMinsChange: (value: number) => void
  settingsSupportedPlatforms: ('ANY' | 'DDB' | 'ROLL20' | 'FOUNDRY')[]
  onSettingsSupportedPlatformsChange: (value: ('ANY' | 'DDB' | 'ROLL20' | 'FOUNDRY')[]) => void
  sessionNameBase: string
  onSessionNameBaseChange: (value: string) => void
  sessionNameContext: 'CURRENT' | 'NEXT'
  isSessionActive: boolean
  isEditorContext: boolean
  onCopyInviteUrl: (inviteType: 'PLAYER' | 'SPECTATOR') => void
  onReissueInvite: (inviteType: 'PLAYER' | 'SPECTATOR') => void
  onSave: () => void
  sessionSettingsPanel?: ReactNode
}

export type CampaignSettingsPanelPolicyProps = Pick<
  CampaignSettingsPanelProps,
  | 'isSaving'
  | 'settingsVisibility'
  | 'onSettingsVisibilityChange'
  | 'settingsSpectatorsEnabled'
  | 'onSettingsSpectatorsEnabledChange'
  | 'settingsSpectatorMax'
  | 'onSettingsSpectatorMaxChange'
  | 'settingsSpectatorWaitlistEnabled'
  | 'onSettingsSpectatorWaitlistEnabledChange'
  | 'settingsSpectatorReconnectGraceSecs'
  | 'onSettingsSpectatorReconnectGraceSecsChange'
  | 'settingsPostSessionChatEnabled'
  | 'onSettingsPostSessionChatEnabledChange'
  | 'settingsPostSessionChatDurationMinutes'
  | 'onSettingsPostSessionChatDurationMinutesChange'
  | 'settingsExtensionSyncPolicy'
  | 'onSettingsExtensionSyncPolicyChange'
  | 'settingsLateJoinPolicy'
  | 'onSettingsLateJoinPolicyChange'
  | 'settingsLateJoinGraceMinutes'
  | 'onSettingsLateJoinGraceMinutesChange'
  | 'settingsDmAutoTargetOnFirstPlayerJoin'
  | 'onSettingsDmAutoTargetOnFirstPlayerJoinChange'
  | 'settingsDefaultSessionDurationMins'
  | 'onSettingsDefaultSessionDurationMinsChange'
  | 'settingsSupportedPlatforms'
  | 'onSettingsSupportedPlatformsChange'
  | 'sessionNameBase'
  | 'onSessionNameBaseChange'
  | 'sessionNameContext'
  | 'isSessionActive'
  | 'isEditorContext'
>

export type CampaignSettingsPanelInvitesProps = Pick<
  CampaignSettingsPanelProps,
  'isInviteReissuing' | 'settingsSpectatorsEnabled' | 'onCopyInviteUrl' | 'onReissueInvite'
> & {
  hasSpectatorInviteCode: boolean
  playerInviteUrl: string
  spectatorInviteUrl: string
}
