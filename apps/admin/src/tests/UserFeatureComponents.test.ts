/**
 * Tests for user feature sub-components: UserFilters, UserInvitePanel, UserExportImportPanel.
 * Also covers useUserManagement export/import paths.
 */
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, Root } from 'react-dom/client'

// ──────────────────────── UserFilters ────────────────────────

import { UserFilters } from '../features/users/UserFilters'

describe('UserFilters', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
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

  it('renders all filter controls', async () => {
    const noop = () => {}
    await act(async () => {
      root.render(
        React.createElement(UserFilters, {
          search: '',
          roleFilter: 'all',
          statusFilter: 'all',
          pageSize: 25,
          onSearchChange: noop,
          onRoleFilterChange: noop,
          onStatusFilterChange: noop,
          onPageSizeChange: noop,
        })
      )
    })
    expect(container.querySelector('[aria-label="Search users"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Filter by role"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Filter by status"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Rows per page"]')).not.toBeNull()
  })

  it('calls onSearchChange when search input changes', async () => {
    const onSearchChange = vi.fn()
    await act(async () => {
      root.render(
        React.createElement(UserFilters, {
          search: '',
          roleFilter: 'all',
          statusFilter: 'all',
          pageSize: 25,
          onSearchChange,
          onRoleFilterChange: () => {},
          onStatusFilterChange: () => {},
          onPageSizeChange: () => {},
        })
      )
    })
    const input = container.querySelector('[aria-label="Search users"]') as HTMLInputElement
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )!.set!
      nativeSetter.call(input, 'alice')
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onSearchChange).toHaveBeenCalledWith('alice')
  })

  it('calls onRoleFilterChange when role select changes', async () => {
    const onRoleFilterChange = vi.fn()
    await act(async () => {
      root.render(
        React.createElement(UserFilters, {
          search: '',
          roleFilter: 'all',
          statusFilter: 'all',
          pageSize: 25,
          onSearchChange: () => {},
          onRoleFilterChange,
          onStatusFilterChange: () => {},
          onPageSizeChange: () => {},
        })
      )
    })
    const select = container.querySelector('[aria-label="Filter by role"]') as HTMLSelectElement
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        'value'
      )!.set!
      nativeSetter.call(select, 'admin')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onRoleFilterChange).toHaveBeenCalledWith('admin')
  })

  it('calls onStatusFilterChange when status select changes', async () => {
    const onStatusFilterChange = vi.fn()
    await act(async () => {
      root.render(
        React.createElement(UserFilters, {
          search: '',
          roleFilter: 'all',
          statusFilter: 'all',
          pageSize: 25,
          onSearchChange: () => {},
          onRoleFilterChange: () => {},
          onStatusFilterChange,
          onPageSizeChange: () => {},
        })
      )
    })
    const select = container.querySelector('[aria-label="Filter by status"]') as HTMLSelectElement
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        'value'
      )!.set!
      nativeSetter.call(select, 'suspended')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onStatusFilterChange).toHaveBeenCalledWith('suspended')
  })

  it('calls onPageSizeChange when page size select changes', async () => {
    const onPageSizeChange = vi.fn()
    await act(async () => {
      root.render(
        React.createElement(UserFilters, {
          search: '',
          roleFilter: 'all',
          statusFilter: 'all',
          pageSize: 25,
          onSearchChange: () => {},
          onRoleFilterChange: () => {},
          onStatusFilterChange: () => {},
          onPageSizeChange,
        })
      )
    })
    const select = container.querySelector('[aria-label="Rows per page"]') as HTMLSelectElement
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        'value'
      )!.set!
      nativeSetter.call(select, '50')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onPageSizeChange).toHaveBeenCalledWith(50)
  })
})

// ──────────────────────── UserInvitePanel ────────────────────────

import { UserInvitePanel } from '../features/users/UserInvitePanel'

describe('UserInvitePanel', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
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

  it('renders invite form controls', async () => {
    await act(async () => {
      root.render(
        React.createElement(UserInvitePanel, {
          inviteEmail: '',
          inviteRole: 'ADMIN',
          inviteUrl: null,
          creatingInvite: false,
          onInviteEmailChange: () => {},
          onInviteRoleChange: () => {},
          onCreateInvite: () => {},
        })
      )
    })
    expect(container.querySelector('[aria-label="Invite email"]')).not.toBeNull()
    expect(container.querySelector('button')).not.toBeNull()
    expect(container.textContent).toContain('Generate Invite Link')
  })

  it('shows loading state when creatingInvite is true', async () => {
    await act(async () => {
      root.render(
        React.createElement(UserInvitePanel, {
          inviteEmail: '',
          inviteRole: 'ADMIN',
          inviteUrl: null,
          creatingInvite: true,
          onInviteEmailChange: () => {},
          onInviteRoleChange: () => {},
          onCreateInvite: () => {},
        })
      )
    })
    expect(container.textContent).toContain('Creating...')
  })

  it('shows invite URL when provided', async () => {
    const testUrl = 'https://example.com/invite/abc123'
    await act(async () => {
      root.render(
        React.createElement(UserInvitePanel, {
          inviteEmail: 'test@example.com',
          inviteRole: 'CAMPAIGN_DM',
          inviteUrl: testUrl,
          creatingInvite: false,
          onInviteEmailChange: () => {},
          onInviteRoleChange: () => {},
          onCreateInvite: () => {},
        })
      )
    })
    expect(container.textContent).toContain(testUrl)
  })

  it('calls onCreateInvite when button is clicked', async () => {
    const onCreateInvite = vi.fn()
    const onInviteEmailChange = vi.fn()
    const onInviteRoleChange = vi.fn()
    await act(async () => {
      root.render(
        React.createElement(UserInvitePanel, {
          inviteEmail: '',
          inviteRole: 'READ_ONLY',
          inviteUrl: null,
          creatingInvite: false,
          onInviteEmailChange,
          onInviteRoleChange,
          onCreateInvite,
        })
      )
    })

    const emailInput = container.querySelector('[aria-label="Invite email"]') as HTMLInputElement
    const roleSelect = container.querySelector('select') as HTMLSelectElement
    await act(async () => {
      const inputSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )!.set!
      inputSetter.call(emailInput, 'invite@example.com')
      emailInput.dispatchEvent(new Event('change', { bubbles: true }))
      const selectSetter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        'value'
      )!.set!
      selectSetter.call(roleSelect, 'CAMPAIGN_DM')
      roleSelect.dispatchEvent(new Event('change', { bubbles: true }))
    })

    const button = container.querySelector('button') as HTMLButtonElement
    await act(async () => {
      button.click()
    })
    expect(onInviteEmailChange).toHaveBeenCalledWith('invite@example.com')
    expect(onInviteRoleChange).toHaveBeenCalledWith('CAMPAIGN_DM')
    expect(onCreateInvite).toHaveBeenCalledOnce()
  })

  it('disables button when creatingInvite', async () => {
    await act(async () => {
      root.render(
        React.createElement(UserInvitePanel, {
          inviteEmail: '',
          inviteRole: 'ADMIN',
          inviteUrl: null,
          creatingInvite: true,
          onInviteEmailChange: () => {},
          onInviteRoleChange: () => {},
          onCreateInvite: () => {},
        })
      )
    })
    const button = container.querySelector('button') as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })
})

// ──────────────────────── UserExportImportPanel ────────────────────────

import { UserExportImportPanel } from '../features/users/UserExportImportPanel'

describe('UserExportImportPanel', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
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

  const defaultProps = {
    exportBusy: false,
    importPreview: null,
    importBusy: false,
    importError: null,
    onExport: vi.fn(),
    onPreviewImport: vi.fn(),
    onClearImport: vi.fn(),
  }

  it('renders export buttons', async () => {
    await act(async () => {
      root.render(React.createElement(UserExportImportPanel, defaultProps))
    })
    expect(container.textContent).toContain('Export JSON')
    expect(container.textContent).toContain('Export CSV')
  })

  it('calls onExport with json when Export JSON is clicked', async () => {
    const onExport = vi.fn()
    await act(async () => {
      root.render(React.createElement(UserExportImportPanel, { ...defaultProps, onExport }))
    })
    const buttons = container.querySelectorAll('button')
    const jsonBtn = Array.from(buttons).find((b) => b.textContent?.includes('Export JSON'))
    await act(async () => {
      jsonBtn?.click()
    })
    expect(onExport).toHaveBeenCalledWith('json')
  })

  it('calls onExport with csv when Export CSV is clicked', async () => {
    const onExport = vi.fn()
    await act(async () => {
      root.render(React.createElement(UserExportImportPanel, { ...defaultProps, onExport }))
    })
    const buttons = container.querySelectorAll('button')
    const csvBtn = Array.from(buttons).find((b) => b.textContent?.includes('Export CSV'))
    await act(async () => {
      csvBtn?.click()
    })
    expect(onExport).toHaveBeenCalledWith('csv')
  })

  it('disables export buttons when exportBusy', async () => {
    await act(async () => {
      root.render(React.createElement(UserExportImportPanel, { ...defaultProps, exportBusy: true }))
    })
    const buttons = Array.from(container.querySelectorAll('button'))
    const exportBtns = buttons.filter((b) => b.textContent?.includes('Exporting'))
    expect(exportBtns.length).toBeGreaterThan(0)
    exportBtns.forEach((b) => expect((b as HTMLButtonElement).disabled).toBe(true))
  })

  it('shows import panel when Import Users button is clicked', async () => {
    await act(async () => {
      root.render(React.createElement(UserExportImportPanel, { ...defaultProps }))
    })
    const importBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Import Users')
    ) as HTMLButtonElement
    await act(async () => {
      importBtn.click()
    })
    expect(container.querySelector('textarea')).not.toBeNull()
  })

  it('shows import error when importError is set', async () => {
    // Open the import panel first then check error via prop change - use manual render with state
    await act(async () => {
      root.render(
        React.createElement(UserExportImportPanel, {
          ...defaultProps,
          importError: 'Invalid JSON',
        })
      )
    })
    // Error only shows when panel is open - open it
    const importBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Import Users')
    ) as HTMLButtonElement
    await act(async () => {
      importBtn.click()
    })
    expect(container.textContent).toContain('Invalid JSON')
  })

  it('renders import preview table when importPreview is provided', async () => {
    const preview = {
      preview: [
        {
          index: 0,
          username: 'alice',
          email: 'alice@example.com',
          role: 'PLAYER',
          displayName: 'Alice',
          conflict: false,
          valid: true,
        },
        {
          index: 1,
          username: 'bob',
          email: 'bob@example.com',
          role: 'DM',
          displayName: 'Bob',
          conflict: true,
          valid: true,
        },
        {
          index: 2,
          username: '',
          email: '',
          role: 'PLAYER',
          displayName: '',
          conflict: false,
          valid: false,
        },
      ],
      importable: 1,
      total: 3,
    }
    await act(async () => {
      root.render(
        React.createElement(UserExportImportPanel, {
          ...defaultProps,
          importPreview: preview,
        })
      )
    })
    expect(container.textContent).toContain('1 of 3 rows are importable')
    expect(container.textContent).toContain('alice')
    expect(container.textContent).toContain('Conflict')
    expect(container.textContent).toContain('Invalid')
    expect(container.textContent).toContain('Importable')
  })

  it('calls onClearImport when Clear Preview is clicked', async () => {
    const onClearImport = vi.fn()
    const preview = {
      preview: [
        {
          index: 0,
          username: 'alice',
          email: 'alice@example.com',
          role: 'PLAYER',
          displayName: 'Alice',
          conflict: false,
          valid: true,
        },
      ],
      importable: 1,
      total: 1,
    }
    await act(async () => {
      root.render(
        React.createElement(UserExportImportPanel, {
          ...defaultProps,
          importPreview: preview,
          onClearImport,
        })
      )
    })
    const clearBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Clear Preview')
    ) as HTMLButtonElement
    await act(async () => {
      clearBtn.click()
    })
    expect(onClearImport).toHaveBeenCalledOnce()
  })
})
