export type PlatformStatus = {
  online: boolean
  version: string
  activeUsers: number
  activeCampaigns: number
  activeSessions: number
  peakConcurrentUsers24h: number
  maintenanceMode: boolean
}

export type InviteValidationResult =
  | {
      valid: true
      type: 'player'
      campaign: {
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
        displayState: 'IDLE' | 'GREENROOM' | 'ACTIVE' | 'PAUSED' | 'COOLDOWN'
      }
      platformStatus: PlatformStatus
    }
  | {
      valid: false
      reason: 'INVITE_EXPIRED'
    }

export type PreflightResult =
  | { accountStatus: 'none'; suggestedFlow: 'guest' }
  | { accountStatus: 'guest'; suggestedFlow: 'auto-login' }
  | { accountStatus: 'full'; suggestedFlow: 'authenticate' | 'already-authenticated' }

export type GuestCharacterInput = {
  name: string
  race?: string
  class?: string
  subclass?: string
  level?: number
  externalCharacterId?: string
  characterUrl?: string
  avatarUrl?: string
}

export type GuestCampaignPacket = {
  externalCampaignId?: string
  dmExternalUserId?: string
}

export type SpectatorCharacterSummary = {
  name: string
  class: string | null
  level: number | null
  avatarUrl: string | null
  online: boolean
}

export type SpectatorInviteValidationResult =
  | {
      valid: true
      type: 'spectator'
      campaign: {
        id: string
        name: string
        dmDisplayName: string
        sessionActive: boolean
        spectatorSlotsFilled: number
        spectatorSlotsMax: number
        spectatorWaitlistEnabled: boolean
        spectatorPolicy: 'NONE' | 'GUESTS' | 'USERS'
      }
      characters: SpectatorCharacterSummary[]
    }
  | {
      valid: false
      reason: 'INVITE_EXPIRED'
    }

export type GuestLoginInput = {
  inviteCode: string
  externalSystem: string
  externalUserId: string
  email: string
  displayName?: string
  avatarUrl?: string
  character?: GuestCharacterInput
  campaignPacket?: GuestCampaignPacket
}

export type GuestSpectatorJoinResult =
  | {
      joined: true
      token: string
      user: {
        id: string
        username: string
        displayName: string
        role: 'SPECTATOR'
        authType: 'GUEST' | 'FULL'
      }
      campaignId: string
    }
  | {
      joined: false
      waitlist: {
        enabled: true
        waitlistToken: string
        position: number
      }
      campaignId: string
    }

export type SpectatorWaitlistStatusResult = {
  campaignId: string
  status: 'WAITLISTED' | 'PROMOTED' | 'NOT_FOUND'
  position?: number
  token?: string
  user?: {
    id: string
    username: string
    displayName: string
    role: 'SPECTATOR'
    authType: 'GUEST' | 'FULL'
  }
}

export type BrowseCampaignResult = {
  campaignId: string
  name: string
  dmDisplayName: string
  sessionActive: boolean
  spectatorPolicy: 'NONE' | 'GUESTS' | 'USERS'
  private: boolean
  spectatorSlotsFilled: number
  spectatorSlotsMax: number
  joinEnabled: boolean
}

export type SpectatorPromotionResult =
  | {
      promoted: true
      campaignId: string
      sessionId: string
      waitlistToken: string
      user: {
        id: string
        username: string
        displayName: string
        role: 'SPECTATOR'
        authType: 'GUEST' | 'FULL'
      }
    }
  | {
      promoted: false
    }
