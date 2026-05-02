import { useEffect, useMemo, useState } from 'react'
import { requestJson } from '../../utils/api'
import type { AdminUserRow, InviteRole, UserListResponse, UserImportPreviewResponse } from './types'

export function useUserManagement() {
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [rows, setRows] = useState<AdminUserRow[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionBusyUserId, setActionBusyUserId] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<InviteRole>('ADMIN')
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [creatingInvite, setCreatingInvite] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [exportBusy, setExportBusy] = useState(false)
  const [importPreview, setImportPreview] = useState<UserImportPreviewResponse | null>(null)
  const [importBusy, setImportBusy] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      search,
      role: roleFilter,
      status: statusFilter,
      page: String(page),
      pageSize: String(pageSize),
    })
    return params.toString()
  }, [search, roleFilter, statusFilter, page, pageSize])

  useEffect(() => {
    const loadUsers = async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await requestJson<UserListResponse>(`/users?${queryString}`, {
          method: 'GET',
        })
        setRows(result.users)
        setTotal(result.total)
        setTotalPages(result.totalPages)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load users')
      } finally {
        setLoading(false)
      }
    }

    void loadUsers()
  }, [queryString, reloadToken])

  const runAction = async (
    userId: string,
    method: 'PATCH' | 'POST',
    path: string,
    defaultReason: string
  ) => {
    const reason = window.prompt('Provide a reason for this moderation action', defaultReason)
    if (reason === null) return

    setActionBusyUserId(userId)
    setError(null)
    try {
      await requestJson<{ message: string }>(path, {
        method,
        body: JSON.stringify({ reason }),
      })
      setReloadToken((current) => current + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Moderation action failed')
    } finally {
      setActionBusyUserId(null)
    }
  }

  const createInvite = async () => {
    setCreatingInvite(true)
    setError(null)
    setInviteUrl(null)
    try {
      const result = await requestJson<{ inviteUrl: string }>('/invites', {
        method: 'POST',
        body: JSON.stringify({
          email: inviteEmail.trim() || undefined,
          adminRole: inviteRole,
        }),
      })
      setInviteUrl(result.inviteUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invite')
    } finally {
      setCreatingInvite(false)
    }
  }

  const exportUsers = async (format: 'json' | 'csv') => {
    setExportBusy(true)
    setError(null)
    try {
      const response = await fetch(
        `${(window as any).__ADMIN_API_BASE__ || ''}/api/admin/users/export?format=${format}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('admin_token') || ''}`,
          },
        }
      )
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || `Export failed (${response.status})`)
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `users-export.${format}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExportBusy(false)
    }
  }

  const previewImport = async (jsonText: string) => {
    setImportBusy(true)
    setImportError(null)
    setImportPreview(null)
    try {
      let users: unknown[]
      try {
        const parsed: unknown = JSON.parse(jsonText)
        users = Array.isArray(parsed)
          ? parsed
          : Array.isArray((parsed as any)?.users)
            ? (parsed as any).users
            : []
      } catch {
        throw new Error('Invalid JSON — paste a valid users array or export file')
      }
      const result = await requestJson<UserImportPreviewResponse>('/users/import/preview', {
        method: 'POST',
        body: JSON.stringify({ users }),
      })
      setImportPreview(result)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Preview failed')
    } finally {
      setImportBusy(false)
    }
  }

  const clearImportPreview = () => {
    setImportPreview(null)
    setImportError(null)
  }

  return {
    search,
    setSearch,
    roleFilter,
    setRoleFilter,
    statusFilter,
    setStatusFilter,
    page,
    setPage,
    pageSize,
    setPageSize,
    rows,
    total,
    totalPages,
    loading,
    error,
    actionBusyUserId,
    inviteEmail,
    setInviteEmail,
    inviteRole,
    setInviteRole,
    inviteUrl,
    creatingInvite,
    runAction,
    createInvite,
    exportBusy,
    exportUsers,
    importPreview,
    importBusy,
    importError,
    previewImport,
    clearImportPreview,
  }
}
