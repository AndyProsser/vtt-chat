import type { UUID } from '@shared'

export type TokenPayload = {
  userId: UUID
  username: string
  role: 'DM' | 'PLAYER' | 'SPECTATOR'
  authType?: 'FULL' | 'GUEST'
  sessionId?: UUID
  iat?: number
  exp?: number
}

export interface AuthToken {
  userId: string
  username: string
  role: 'PLAYER' | 'DM' | 'SPECTATOR'
  authType: 'FULL' | 'GUEST'
  sessionId: string
  iat: number
  exp: number
}

export interface AdminAuthToken {
  userId: string
  username: string
  adminRole: 'SUPER_ADMIN' | 'ADMIN' | 'CAMPAIGN_DM' | 'READ_ONLY'
  iat: number
  exp: number
}
