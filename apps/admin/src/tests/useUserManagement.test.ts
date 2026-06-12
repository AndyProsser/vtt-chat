import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, Root } from 'react-dom/client'

const requestJsonMock = vi.fn()

vi.mock('../utils/api', () => ({
  requestJson: (...args: unknown[]) => requestJsonMock(...args),
}))

import { useUserManagement } from '../features/users/useUserManagement'

function HookHarness({
  onRender,
}: {
  onRender: (state: ReturnType<typeof useUserManagement>) => void
}) {
  const state = useUserManagement()
  onRender(state)
  return null
}

describe('useUserManagement', () => {
  let container: HTMLDivElement
  let root: Root
  let state: ReturnType<typeof useUserManagement> | null

  const flush = async () => {
    await act(async () => {
      await Promise.resolve()
    })
  }

  const renderHook = async () => {
    await act(async () => {
      root.render(
        React.createElement(HookHarness, {
          onRender: (next) => {
            state = next
          },
        })
      )
    })
  }

  beforeEach(() => {
    state = null
    requestJsonMock.mockReset()
    requestJsonMock.mockImplementation((path: string) => {
      if (path.startsWith('/users?')) {
        return Promise.resolve({
          users: [{ id: 'u-1', username: 'alice', displayName: 'Alice', role: 'PLAYER' }],
          total: 1,
          totalPages: 1,
        })
      }
      return Promise.resolve({})
    })

    vi.stubGlobal('fetch', vi.fn())
    vi.stubGlobal('prompt', vi.fn())

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('loads users on mount successfully', async () => {
    await renderHook()
    await flush()

    expect(state).not.toBeNull()
    expect(state!.loading).toBe(false)
    expect(state!.rows.length).toBe(1)
    expect(state!.total).toBe(1)
    expect(state!.error).toBeNull()
  })

  it('sets fallback load error when request rejects with non-Error', async () => {
    requestJsonMock.mockRejectedValueOnce('request failed')

    await renderHook()
    await flush()

    expect(state!.loading).toBe(false)
    expect(state!.error).toBe('Failed to load users')
  })

  it('returns early in runAction when prompt is cancelled', async () => {
    await renderHook()
    await flush()
    requestJsonMock.mockClear()
    ;(window.prompt as any).mockReturnValueOnce(null)

    await act(async () => {
      await state!.runAction('u-1', 'PATCH', '/users/u-1/suspend', 'default reason')
    })

    expect(requestJsonMock).not.toHaveBeenCalled()
    expect(state!.actionBusyUserId).toBeNull()
  })

  it('sets fallback runAction error for non-Error rejection', async () => {
    await renderHook()
    await flush()

    requestJsonMock.mockClear()
    ;(window.prompt as any).mockReturnValueOnce('manual reason')
    requestJsonMock.mockRejectedValueOnce('nope')

    await act(async () => {
      await state!.runAction('u-1', 'PATCH', '/users/u-1/suspend', 'default reason')
    })

    expect(state!.error).toBe('Moderation action failed')
    expect(state!.actionBusyUserId).toBeNull()
  })

  it('creates invite with trimmed optional email omitted when blank', async () => {
    await renderHook()
    await flush()

    requestJsonMock.mockClear()
    requestJsonMock.mockResolvedValueOnce({ inviteUrl: 'https://example.test/invite' })

    await act(async () => {
      state!.setInviteEmail('   ')
      state!.setInviteRole('READ_ONLY')
    })

    await act(async () => {
      await state!.createInvite()
    })

    const [path, options] = requestJsonMock.mock.calls[0]
    expect(path).toBe('/invites')
    const body = JSON.parse(options.body)
    expect(body.adminRole).toBe('READ_ONLY')
    expect('email' in body).toBe(false)
    expect(state!.inviteUrl).toBe('https://example.test/invite')
  })

  it('sets fallback createInvite error for non-Error rejection', async () => {
    await renderHook()
    await flush()

    requestJsonMock.mockClear()
    requestJsonMock.mockRejectedValueOnce('invite-fail')

    await act(async () => {
      await state!.createInvite()
    })

    expect(state!.error).toBe('Failed to create invite')
    expect(state!.creatingInvite).toBe(false)
  })

  it('handles export error when backend returns non-ok and invalid JSON body', async () => {
    const fetchMock = globalThis.fetch as any
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('invalid json')
      },
    })

    await renderHook()
    await flush()

    await act(async () => {
      await state!.exportUsers('csv')
    })

    expect(state!.error).toBe('Export failed (500)')
    expect(state!.exportBusy).toBe(false)
  })

  it('exports users successfully and revokes object URL', async () => {
    const createObjectURL = vi.fn(() => 'blob:users-export')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true })
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const fetchMock = globalThis.fetch as any
    fetchMock.mockResolvedValueOnce({
      ok: true,
      blob: async () => new Blob(['x'], { type: 'application/json' }),
    })

    await renderHook()
    await flush()

    await act(async () => {
      await state!.exportUsers('json')
    })

    expect(createObjectURL).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:users-export')
    expect(clickSpy).toHaveBeenCalled()
    clickSpy.mockRestore()
  })

  it('sets validation error on previewImport invalid JSON', async () => {
    await renderHook()
    await flush()

    await act(async () => {
      await state!.previewImport('{bad-json')
    })

    expect(state!.importError).toBe('Invalid JSON — paste a valid users array or export file')
    expect(state!.importBusy).toBe(false)
  })

  it('parses nested users payload and stores import preview result', async () => {
    await renderHook()
    await flush()

    requestJsonMock.mockClear()
    requestJsonMock.mockResolvedValueOnce({
      preview: [
        {
          index: 0,
          username: 'bob',
          email: 'b@x.com',
          role: 'PLAYER',
          conflict: false,
          valid: true,
        },
      ],
      importable: 1,
      total: 1,
    })

    await act(async () => {
      await state!.previewImport('{"users":[{"username":"bob"}]}')
    })

    expect(requestJsonMock).toHaveBeenCalledWith(
      '/users/import/preview',
      expect.objectContaining({ method: 'POST' })
    )
    expect(state!.importPreview?.importable).toBe(1)
    expect(state!.importError).toBeNull()
  })

  it('sets fallback preview error for non-Error rejection and clearImportPreview resets state', async () => {
    await renderHook()
    await flush()

    requestJsonMock.mockClear()
    requestJsonMock.mockRejectedValueOnce('preview-fail')

    await act(async () => {
      await state!.previewImport('[]')
    })

    expect(state!.importError).toBe('Preview failed')

    await act(async () => {
      state!.clearImportPreview()
    })

    expect(state!.importPreview).toBeNull()
    expect(state!.importError).toBeNull()
  })
})
