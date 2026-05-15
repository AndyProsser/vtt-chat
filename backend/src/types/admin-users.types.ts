export type AdminUsersRoleFilter = 'all' | 'dm' | 'player' | 'spectator' | 'admin'

export type AdminUsersStatusFilter = 'all' | 'active' | 'suspended'

export type AdminUsersExportFormat = 'json' | 'csv'

export type AdminUsersEffectiveRole = 'SUPER_ADMIN' | 'ADMIN' | 'CAMPAIGN_DM' | 'READ_ONLY' | null

export interface AdminUsersListRequest {
  search: string
  roleFilter: AdminUsersRoleFilter
  statusFilter: AdminUsersStatusFilter
  page: number
  pageSize: number
}

export interface AdminUsersRepositoryRow {
  id: string
  username: string
  email: string | null
  displayName: string | null
  role: string
  adminRole: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  tokenInvalidBefore: Date | null
}

export interface AdminUsersListItem {
  id: string
  username: string
  email: string | null
  displayName: string | null
  role: string
  adminRole: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  tokenInvalidBefore: Date | null
  effectiveAdminRole: AdminUsersEffectiveRole
}

export interface AdminUsersListResult {
  users: AdminUsersListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface AdminUsersExportRow {
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

export interface AdminUsersImportCandidate {
  username?: string
  email?: string
  displayName?: string
  role?: string
}

export interface AdminUsersImportPreviewRequest {
  users: AdminUsersImportCandidate[]
}

export interface AdminUsersImportPreviewItem {
  index: number
  username: string
  email: string
  displayName: string
  role: string
  conflict: boolean
  valid: boolean
}

export interface AdminUsersImportPreviewResult {
  preview: AdminUsersImportPreviewItem[]
  importable: number
  total: number
}
