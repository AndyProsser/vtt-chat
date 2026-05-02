import type { Role, UUID } from '@shared'

export type SharedRoleValue = `${Role}`
export type PlayerFacingRole = Exclude<SharedRoleValue, 'SYSTEM'>
export type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'CAMPAIGN_DM' | 'READ_ONLY'

export type TokenPayload = {
  userId: UUID
  username: string
  role: PlayerFacingRole
  authType?: 'FULL' | 'GUEST'
  sessionId?: UUID
  iat?: number
  exp?: number
}

export interface AuthToken {
  userId: string
  username: string
  role: PlayerFacingRole
  authType: 'FULL' | 'GUEST'
  sessionId: string
  iat: number
  exp: number
}

export interface AdminAuthToken {
  userId: string
  username: string
  adminRole: AdminRole
  iat: number
  exp: number
}
