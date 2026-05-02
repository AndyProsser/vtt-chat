import type { Role } from '@shared'
import type { AdminRole } from '@/types/auth.types'

type SharedRoleValue = `${Role}`

export type UserAuthContext = {
  id: string
  username: string
  role: SharedRoleValue
  adminRole: AdminRole | null
  isActive: boolean
  password: string | null
  displayName: string
  avatarUrl: string | null
  email: string | null
  tokenInvalidBefore: Date | null
  authType: 'FULL' | 'GUEST'
  isFullAccount: boolean
  hasAdminAccess: boolean
  requiresUpgradeForAdmin: boolean
}

export type HandoffExchangeUser = {
  id: string
  username: string
  role: SharedRoleValue
  displayName: string
  avatarUrl: string | null
  isActive: boolean
  adminRole: AdminRole | null
  password: string | null
  authType: 'FULL' | 'GUEST'
}

export type ValidateUserAuthStateResult =
  | { ok: true }
  | { ok: false; code: 'INACTIVE_OR_MISSING' | 'TOKEN_INVALIDATED' }
