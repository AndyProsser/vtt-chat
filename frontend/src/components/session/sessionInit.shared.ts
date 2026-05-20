import { Role, SessionState, deriveCampaignDisplayState } from '@shared'
import type { UUID } from '@shared'

export interface CampaignSummary {
  id: UUID
  name: string
  description?: string | null
  createdAt?: number | string
  updatedAt?: number | string
  posterUrl?: string | null
  extensionSyncPolicy?: 'NONE' | 'DM_ONLY' | 'DM_AND_PLAYERS'
  inviteCode: string
  currentDmId: UUID
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
}

export type CampaignMembershipRole = CampaignSummary['memberRole']

export type CampaignSettingsHomeTab = 'home' | 'notes' | 'journal'

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
  extensionSyncPolicy: 'NONE' | 'DM_ONLY' | 'DM_AND_PLAYERS'
  lateJoinPolicy: 'OPEN' | 'SCREENED' | 'BLOCKED'
  lateJoinGraceMinutes: number
  inviteCode: string
  inviteActive: boolean
  spectatorInviteCode?: string | null
  spectatorInviteActive: boolean
  postSessionChatEnabled: boolean
  postSessionChatDurationMs: number
  dmAutoTargetOnFirstPlayerJoin: boolean
}

export type CampaignEntryAction = {
  label: 'Launch'
  icon: 'rocket_launch'
  disabled: boolean
  reason?: string
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

  // DMs and players can always enter. Only spectators have entry restrictions.
  if (!isSpectator) {
    return {
      label: 'Launch',
      icon: 'rocket_launch',
      disabled: false,
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
