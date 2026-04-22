import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, Root } from 'react-dom/client'

const requestJsonMock = vi.fn()

vi.mock('../utils/api', () => ({
  requestJson: (...args: unknown[]) => requestJsonMock(...args),
}))

import CampaignManagement from '../pages/CampaignManagement'

const CAMPAIGN_LIST_RESPONSE = {
  campaigns: [
    {
      id: 'campaign-1',
      name: 'Ashfall',
      description: 'Primary campaign',
      isArchived: false,
      inviteCode: 'ASHFALL',
      currentDmId: 'dm-1',
      currentDm: { id: 'dm-1', username: 'DungeonMaster' },
      memberCount: 4,
      sessionCount: 1,
      latestSession: {
        id: 'session-1',
        name: 'Session One',
        state: 'ACTIVE',
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        endedAt: null,
        updatedAt: new Date().toISOString(),
        _count: {
          rooms: 2,
          members: 4,
        },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
  totalPages: 1,
}

const ROOMS_RESPONSE = {
  campaign: { id: 'campaign-1', name: 'Ashfall' },
  session: {
    id: 'session-1',
    name: 'Session One',
    state: 'ACTIVE',
    updatedAt: new Date().toISOString(),
  },
  rooms: [
    {
      id: 'room-1',
      name: 'Main Room',
      type: 'MAIN',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      occupantCount: 3,
    },
    {
      id: 'room-2',
      name: 'War Room',
      type: 'GROUP',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      occupantCount: 1,
    },
  ],
  members: [
    {
      userId: 'member-1',
      username: 'PlayerOne',
      role: 'PLAYER',
      primaryRoomId: 'room-1',
      presenceState: 'ONLINE',
    },
  ],
}

describe('CampaignManagement interactions', () => {
  let container: HTMLDivElement
  let root: Root

  const renderComponent = async () => {
    await act(async () => {
      root.render(React.createElement(CampaignManagement))
    })
  }

  const flush = async () => {
    await act(async () => {
      await Promise.resolve()
    })
  }

  beforeEach(() => {
    requestJsonMock.mockReset()
    requestJsonMock.mockImplementation((path: string) => {
      if (path.startsWith('/campaigns?')) return Promise.resolve(CAMPAIGN_LIST_RESPONSE)
      if (path.includes('/campaigns/campaign-1/rooms')) return Promise.resolve(ROOMS_RESPONSE)
      if (path.includes('/sessions/session-1/end')) return Promise.resolve({ message: 'ok' })
      return Promise.resolve({})
    })

    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))

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
  })

  it('loads campaigns and room detail after selection', async () => {
    await renderComponent()
    await flush()
    await flush()

    expect(container.textContent).toContain('Ashfall')
    expect(container.textContent).toContain('Rooms in session: Session One')
    expect(requestJsonMock).toHaveBeenCalledWith(
      '/campaigns?search=&status=all&page=1&pageSize=20',
      {
        method: 'GET',
      }
    )
  })

  it('changes filter and requests campaign list with updated query', async () => {
    await renderComponent()
    await flush()

    const selects = Array.from(container.querySelectorAll('select'))
    const statusSelect = selects[0] as HTMLSelectElement

    await act(async () => {
      statusSelect.value = 'active'
      statusSelect.dispatchEvent(new Event('change', { bubbles: true }))
    })

    await flush()

    expect(requestJsonMock).toHaveBeenCalledWith(
      '/campaigns?search=&status=active&page=1&pageSize=20',
      { method: 'GET' }
    )
  })

  it('executes end-session success flow and refreshes list', async () => {
    await renderComponent()
    await flush()
    await flush()

    const endButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'End Session'
    ) as HTMLButtonElement

    await act(async () => {
      endButton.click()
    })

    await flush()

    expect(requestJsonMock).toHaveBeenCalledWith('/campaigns/campaign-1/sessions/session-1/end', {
      method: 'POST',
      body: JSON.stringify({ reason: 'Admin operation: ended from Rooms & Campaigns page' }),
    })
  })

  it('renders deterministic error when end-session request fails', async () => {
    requestJsonMock.mockImplementation((path: string) => {
      if (path.startsWith('/campaigns?')) return Promise.resolve(CAMPAIGN_LIST_RESPONSE)
      if (path.includes('/campaigns/campaign-1/rooms')) return Promise.resolve(ROOMS_RESPONSE)
      if (path.includes('/sessions/session-1/end')) return Promise.reject(new Error('end failed'))
      return Promise.resolve({})
    })

    await renderComponent()
    await flush()
    await flush()

    const endButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'End Session'
    ) as HTMLButtonElement

    await act(async () => {
      endButton.click()
    })

    await flush()

    expect(container.textContent).toContain('end failed')
  })
})
