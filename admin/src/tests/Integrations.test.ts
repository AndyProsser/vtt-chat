import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, Root } from 'react-dom/client'

const requestJsonMock = vi.fn()

vi.mock('../utils/api', () => ({
  requestJson: (...args: unknown[]) => requestJsonMock(...args),
}))

import Integrations from '../pages/Integrations'

const BASE_SYSTEMS_RESPONSE = {
  systems: [
    {
      system: 'dndbeyond',
      displayName: 'D&D Beyond',
      authCapable: true,
      logIngestionCapable: true,
      metadataSyncCapable: true,
      authorizationState: 'BLOCKED',
      allowedScopes: [],
      notes: '',
      lastUpdatedAt: new Date().toISOString(),
      metrics: {
        linkedUsers: 0,
        requests24h: 0,
        lastSeenAt: null,
      },
    },
  ],
}

describe('Integrations page interactions', () => {
  let container: HTMLDivElement
  let root: Root

  const renderComponent = async () => {
    await act(async () => {
      root.render(React.createElement(Integrations))
    })
  }

  const flush = async () => {
    await act(async () => {
      await Promise.resolve()
    })
  }

  beforeEach(() => {
    requestJsonMock.mockReset()
    requestJsonMock.mockImplementation((path: string, init?: { method?: string }) => {
      if (path === '/integrations/systems' && init?.method === 'GET') {
        return Promise.resolve(BASE_SYSTEMS_RESPONSE)
      }
      if (path.endsWith('/authorize')) {
        return Promise.resolve({ message: 'External system authorized' })
      }
      if (path.endsWith('/block')) {
        return Promise.resolve({ message: 'External system blocked' })
      }
      if (path === '/integrations/systems/dndbeyond' && init?.method === 'PATCH') {
        return Promise.resolve({ message: 'External system updated' })
      }
      return Promise.resolve({})
    })

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

  it('loads integration systems on mount', async () => {
    await renderComponent()
    await flush()

    expect(requestJsonMock).toHaveBeenCalledWith('/integrations/systems', { method: 'GET' })
    expect(container.textContent).toContain('D&D Beyond')
  })

  it('authorizes a system', async () => {
    await renderComponent()
    await flush()

    const authorizeButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Authorize'
    ) as HTMLButtonElement

    await act(async () => {
      authorizeButton.click()
    })

    await flush()

    expect(requestJsonMock).toHaveBeenCalledWith('/integrations/systems/dndbeyond/authorize', {
      method: 'POST',
    })
  })

  it('blocks a system', async () => {
    await renderComponent()
    await flush()

    const blockButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Block'
    ) as HTMLButtonElement

    await act(async () => {
      blockButton.click()
    })

    await flush()

    expect(requestJsonMock).toHaveBeenCalledWith('/integrations/systems/dndbeyond/block', {
      method: 'POST',
    })
  })

  it('switches a system to log-only mode', async () => {
    await renderComponent()
    await flush()

    const logOnlyButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Log Only'
    ) as HTMLButtonElement

    await act(async () => {
      logOnlyButton.click()
    })

    await flush()

    expect(requestJsonMock).toHaveBeenCalledWith(
      '/integrations/systems/dndbeyond',
      expect.objectContaining({ method: 'PATCH' })
    )
  })
})
