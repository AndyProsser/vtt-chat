import {
  ADMIN_USERS_IMPORT_PREVIEW_DEFAULT_ROLE,
  ADMIN_USERS_IMPORT_PREVIEW_MAX_ROWS,
  ADMIN_USERS_IMPORT_PREVIEW_MIN_USERNAME_LENGTH,
} from '@/constants/admin-users.constants'
import { findExistingUsernames } from '@/repositories/admin-users.repository'
import type {
  AdminUsersImportCandidate,
  AdminUsersImportPreviewRequest,
  AdminUsersImportPreviewResult,
} from '@/types/admin-users.types'

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
    return {
      ok: false,
      code: 'INVALID_BODY',
      message: 'Body must contain a non-empty users array',
    }
  }

  if (request.users.length > ADMIN_USERS_IMPORT_PREVIEW_MAX_ROWS) {
    return {
      ok: false,
      code: 'TOO_MANY_ROWS',
      message: `Import preview limited to ${ADMIN_USERS_IMPORT_PREVIEW_MAX_ROWS} rows per batch`,
    }
  }

  return {
    ok: true,
    users: request.users,
  }
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
    data: {
      preview,
      importable,
      total: validation.users.length,
    },
  }
}
