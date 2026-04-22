export type UserRole = 'DM' | 'PLAYER' | 'SPECTATOR'
export type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'CAMPAIGN_DM' | 'READ_ONLY'
export type InviteRole = 'ADMIN' | 'CAMPAIGN_DM' | 'READ_ONLY'

export interface AdminUserRow {
  id: string
  username: string
  email: string | null
  displayName: string
  role: UserRole
  adminRole: AdminRole | null
  effectiveAdminRole: AdminRole | null
  isActive: boolean
  tokenInvalidBefore: string | null
  createdAt: string
  updatedAt: string
}

export interface UserListResponse {
  users: AdminUserRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export function roleLabel(role: UserRole, adminRole: AdminRole | null): string {
  if (adminRole) return `${role} / ${adminRole}`
  return role
}
