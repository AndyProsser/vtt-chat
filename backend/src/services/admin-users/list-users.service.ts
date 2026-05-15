import {
  ADMIN_USERS_DEFAULT_LIST_PAGE,
  ADMIN_USERS_DEFAULT_LIST_PAGE_SIZE,
  ADMIN_USERS_MAX_LIST_PAGE_SIZE,
  ADMIN_USERS_ROLE_FILTERS,
  ADMIN_USERS_STATUS_FILTERS,
} from '@/constants/admin-users.constants'
import { listAdminUsers } from '@/repositories/admin-users.repository'
import type {
  AdminUsersListItem,
  AdminUsersListRequest,
  AdminUsersListResult,
  AdminUsersRepositoryRow,
  AdminUsersRoleFilter,
  AdminUsersStatusFilter,
} from '@/types/admin-users.types'

function coerceRoleFilter(value: unknown): AdminUsersRoleFilter {
  const normalized = String(value || 'all').toLowerCase()
  if ((ADMIN_USERS_ROLE_FILTERS as readonly string[]).includes(normalized)) {
    return normalized
  }
  return 'all'
}

function coerceStatusFilter(value: unknown): AdminUsersStatusFilter {
  const normalized = String(value || 'all').toLowerCase()
  if ((ADMIN_USERS_STATUS_FILTERS as readonly string[]).includes(normalized)) {
    return normalized
  }
  return 'all'
}

function getEffectiveAdminRole(
  row: Pick<AdminUsersRepositoryRow, 'role' | 'adminRole'>
): 'SUPER_ADMIN' | 'ADMIN' | 'CAMPAIGN_DM' | 'READ_ONLY' | null {
  if (
    row.adminRole === 'SUPER_ADMIN' ||
    row.adminRole === 'ADMIN' ||
    row.adminRole === 'READ_ONLY'
  ) {
    return row.adminRole
  }
  if (row.adminRole === 'CAMPAIGN_DM' || row.role === 'DM') {
    return 'CAMPAIGN_DM'
  }
  return null
}

function toListItem(row: AdminUsersRepositoryRow): AdminUsersListItem {
  return {
    ...row,
    effectiveAdminRole: getEffectiveAdminRole(row),
  }
}

export function parseAdminUsersListRequest(query: {
  search?: unknown
  role?: unknown
  status?: unknown
  page?: unknown
  pageSize?: unknown
}): AdminUsersListRequest {
  const page = Math.max(
    ADMIN_USERS_DEFAULT_LIST_PAGE,
    Number(query.page || ADMIN_USERS_DEFAULT_LIST_PAGE)
  )
  const pageSize = Math.min(
    ADMIN_USERS_MAX_LIST_PAGE_SIZE,
    Math.max(1, Number(query.pageSize || ADMIN_USERS_DEFAULT_LIST_PAGE_SIZE))
  )

  return {
    search: String(query.search || '').trim(),
    roleFilter: coerceRoleFilter(query.role),
    statusFilter: coerceStatusFilter(query.status),
    page,
    pageSize,
  }
}

export async function listAdminUsersForRequest(
  request: AdminUsersListRequest
): Promise<AdminUsersListResult> {
  const { users, total } = await listAdminUsers(request)

  return {
    users: users.map(toListItem),
    total,
    page: request.page,
    pageSize: request.pageSize,
    totalPages: Math.max(1, Math.ceil(total / request.pageSize)),
  }
}
