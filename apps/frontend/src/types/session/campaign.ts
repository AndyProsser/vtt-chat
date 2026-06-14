import { Role, SessionState, deriveCampaignDisplayState } from '@shared'
import type { UUID } from '@shared'
import type {
  LateJoinPolicy,
  PersistedExtensionSyncPolicy,
  SupportedPlatform,
} from '@/types/sessionUi'

export interface CampaignSummary {
  id: UUID
  name: string
  description?: string | null
  createdAt?: number | string
  updatedAt?: number | string
  posterUrl?: string | null
  extensionSyncPolicy?: PersistedExtensionSyncPolicy
  inviteCode?: string
  spectatorInviteCode?: string | null
  spectatorInviteActive?: boolean
  currentDmId?: UUID
  memberRole?: 'DM' | 'PLAYER' | 'SPECTATOR' | 'SYSTEM'
  dmUsername?: string
  dmDisplayName?: string
  dmAvatarUrl?: string | null
  dmOnline?: boolean
  connectedPlayers?: number
  connectedPlayersRounded?: number
  connectedPlayersLabel?: string
  connectedSpectatorsRounded?: number
  connectedSpectatorsLabel?: string
  displayState?: 'IDLE' | 'GREENROOM' | 'ACTIVE' | 'PAUSED' | 'COOLDOWN'
  latestSessionState?: SessionState | null
  discoverable?: boolean
  retiredAt?: string | null
  pendingJoinRequests?: number
  spectatorsEnabled?: boolean
  activeConnectedCount?: number
  isMember?: boolean
  sessionScheduleType?: string | null
  sessionScheduleDay?: number | null
  sessionScheduleNth?: number | null
  sessionScheduleHour?: number | null
  sessionScheduleMinute?: number | null
  sessionScheduleTz?: string | null
  nextSessionDate?: string | null
  nextSessionIsManual?: boolean
}

export interface CampaignJoinRequestSummary {
  id: UUID
  userId: UUID
  username: string
  displayName: string
  avatarUrl: string | null
  message: string | null
  requestedAt: number | string
}

export type CampaignMembershipRole = CampaignSummary['memberRole']

export type CampaignSettingsHomeTab = 'home' | 'notes' | 'journal'

/** Minimal frontend type for validating and reading a campaign export bundle. */
export interface CampaignExportBundle {
  version: 1
  exportedAt: string
  sourceCampaignId: string
  campaign: {
    name: string
    [key: string]: unknown
  }
  members: unknown[]
  characters: unknown[]
  campaignNotes: unknown[]
  greenroomMessages: unknown[]
  sessions: unknown[]
  recordings: unknown[]
}

export type CampaignSettingsPayload = {
  latestSessionId?: UUID | null
  latestSessionState?: 'IDLE' | 'ACTIVE' | 'PAUSED' | 'COOLDOWN' | 'ENDED' | null
  latestSessionEndedAt?: string | null
  id: UUID
  name: string
  description?: string | null
  posterUrl?: string | null
  discoverable: boolean
  spectatorPolicy: 'NONE' | 'GUESTS' | 'USERS'
  spectatorMax: number | null
  spectatorWaitlistEnabled: boolean
  spectatorReconnectGraceSecs: number
  extensionSyncPolicy: PersistedExtensionSyncPolicy
  lateJoinPolicy: LateJoinPolicy
  lateJoinGraceMinutes: number
  inviteCode: string
  inviteActive: boolean
  spectatorInviteCode?: string | null
  spectatorInviteActive: boolean
  postSessionChatEnabled: boolean
  postSessionChatDurationMs: number
  dmAutoTargetOnFirstPlayerJoin: boolean
  defaultSessionDurationMins: number
  supportedPlatforms: SupportedPlatform[]
  sessionScheduleType?: string | null
  sessionScheduleDay?: number | null
  sessionScheduleNth?: number | null
  sessionScheduleHour?: number | null
  sessionScheduleMinute?: number | null
  sessionScheduleTz?: string | null
  nextSessionDate?: string | null
  nextSessionIsManual?: boolean
}

export type CampaignEntryAction =
  | {
      label: 'Launch'
      icon: 'rocket_launch'
      disabled: boolean
      reason?: string
      action?: never
      showLock?: never
      dimmed?: never
    }
  | {
      label: 'Request to Join'
      icon: 'person_add'
      disabled: boolean
      reason?: string
      action: 'joinRequest'
      showLock?: false
      dimmed?: boolean
    }
  | {
      label: 'Watch'
      icon: 'visibility'
      disabled: boolean
      reason?: string
      action: 'watch'
      showLock?: boolean
      dimmed?: boolean
    }
  | {
      label: 'Invite Only'
      icon: 'lock'
      disabled: true
      reason: string
      action?: never
      showLock: true
      dimmed: true
    }

export function getCampaignDisplayState(
  campaign: CampaignSummary
): 'IDLE' | 'GREENROOM' | 'ACTIVE' | 'PAUSED' | 'COOLDOWN' {
  if (campaign.displayState) {
    return campaign.displayState
  }

  return deriveCampaignDisplayState(campaign.latestSessionState)
}

export function getCampaignEntryAction(campaign: CampaignSummary): CampaignEntryAction {
  const state = getCampaignDisplayState(campaign)
  const isSpectator = campaign.memberRole === 'SPECTATOR'

  // Members (DM / Player): always launchable except spectators which have extra guards
  if (campaign.isMember !== false && campaign.memberRole !== undefined && !isSpectator) {
    return {
      label: 'Launch',
      icon: 'rocket_launch',
      disabled: false,
    }
  }

  // Non-member paths
  if (campaign.isMember === false || campaign.memberRole === undefined) {
    const isWatchable =
      campaign.spectatorsEnabled &&
      campaign.latestSessionState === 'ACTIVE' &&
      (campaign.activeConnectedCount ?? 0) > 0

    if (isWatchable) {
      return {
        label: 'Watch',
        icon: 'visibility',
        disabled: false,
        action: 'watch',
        showLock: campaign.discoverable === false,
      }
    }

    // PUBLIC campaign: offer "Request to Join"
    if (campaign.discoverable) {
      return {
        label: 'Request to Join',
        icon: 'person_add',
        disabled: false,
        action: 'joinRequest',
      }
    }

    // PRIVATE campaign not currently watchable
    return {
      label: 'Invite Only',
      icon: 'lock',
      disabled: true,
      reason: 'This campaign is invite-only.',
      showLock: true,
      dimmed: true,
    }
  }

  // Spectators can only watch campaigns that are actively live.
  if (state !== 'ACTIVE') {
    return {
      label: 'Launch',
      icon: 'rocket_launch',
      disabled: true,
      reason: 'Spectators can only watch active campaigns.',
    }
  }

  // Spectators additionally require at least one DM and player present.
  const hasDmAndPlayerOnline = Boolean(campaign.dmOnline) && (campaign.connectedPlayers || 0) > 0
  if (!hasDmAndPlayerOnline) {
    return {
      label: 'Launch',
      icon: 'rocket_launch',
      disabled: true,
      reason: 'Launch is available once at least one DM and one player are connected.',
    }
  }

  return {
    label: 'Launch',
    icon: 'rocket_launch',
    disabled: false,
  }
}

export function getPrivacyCounterLabel(
  label: string | undefined,
  rounded: number | undefined
): string {
  if (label && label.trim()) return label
  if (!rounded || rounded <= 0) return '0'
  return `~${rounded}`
}

export function resolveMembershipRole(memberRole: CampaignMembershipRole | null | undefined): Role {
  if (memberRole === 'DM') return Role.DM
  if (memberRole === 'SPECTATOR') return Role.SPECTATOR
  return Role.PLAYER
}
