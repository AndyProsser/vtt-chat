import type { Role, UUID } from '@shared'

export interface AuthUser {
  id: UUID
  username: string
  role: Role
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
