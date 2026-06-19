import type { Role, UUID } from '@shared'

export type InviteCampaignDisplayState = 'IDLE' | 'GREENROOM' | 'ACTIVE' | 'PAUSED'

export interface InviteCampaign {
  id: string
  name: string
  description: string | null
  posterUrl: string | null
  dmDisplayName: string
  dmOnline: boolean
  connectedPlayersRounded: number
  connectedPlayersLabel: string
  connectedSpectatorsRounded: number
  connectedSpectatorsLabel: string
  displayState: InviteCampaignDisplayState
}

export type InviteValidationResult =
  | {
      valid: true
      type: 'player'
      campaign: InviteCampaign
      platformStatus: {
        online: boolean
        version: string
        activeUsers: number
        activeCampaigns: number
        activeSessions: number
      }
    }
  | {
      valid: false
      reason: string
    }

export interface InviteJoinPageProps {
  apiUrl: string
  inviteCode: string
  authToken: string | null
  initialEmail?: string
  onAuthenticated?: (token: string, user: { id: UUID; username: string; role: Role }) => void
}

export type PolicyCode = 'INVITE_EXPIRED' | 'FULL_ACCOUNT_REQUIRED' | 'FULL_ACCOUNT_EXISTS' | null

export type EmailCheckStatus = 'idle' | 'invalid' | 'checking' | 'none' | 'guest' | 'full' | 'error'

export interface PlayerPrecheckResult {
  campaignId: string
  accountStatus: 'none' | 'guest' | 'full'
  guestProfile?: {
    displayName: string
  }
  existingCharacter?: {
    name: string
    race: string | null
    class: string | null
    level: number | null
    avatarUrl: string | null
  }
}
