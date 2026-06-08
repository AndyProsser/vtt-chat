import type { ChangeEvent, SubmitEventHandler } from 'react'
import type { Role, SessionState, UUID } from '@shared'
import type { CampaignVisibility, ExtensionSyncPolicy, LateJoinPolicy } from '@/types/sessionUi'
import type { Session as SessionRecord } from '@/types/session'
import type {
  CampaignExportBundle,
  CampaignSettingsHomeTab,
  CampaignSettingsPayload,
} from '@/types/session/campaign'

export type ModalsProps = {
  apiUrl: string
  token: string
  user: { id: UUID; username: string; authType?: 'FULL' | 'GUEST' }
  selectedCampaignName?: string
  showCreateCampaignModal: boolean
  isCreatingCampaign: boolean
  newCampaignName: string
  onCreateCampaignSubmit: (intent: 'edit' | 'launch', importedBundle?: CampaignExportBundle) => void
  onNewCampaignNameChange: (value: string) => void
  onCloseCreateCampaign: () => void
  showJoinCampaignModal: boolean
  joinInviteInput: string
  isJoiningCampaign: boolean
  onJoinCampaignSubmit: SubmitEventHandler<HTMLFormElement>
  onJoinInviteInputChange: (value: string) => void
  onCloseJoinCampaign: () => void
  showCampaignSettingsModal: boolean
  settingsHomeTab: CampaignSettingsHomeTab
  onSettingsHomeTabChange: (tab: CampaignSettingsHomeTab) => void
  settingsCampaignSessions: SessionRecord[]
  settingsReferenceSessionId: UUID | ''
  onSettingsReferenceSessionChange: (sessionId: UUID) => void
  settingsReferenceSession: SessionRecord | null
  isSettingsLoading: boolean
  settingsData: CampaignSettingsPayload | null
  isSettingsSaving: boolean
  onCloseCampaignSettings: () => void
  onSaveCampaignSettings: SubmitEventHandler<HTMLFormElement>
  settingsName: string
  onSettingsNameChange: (value: string) => void
  settingsDescription: string
  onSettingsDescriptionChange: (value: string) => void
  onPosterFileSelected: (event: ChangeEvent<HTMLInputElement>) => void
  isInviteReissuing: boolean
  onCopyInviteUrl: (inviteType: 'PLAYER' | 'SPECTATOR') => void
  onReissueInvite: (inviteType: 'PLAYER' | 'SPECTATOR') => void
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
  settingsLateJoinPolicy: LateJoinPolicy
  onSettingsLateJoinPolicyChange: (value: LateJoinPolicy) => void
  settingsLateJoinGraceMinutes: number
  onSettingsLateJoinGraceMinutesChange: (value: number) => void
  showUserSettingsModal: boolean
  onUserSettingsOpenChange: (open: boolean) => void
  messageGroupingWindowMs: number
  onMessageGroupingWindowChange: (value: number) => void
  showExitSessionModal: boolean
  currentSessionState?: SessionState | null
  effectiveSessionRole: Role
  exitUpgradePassword: string
  onExitUpgradePasswordChange: (value: string) => void
  exitUpgradeLoading: boolean
  exitUpgradeError: string | null
  onCloseExitSession: () => void
  onSkipGuestUpgrade: () => void
  onUpgradeAndExit: () => void
  onConfirmExitAsFullAccount: () => void
  showStopSessionModal: boolean
  onCloseStopSession: () => void
  onConfirmStopSession: () => void
  showReissueInviteModal: boolean
  reissueInviteType: 'PLAYER' | 'SPECTATOR' | null
  onCloseReissueInviteModal: () => void
  onConfirmReissueInvite: () => void
}
