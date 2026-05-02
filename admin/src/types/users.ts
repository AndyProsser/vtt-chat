import type { AdminRole } from '@/types/auth'
import type { Role } from '@shared'

export type { AdminRole }
export type UserRole = Exclude<Role, 'SYSTEM'>
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

export interface UserExportRow {
  id: string
  username: string
  email: string
  displayName: string
  role: string
  adminRole: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface UserExportResponse {
  exportedAt: string
  count: number
  users: UserExportRow[]
}

export interface UserImportPreviewRow {
  index: number
  username: string
  email: string
  displayName: string
  role: string
  conflict: boolean
  valid: boolean
}

export interface UserImportPreviewResponse {
  preview: UserImportPreviewRow[]
  importable: number
  total: number
}

export function roleLabel(role: UserRole, adminRole: AdminRole | null): string {
  if (adminRole) return `${role} / ${adminRole}`
  return role
}
