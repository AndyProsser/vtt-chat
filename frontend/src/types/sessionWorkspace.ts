import type { ComponentProps } from 'react'
import { type Role } from '@shared'
import type { UUID } from '@shared'
import { AudioPanel } from '@/components/workspaces/session/audio/AudioPanel'
import { ChatWindow } from '@/components/workspaces/session/chat/ChatWindow'
import { ReconnectBanner } from '@/components/ui/ReconnectBanner'
import type { Session as SessionRecord } from '@/types/session'
import type { Room as RoomRecord, RoomUser as RoomMember } from '@/types/room'
import { CampaignInformationPanel } from '@/components/workspaces/shared/panels/CampaignInformationPanel'
import type { PlayerSettingsPanel } from '@/components/workspaces/shared/panels/PlayerSettingsPanel'
import type { CampaignSessionPolicyBindings } from '@/components/workspaces/shared/panels/CampaignSessionSettingsPanel'
import { LeftRailPanel } from '@/components/workspaces/session/LeftRailPanel'
import { SessionWorkspaceFrame } from '@/components/workspaces/session/WorkspaceFrame'
import { SessionToolbar } from '@/components/workspaces/shared/toolbar/SessionToolbar'
import type { CampaignSummary } from '@/types/session/campaign'

export type SessionWorkspaceProps = {
  hasSessionSelected: boolean
  currentSession: SessionRecord | null
  currentPauseStats: {
    pauseStartedAt: number | undefined
    cumulativePauseMs: number
    pauseCount: number
  }
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
  sessions: SessionRecord[]
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
  totalSessionDurationMs: number
  canEditCampaignInfo: boolean
  onSaveCampaignInfo: ComponentProps<typeof CampaignInformationPanel>['onSaveCampaignInfo']
  campaignIdForSettings: UUID | ''
  sessionSettingsName: string
  sessionSettingsPlannedDurationMinutes: number
  defaultSessionDurationMinutes: number
  sessionStartedAt: number | undefined
  canEditSessionSettings: boolean
  onSessionNameChange: (value: string) => void
  onPlannedDurationMinutesChange: (value: number) => void
  onSaveSessionSettings: () => void
  isSessionSettingsSaving: boolean
  sessionCampaignPolicy?: CampaignSessionPolicyBindings
  characterDraft: PlayerSettingsPanel
  onCharacterFieldChange: (field: keyof PlayerSettingsPanel, value: string | number) => void
  onSaveCharacterSettings: () => void
  isCharacterSettingsLoading: boolean
  isCharacterSettingsSaving: boolean
  userId: UUID
}
