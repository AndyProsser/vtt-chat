import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, Root } from 'react-dom/client'

const logsHookState = {
  timeRange: '24h',
  setTimeRange: vi.fn(),
  severity: 'all',
  setSeverity: vi.fn(),
  source: 'all',
  setSource: vi.fn(),
  userId: '',
  setUserId: vi.fn(),
  roomId: '',
  setRoomId: vi.fn(),
  page: 1,
  setPage: vi.fn(),
  pageSize: 25,
  setPageSize: vi.fn(),
  rows: [{ id: 'log-1', message: 'm' }],
  total: 1,
  totalPages: 2,
  loading: false,
  error: null as string | null,
  selectedLog: null as unknown,
  setSelectedLog: vi.fn(),
  detailLoadingId: null as string | null,
  toggleSort: vi.fn(),
  sortIndicator: vi.fn(() => '↕'),
  openLogDetail: vi.fn(async () => {}),
}

vi.mock('../features/logs/useLogsPage', () => ({
  useLogsPage: () => logsHookState,
}))

vi.mock('../features/logs/LogFilters', () => ({
  LogFilters: (props: any) =>
    React.createElement(
      'div',
      null,
      React.createElement(
        'button',
        { onClick: () => props.onTimeRangeChange('7d') },
        'change-time'
      ),
      React.createElement(
        'button',
        { onClick: () => props.onSeverityChange('ERROR') },
        'change-severity'
      ),
      React.createElement(
        'button',
        { onClick: () => props.onSourceChange('runtime') },
        'change-source'
      ),
      React.createElement(
        'button',
        { onClick: () => props.onUserIdChange('user-1') },
        'change-user'
      ),
      React.createElement(
        'button',
        { onClick: () => props.onRoomIdChange('room-1') },
        'change-room'
      ),
      React.createElement('button', { onClick: () => props.onPageSizeChange(50) }, 'change-size')
    ),
}))

vi.mock('../features/logs/LogsTable', () => ({
  LogsTable: (props: any) =>
    React.createElement(
      'div',
      null,
      React.createElement('button', { onClick: () => props.onToggleSort('source') }, 'toggle-sort'),
      React.createElement(
        'button',
        { onClick: () => props.onOpenLogDetail({ id: 'log-1' }) },
        'open-detail'
      )
    ),
}))

vi.mock('../features/logs/LogDetailsPanel', () => ({
  LogDetailsPanel: ({ onClose }: { onClose: () => void }) =>
    React.createElement('button', { onClick: onClose }, 'close-detail'),
}))

const userHookState = {
  search: '',
  setSearch: vi.fn(),
  roleFilter: 'all',
  setRoleFilter: vi.fn(),
  statusFilter: 'all',
  setStatusFilter: vi.fn(),
  page: 1,
  setPage: vi.fn(),
  pageSize: 25,
  setPageSize: vi.fn(),
  rows: [{ id: 'u-1' }],
  total: 1,
  totalPages: 2,
  loading: false,
  error: null as string | null,
  actionBusyUserId: null as string | null,
  inviteEmail: '',
  setInviteEmail: vi.fn(),
  inviteRole: 'ADMIN',
  setInviteRole: vi.fn(),
  inviteUrl: null as string | null,
  creatingInvite: false,
  runAction: vi.fn(async () => {}),
  createInvite: vi.fn(async () => {}),
  exportBusy: false,
  exportUsers: vi.fn(async () => {}),
  importPreview: null as unknown,
  importBusy: false,
  importError: null as string | null,
  previewImport: vi.fn(async () => {}),
  clearImportPreview: vi.fn(),
}

vi.mock('../features/users/useUserManagement', () => ({
  useUserManagement: () => userHookState,
}))

vi.mock('../features/users/UserFilters', () => ({
  UserFilters: (props: any) =>
    React.createElement(
      'div',
      null,
      React.createElement(
        'button',
        { onClick: () => props.onSearchChange('alice') },
        'change-search'
      ),
      React.createElement(
        'button',
        { onClick: () => props.onRoleFilterChange('ADMIN') },
        'change-role'
      ),
      React.createElement(
        'button',
        { onClick: () => props.onStatusFilterChange('active') },
        'change-status'
      ),
      React.createElement(
        'button',
        { onClick: () => props.onPageSizeChange(50) },
        'change-page-size'
      )
    ),
}))

vi.mock('../features/users/UserInvitePanel', () => ({
  UserInvitePanel: (props: any) =>
    React.createElement(
      'div',
      null,
      React.createElement(
        'button',
        { onClick: () => props.onInviteEmailChange('x@y.com') },
        'invite-email'
      ),
      React.createElement(
        'button',
        { onClick: () => props.onInviteRoleChange('READ_ONLY') },
        'invite-role'
      ),
      React.createElement('button', { onClick: () => props.onCreateInvite() }, 'invite-create')
    ),
}))

vi.mock('../features/users/UserExportImportPanel', () => ({
  UserExportImportPanel: (props: any) =>
    React.createElement(
      'div',
      null,
      React.createElement('button', { onClick: () => props.onExport('json') }, 'export-json'),
      React.createElement(
        'button',
        { onClick: () => props.onPreviewImport('[]') },
        'preview-import'
      ),
      React.createElement('button', { onClick: () => props.onClearImport() }, 'clear-import')
    ),
}))

vi.mock('../features/users/UserTable', () => ({
  UserTable: (props: any) =>
    React.createElement(
      'button',
      { onClick: () => props.onRunAction('u-1', 'PATCH', '/users/u-1', 'reason') },
      'run-action'
    ),
}))

vi.mock('../components/AdminPagination', () => ({
  AdminPagination: (props: any) =>
    React.createElement(
      'div',
      null,
      React.createElement('button', { onClick: () => props.onPrevious() }, 'prev-page'),
      React.createElement('button', { onClick: () => props.onNext() }, 'next-page')
    ),
}))

vi.mock('../utils/api', () => ({
  adminApiBase: () => '/admin/api',
}))

import Logs from '../pages/Logs'
import UserManagement from '../pages/UserManagement'

describe('Page composition callback wiring', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.values(logsHookState).forEach((value) => {
      if (typeof value === 'function' && 'mockReset' in value) {
        ;(value as any).mockReset()
      }
    })
    logsHookState.sortIndicator = vi.fn(() => '↕')
    logsHookState.loading = false
    logsHookState.error = null
    logsHookState.selectedLog = null

    Object.values(userHookState).forEach((value) => {
      if (typeof value === 'function' && 'mockReset' in value) {
        ;(value as any).mockReset()
      }
    })
    userHookState.loading = false
    userHookState.error = null

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('wires Logs callbacks and renders summary text', async () => {
    await act(async () => {
      root.render(React.createElement(Logs))
    })

    expect(container.textContent).toContain('Showing 1 of 1 entries (page 1/2)')

    const clickText = async (text: string) => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent === text
      ) as HTMLButtonElement
      await act(async () => {
        btn.click()
      })
    }

    await clickText('change-time')
    await clickText('change-severity')
    await clickText('change-source')
    await clickText('change-user')
    await clickText('change-room')
    await clickText('change-size')
    await clickText('toggle-sort')
    await clickText('open-detail')
    await clickText('prev-page')
    await clickText('next-page')

    expect(logsHookState.setTimeRange).toHaveBeenCalledWith('7d')
    expect(logsHookState.setSeverity).toHaveBeenCalledWith('ERROR')
    expect(logsHookState.setSource).toHaveBeenCalledWith('runtime')
    expect(logsHookState.setUserId).toHaveBeenCalledWith('user-1')
    expect(logsHookState.setRoomId).toHaveBeenCalledWith('room-1')
    expect(logsHookState.setPageSize).toHaveBeenCalledWith(50)
    expect(logsHookState.setPage).toHaveBeenCalled()
    expect(logsHookState.toggleSort).toHaveBeenCalledWith('source')
    expect(logsHookState.openLogDetail).toHaveBeenCalledWith({ id: 'log-1' })
  })

  it('renders loading, error, and details panel states in Logs page', async () => {
    logsHookState.loading = true
    logsHookState.error = 'logs error'
    logsHookState.selectedLog = { id: 'log-selected' }

    await act(async () => {
      root.render(React.createElement(Logs))
    })

    expect(container.textContent).toContain('Loading logs...')
    expect(container.textContent).toContain('logs error')

    const closeBtn = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'close-detail'
    ) as HTMLButtonElement
    await act(async () => {
      closeBtn.click()
    })

    expect(logsHookState.setSelectedLog).toHaveBeenCalledWith(null)
  })

  it('wires UserManagement callbacks through child components', async () => {
    await act(async () => {
      root.render(React.createElement(UserManagement))
    })

    expect(container.textContent).toContain('Showing 1 of 1 users (page 1/2)')

    const clickText = async (text: string) => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent === text
      ) as HTMLButtonElement
      await act(async () => {
        btn.click()
      })
    }

    await clickText('change-search')
    await clickText('change-role')
    await clickText('change-status')
    await clickText('change-page-size')
    await clickText('invite-email')
    await clickText('invite-role')
    await clickText('invite-create')
    await clickText('export-json')
    await clickText('preview-import')
    await clickText('clear-import')
    await clickText('run-action')
    await clickText('prev-page')
    await clickText('next-page')

    expect(userHookState.setSearch).toHaveBeenCalledWith('alice')
    expect(userHookState.setRoleFilter).toHaveBeenCalledWith('ADMIN')
    expect(userHookState.setStatusFilter).toHaveBeenCalledWith('active')
    expect(userHookState.setPageSize).toHaveBeenCalledWith(50)
    expect(userHookState.setInviteEmail).toHaveBeenCalledWith('x@y.com')
    expect(userHookState.setInviteRole).toHaveBeenCalledWith('READ_ONLY')
    expect(userHookState.createInvite).toHaveBeenCalled()
    expect(userHookState.exportUsers).toHaveBeenCalledWith('json')
    expect(userHookState.previewImport).toHaveBeenCalledWith('[]')
    expect(userHookState.clearImportPreview).toHaveBeenCalled()
    expect(userHookState.runAction).toHaveBeenCalledWith('u-1', 'PATCH', '/users/u-1', 'reason')
    expect(userHookState.setPage).toHaveBeenCalled()
  })

  it('renders loading and error alerts in UserManagement page', async () => {
    userHookState.loading = true
    userHookState.error = 'users error'

    await act(async () => {
      root.render(React.createElement(UserManagement))
    })

    expect(container.textContent).toContain('Loading users...')
    expect(container.textContent).toContain('users error')
  })
})
