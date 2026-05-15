import {
  ADMIN_USERS_DEFAULT_EXPORT_FORMAT,
  ADMIN_USERS_DEFAULT_LIST_PAGE,
  ADMIN_USERS_DEFAULT_LIST_PAGE_SIZE,
  ADMIN_USERS_EXPORT_CSV_HEADERS,
  ADMIN_USERS_IMPORT_PREVIEW_DEFAULT_ROLE,
  ADMIN_USERS_IMPORT_PREVIEW_MAX_ROWS,
  ADMIN_USERS_IMPORT_PREVIEW_MIN_USERNAME_LENGTH,
  ADMIN_USERS_MAX_LIST_PAGE_SIZE,
  ADMIN_USERS_ROLE_FILTERS,
  ADMIN_USERS_STATUS_FILTERS,
} from '@/constants/admin-users.constants'
import {
  findExistingUsernames,
  listAdminUsers,
  listAdminUsersForExport,
} from '@/repositories/admin-users.repository'
import type {
  AdminUsersExportFormat,
  AdminUsersExportRow,
  AdminUsersImportCandidate,
  AdminUsersImportPreviewRequest,
  AdminUsersImportPreviewResult,
  AdminUsersListItem,
  AdminUsersListRequest,
  AdminUsersListResult,
  AdminUsersRepositoryRow,
  AdminUsersRoleFilter,
  AdminUsersStatusFilter,
} from '@/types/admin-users.types'

// ─── Private Helpers ──────────────────────────────────────────────────────────

function coerceUsersRoleFilter(value: unknown): AdminUsersRoleFilter {
  const normalized = String(value || 'all').toLowerCase()
  if ((ADMIN_USERS_ROLE_FILTERS as readonly string[]).includes(normalized)) {
    return normalized as AdminUsersRoleFilter
  }
  return 'all'
}

function coerceUsersStatusFilter(value: unknown): AdminUsersStatusFilter {
  const normalized = String(value || 'all').toLowerCase()
  if ((ADMIN_USERS_STATUS_FILTERS as readonly string[]).includes(normalized)) {
    return normalized as AdminUsersStatusFilter
  }
  return 'all'
}

function getUserEffectiveAdminRole(
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

function toUserListItem(row: AdminUsersRepositoryRow): AdminUsersListItem {
  return { ...row, effectiveAdminRole: getUserEffectiveAdminRole(row) }
}

function toUserExportRow(row: AdminUsersRepositoryRow): AdminUsersExportRow {
  return {
    id: row.id,
    username: row.username,
    email: row.email || '',
    displayName: row.displayName || '',
    role: row.role,
    adminRole: row.adminRole || '',
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

type ImportPreviewValidationError = {
  ok: false
  code: 'INVALID_BODY' | 'TOO_MANY_ROWS'
  message: string
}

type ImportPreviewValidationSuccess = {
  ok: true
  users: AdminUsersImportCandidate[]
}

type ImportPreviewValidationResult = ImportPreviewValidationError | ImportPreviewValidationSuccess

function validateImportPreviewRequest(body: unknown): ImportPreviewValidationResult {
  const request = body as AdminUsersImportPreviewRequest
  if (!request || !Array.isArray(request.users) || request.users.length === 0) {
    return { ok: false, code: 'INVALID_BODY', message: 'Body must contain a non-empty users array' }
  }

  if (request.users.length > ADMIN_USERS_IMPORT_PREVIEW_MAX_ROWS) {
    return {
      ok: false,
      code: 'TOO_MANY_ROWS',
      message: `Import preview limited to ${ADMIN_USERS_IMPORT_PREVIEW_MAX_ROWS} rows per batch`,
    }
  }

  return { ok: true, users: request.users }
}

// ─── Users ────────────────────────────────────────────────────────────────────

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
    roleFilter: coerceUsersRoleFilter(query.role),
    statusFilter: coerceUsersStatusFilter(query.status),
    page,
    pageSize,
  }
}

export async function listAdminUsersForRequest(
  request: AdminUsersListRequest
): Promise<AdminUsersListResult> {
  const { users, total } = await listAdminUsers(request)

  return {
    users: users.map(toUserListItem),
    total,
    page: request.page,
    pageSize: request.pageSize,
    totalPages: Math.max(1, Math.ceil(total / request.pageSize)),
  }
}

export function parseAdminUsersExportFormat(value: unknown): AdminUsersExportFormat {
  return String(value || ADMIN_USERS_DEFAULT_EXPORT_FORMAT).toLowerCase() === 'csv' ? 'csv' : 'json'
}

export async function getAdminUsersExportRows(): Promise<AdminUsersExportRow[]> {
  const rows = await listAdminUsersForExport()
  return rows.map(toUserExportRow)
}

export function createAdminUsersCsv(rows: AdminUsersExportRow[]): string {
  const escape = (value: string | boolean) => {
    const cell = String(value)
    return cell.includes(',') || cell.includes('"') || cell.includes('\n')
      ? `"${cell.replace(/"/g, '""')}"`
      : cell
  }

  return [
    ADMIN_USERS_EXPORT_CSV_HEADERS.join(','),
    ...rows.map((row) =>
      ADMIN_USERS_EXPORT_CSV_HEADERS.map((header) => escape(row[header])).join(',')
    ),
  ].join('\n')
}

export async function previewAdminUsersImport(params: {
  body: unknown
}): Promise<
  | { ok: true; data: AdminUsersImportPreviewResult }
  | { ok: false; code: 'INVALID_BODY' | 'TOO_MANY_ROWS'; message: string }
> {
  const validation = validateImportPreviewRequest(params.body)
  if (!validation.ok) {
    return validation
  }

  const usernames = validation.users
    .map((user) => String(user.username || '').trim())
    .filter((username) => username.length > 0)

  const existingSet = new Set(await findExistingUsernames(usernames))

  const preview = validation.users.map((user, idx) => {
    const username = String(user.username || '')
    return {
      index: idx,
      username,
      email: String(user.email || ''),
      displayName: String(user.displayName || user.username || ''),
      role: String(user.role || ADMIN_USERS_IMPORT_PREVIEW_DEFAULT_ROLE),
      conflict: existingSet.has(username),
      valid: username.trim().length >= ADMIN_USERS_IMPORT_PREVIEW_MIN_USERNAME_LENGTH,
    }
  })

  const importable = preview.filter((row) => row.valid && !row.conflict).length

  return {
    ok: true,
    data: { preview, importable, total: validation.users.length },
  }
}
