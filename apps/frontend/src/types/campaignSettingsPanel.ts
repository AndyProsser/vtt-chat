import type { ChangeEvent, ReactNode } from 'react'
import type {
  CampaignVisibility,
  ExtensionPartyInventorySyncAccess,
  ExtensionSyncConflictResolution,
  ExtensionSyncPolicy,
  LateJoinPolicy,
  SupportedPlatform,
} from '@/types/sessionUi'
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
  settingsVisibility: CampaignVisibility
  onSettingsVisibilityChange: (value: CampaignVisibility) => void
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
  settingsExtensionSyncPolicy: ExtensionSyncPolicy
  onSettingsExtensionSyncPolicyChange: (value: ExtensionSyncPolicy) => void
  settingsExtensionInventorySyncEnabled: boolean
  onSettingsExtensionInventorySyncEnabledChange: (value: boolean) => void
  settingsExtensionCurrencySyncEnabled: boolean
  onSettingsExtensionCurrencySyncEnabledChange: (value: boolean) => void
  settingsExtensionPartyInventorySyncAccess: ExtensionPartyInventorySyncAccess
  onSettingsExtensionPartyInventorySyncAccessChange: (
    value: ExtensionPartyInventorySyncAccess
  ) => void
  settingsExtensionSyncConflictResolution: ExtensionSyncConflictResolution
  onSettingsExtensionSyncConflictResolutionChange: (value: ExtensionSyncConflictResolution) => void
  settingsLateJoinPolicy: LateJoinPolicy
  onSettingsLateJoinPolicyChange: (value: LateJoinPolicy) => void
  settingsLateJoinGraceMinutes: number
  onSettingsLateJoinGraceMinutesChange: (value: number) => void
  settingsDmAutoTargetOnFirstPlayerJoin: boolean
  onSettingsDmAutoTargetOnFirstPlayerJoinChange: (value: boolean) => void
  settingsDefaultSessionDurationMins: number
  onSettingsDefaultSessionDurationMinsChange: (value: number) => void
  settingsSupportedPlatforms: SupportedPlatform[]
  onSettingsSupportedPlatformsChange: (value: SupportedPlatform[]) => void
  settingsDndRuleset: '2014' | '2024'
  onSettingsDndRulesetChange: (value: '2014' | '2024') => void
  settingsAllowPlayerGive: boolean
  onSettingsAllowPlayerGiveChange: (value: boolean) => void
  settingsAllowPlayerTake: boolean
  onSettingsAllowPlayerTakeChange: (value: boolean) => void
  settingsAllowPlayerLoot: boolean
  onSettingsAllowPlayerLootChange: (value: boolean) => void
  sessionNameBase: string
  onSessionNameBaseChange: (value: string) => void
  sessionNameContext: 'CURRENT' | 'NEXT'
  isSessionActive: boolean
  isEditorContext: boolean
  onCopyInviteUrl: (inviteType: 'PLAYER' | 'SPECTATOR') => void
  onReissueInvite: (inviteType: 'PLAYER' | 'SPECTATOR') => void
  onExport: () => void
  onSave: () => void
  onDeleteCampaign: () => void
  isDeletingCampaign: boolean
  sessionSettingsPanel?: ReactNode
  /** Campaign UUID — required to enable the DM transfer section. */
  campaignId?: string | null
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
  | 'settingsExtensionInventorySyncEnabled'
  | 'onSettingsExtensionInventorySyncEnabledChange'
  | 'settingsExtensionCurrencySyncEnabled'
  | 'onSettingsExtensionCurrencySyncEnabledChange'
  | 'settingsExtensionPartyInventorySyncAccess'
  | 'onSettingsExtensionPartyInventorySyncAccessChange'
  | 'settingsExtensionSyncConflictResolution'
  | 'onSettingsExtensionSyncConflictResolutionChange'
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
  | 'settingsDndRuleset'
  | 'onSettingsDndRulesetChange'
  | 'settingsAllowPlayerGive'
  | 'onSettingsAllowPlayerGiveChange'
  | 'settingsAllowPlayerTake'
  | 'onSettingsAllowPlayerTakeChange'
  | 'settingsAllowPlayerLoot'
  | 'onSettingsAllowPlayerLootChange'
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
