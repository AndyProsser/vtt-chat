import type { Role, UUID } from '@shared'

export interface AuthUser {
  id: UUID
  username: string
  /** JWT global role. Always reflects the token payload. */
  role: Role
  /**
   * Campaign-scoped membership role. Present when the user is participating in
   * a campaign session.  Use this – not `role` – for campaign-specific
   * authorization checks (e.g. DM-only controls).
   */
  campaignMembershipRole?: 'DM' | 'PLAYER' | 'SPECTATOR'
  accessMode?: 'USER' | 'CAMPAIGN'
  authType?: 'FULL' | 'GUEST'
}

export interface AuthState {
  token: string | null
  user: AuthUser | null
}

export interface AuthProfile {
  adminRole: 'SUPER_ADMIN' | 'ADMIN' | 'CAMPAIGN_DM' | 'READ_ONLY' | null
  hasAdminAccess: boolean
  isFullAccount: boolean
  requiresUpgradeForAdmin: boolean
  authType: 'FULL' | 'GUEST'
  email: string | null
}
