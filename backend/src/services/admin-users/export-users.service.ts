import {
  ADMIN_USERS_DEFAULT_EXPORT_FORMAT,
  ADMIN_USERS_EXPORT_CSV_HEADERS,
} from '@/constants/admin-users.constants'
import { listAdminUsersForExport } from '@/repositories/admin-users.repository'
import type {
  AdminUsersExportFormat,
  AdminUsersExportRow,
  AdminUsersRepositoryRow,
} from '@/types/admin-users.types'

function toExportRow(row: AdminUsersRepositoryRow): AdminUsersExportRow {
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

export function parseAdminUsersExportFormat(value: unknown): AdminUsersExportFormat {
  return String(value || ADMIN_USERS_DEFAULT_EXPORT_FORMAT).toLowerCase() === 'csv' ? 'csv' : 'json'
}

export async function getAdminUsersExportRows(): Promise<AdminUsersExportRow[]> {
  const rows = await listAdminUsersForExport()
  return rows.map(toExportRow)
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
