import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { UUID } from '@shared'
import { CampaignSettingsPage } from '../../src/components/session/CampaignSettingsPage'

// Mock the toast hook
vi.mock('../../src/hooks/useToast', () => ({
  useToast: () => vi.fn(),
}))

describe('CampaignSettingsPage', () => {
  it('renders without crashing', () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        campaign: {
          id: 'campaign-1' as UUID,
          name: 'Test Campaign',
          description: 'Test',
          extensionSyncPolicy: 'DM_AND_PLAYERS',
          inviteCode: 'TEST',
          inviteActive: true,
          spectatorInviteCode: null,
          spectatorInviteActive: false,
          postSessionChatEnabled: true,
          postSessionChatDurationMs: 300000,
        },
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <CampaignSettingsPage
        apiUrl="http://localhost:3000"
        token="token"
        campaignId={'campaign-1' as UUID}
      />
    )

    expect(true).toBe(true)
  })

  describe('extension sync policy controls', () => {
    it('renders integration policy controls in form', async () => {
      const fetchMock = vi.fn(async (url: string) => {
        if (url.includes('/campaigns/' + mockCampaignId + '/settings')) {
          return {
            ok: true,
            json: async () => ({
              campaign: {
                id: mockCampaignId,
                name: 'Test Campaign',
                description: 'Test description',
                extensionSyncPolicy: 'DM_AND_PLAYERS',
                inviteCode: 'TEST123',
                inviteActive: true,
                spectatorInviteCode: null,
                spectatorInviteActive: false,
                postSessionChatEnabled: true,
                postSessionChatDurationMs: 300000,
              },
            }),
          }
        }
        return { ok: true, json: async () => ({}) }
      })
      vi.stubGlobal('fetch', fetchMock)

      render(
        <CampaignSettingsPage
          apiUrl={mockApiUrl}
          token={mockToken}
          campaignId={mockCampaignId}
        />
      )

      await waitFor(() => {
        expect(screen.getByText(/integrations/i)).toBeTruthy()
        expect(screen.getByRole('button', { name: 'ALLOW' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'DM_ONLY' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'BLOCK' })).toBeTruthy()
      })
    })

    it('loads DM_AND_PLAYERS policy as ALLOW UI state', async () => {
      const fetchMock = vi.fn(async (url: string) => {
        if (url.includes('/campaigns/' + mockCampaignId + '/settings')) {
          return {
            ok: true,
            json: async () => ({
              campaign: {
                id: mockCampaignId,
                name: 'Test Campaign',
                description: 'Test description',
                extensionSyncPolicy: 'DM_AND_PLAYERS',
                inviteCode: 'TEST123',
                inviteActive: true,
                spectatorInviteCode: null,
                spectatorInviteActive: false,
                postSessionChatEnabled: true,
                postSessionChatDurationMs: 300000,
              },
            }),
          }
        }
        return { ok: true, json: async () => ({}) }
      })
      vi.stubGlobal('fetch', fetchMock)

      render(
        <CampaignSettingsPage
          apiUrl={mockApiUrl}
          token={mockToken}
          campaignId={mockCampaignId}
        />
      )

      await waitFor(() => {
        const allowButton = screen.getByRole('button', { name: 'ALLOW' })
        expect(allowButton.getAttribute('aria-pressed')).toBe('true')
      })
    })

    it('allows changing extension sync policy', async () => {
      const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/campaigns/' + mockCampaignId + '/settings') && init?.method === 'GET') {
          return {
            ok: true,
            json: async () => ({
              campaign: {
                id: mockCampaignId,
                name: 'Test Campaign',
                description: 'Test description',
                extensionSyncPolicy: 'DM_AND_PLAYERS',
                inviteCode: 'TEST123',
                inviteActive: true,
                spectatorInviteCode: null,
                spectatorInviteActive: false,
                postSessionChatEnabled: true,
                postSessionChatDurationMs: 300000,
              },
            }),
          }
        }
        if (url.includes('/campaigns/' + mockCampaignId + '/settings') && init?.method === 'PATCH') {
          return {
            ok: true,
            json: async () => ({
              campaign: {
                id: mockCampaignId,
                name: 'Test Campaign',
                description: 'Test description',
                extensionSyncPolicy: 'DM_ONLY',
                inviteCode: 'TEST123',
                inviteActive: true,
                spectatorInviteCode: null,
                spectatorInviteActive: false,
                postSessionChatEnabled: true,
                postSessionChatDurationMs: 300000,
              },
              message: 'Campaign metadata saved.',
            }),
          }
        }
        return { ok: true, json: async () => ({}) }
      })
      vi.stubGlobal('fetch', fetchMock)

      render(
        <CampaignSettingsPage
          apiUrl={mockApiUrl}
          token={mockToken}
          campaignId={mockCampaignId}
        />
      )

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'DM_ONLY' })).toBeTruthy()
      })

      fireEvent.click(screen.getByRole('button', { name: 'DM_ONLY' }))
      fireEvent.click(screen.getByRole('button', { name: /save/i }))

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/campaigns/' + mockCampaignId + '/settings'),
          expect.objectContaining({ method: 'PATCH' })
        )
      })
    })

    it('displays helper text explaining integration policy options', async () => {
      const fetchMock = vi.fn(async (url: string) => {
        if (url.includes('/campaigns/' + mockCampaignId + '/settings')) {
          return {
            ok: true,
            json: async () => ({
              campaign: {
                id: mockCampaignId,
                name: 'Test Campaign',
                description: 'Test description',
                extensionSyncPolicy: 'DM_AND_PLAYERS',
                inviteCode: 'TEST123',
                inviteActive: true,
                spectatorInviteCode: null,
                spectatorInviteActive: false,
                postSessionChatEnabled: true,
                postSessionChatDurationMs: 300000,
              },
            }),
          }
        }
        return { ok: true, json: async () => ({}) }
      })
      vi.stubGlobal('fetch', fetchMock)

      render(
        <CampaignSettingsPage
          apiUrl={mockApiUrl}
          token={mockToken}
          campaignId={mockCampaignId}
        />
      )

      await waitFor(() => {
        expect(
          screen.getByText(
            /ALLOW permits DM and players to sync updates\. DM_ONLY restricts updates to DM\. BLOCK disables integration-driven updates\./
          )
        ).toBeTruthy()
      })
    })
  })
})

      const fetchMock = vi.fn(async (url: string) => {
        if (url.includes('/campaigns/' + mockCampaignId + '/settings')) {
          return {
            ok: true,
            json: async () => ({
              campaign: {
                id: mockCampaignId,
                name: 'Test Campaign',
                description: 'Test description',
                extensionSyncPolicy: 'DM_AND_PLAYERS',
                inviteCode: 'TEST123',
                inviteActive: true,
                postSessionChatEnabled: true,
                postSessionChatDurationMs: 300000,
              },
            }),
          }
        }
        return { ok: true, json: async () => ({}) }
      })
      vi.stubGlobal('fetch', fetchMock)

      render(
        <CampaignSettingsPage campaignId={mockCampaignId} onDone={vi.fn()} />
      )

      await waitFor(() => {
        expect(screen.getByText(/integrations/i)).toBeTruthy()
        expect(screen.getByRole('button', { name: 'ALLOW' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'DM_ONLY' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'BLOCK' })).toBeTruthy()
      })
    })

    it('loads DM_AND_PLAYERS policy as ALLOW UI state', async () => {
      const fetchMock = vi.fn(async (url: string) => {
        if (url.includes('/campaigns/' + mockCampaignId + '/settings')) {
          return {
            ok: true,
            json: async () => ({
              campaign: {
                id: mockCampaignId,
                name: 'Test Campaign',
                description: 'Test description',
                extensionSyncPolicy: 'DM_AND_PLAYERS',
                inviteCode: 'TEST123',
                inviteActive: true,
                postSessionChatEnabled: true,
                postSessionChatDurationMs: 300000,
              },
            }),
          }
        }
        return { ok: true, json: async () => ({}) }
      })
      vi.stubGlobal('fetch', fetchMock)

      render(
        <CampaignSettingsPage
          apiUrl={mockApiUrl}
          token={mockToken}
          campaignId={mockCampaignId}
        />
      )

      await waitFor(() => {
        const allowButton = screen.getByRole('button', { name: 'ALLOW' })
        expect(allowButton.getAttribute('aria-pressed')).toBe('true')
      })
    })

    it('allows changing policy from ALLOW to DM_ONLY and saves', async () => {
      const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/campaigns/' + mockCampaignId + '/settings') && init?.method === 'GET') {
          return {
            ok: true,
            json: async () => ({
              campaign: {
                id: mockCampaignId,
                name: 'Test Campaign',
                description: 'Test description',
                extensionSyncPolicy: 'DM_AND_PLAYERS',
                inviteCode: 'TEST123',
                inviteActive: true,
                postSessionChatEnabled: true,
                postSessionChatDurationMs: 300000,
              },
            }),
          }
        }
        if (url.includes('/campaigns/' + mockCampaignId + '/settings') && init?.method === 'PATCH') {
          return {
            ok: true,
            json: async () => ({
              campaign: {
                id: mockCampaignId,
                name: 'Test Campaign',
                description: 'Test description',
                extensionSyncPolicy: 'DM_ONLY',
                inviteCode: 'TEST123',
                inviteActive: true,
                postSessionChatEnabled: true,
                postSessionChatDurationMs: 300000,
              },
              message: 'Campaign metadata saved.',
            }),
          }
        }
        return { ok: true, json: async () => ({}) }
      })
      vi.stubGlobal('fetch', fetchMock)

      render(
        <CampaignSettingsPage
          apiUrl={mockApiUrl}
          token={mockToken}
          campaignId={mockCampaignId}
        />
      )

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'DM_ONLY' })).toBeTruthy()
      })

      fireEvent.click(screen.getByRole('button', { name: 'DM_ONLY' }))

      const saveButton = screen.getByRole('button', { name: /save/i })
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/campaigns/' + mockCampaignId + '/settings'),
          expect.objectContaining({
            method: 'PATCH',
            body: expect.stringContaining('"extensionSyncPolicy":"DM_ONLY"'),
          })
        )
      })
    })

    it('allows changing policy to BLOCK and saves', async () => {
      const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/campaigns/' + mockCampaignId + '/settings') && init?.method === 'GET') {
          return {
            ok: true,
            json: async () => ({
              campaign: {
                id: mockCampaignId,
                name: 'Test Campaign',
                description: 'Test description',
                extensionSyncPolicy: 'DM_AND_PLAYERS',
                inviteCode: 'TEST123',
                inviteActive: true,
                postSessionChatEnabled: true,
                postSessionChatDurationMs: 300000,
              },
            }),
          }
        }
        if (url.includes('/campaigns/' + mockCampaignId + '/settings') && init?.method === 'PATCH') {
          return {
            ok: true,
            json: async () => ({
              campaign: {
                id: mockCampaignId,
                name: 'Test Campaign',
                description: 'Test description',
                extensionSyncPolicy: 'NONE',
                inviteCode: 'TEST123',
                inviteActive: true,
                postSessionChatEnabled: true,
                postSessionChatDurationMs: 300000,
              },
              message: 'Campaign metadata saved.',
            }),
          }
        }
        return { ok: true, json: async () => ({}) }
      })
      vi.stubGlobal('fetch', fetchMock)

      render(
        <CampaignSettingsPage
          apiUrl={mockApiUrl}
          token={mockToken}
          campaignId={mockCampaignId}
        />
      )

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'BLOCK' })).toBeTruthy()
      })

      fireEvent.click(screen.getByRole('button', { name: 'BLOCK' }))

      const saveButton = screen.getByRole('button', { name: /save/i })
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/campaigns/' + mockCampaignId + '/settings'),
          expect.objectContaining({
            method: 'PATCH',
            body: expect.stringContaining('"extensionSyncPolicy":"NONE"'),
          })
        )
      })
    })

    it('displays helper text explaining integration policy options', async () => {
      const fetchMock = vi.fn(async (url: string) => {
        if (url.includes('/campaigns/' + mockCampaignId + '/settings')) {
          return {
            ok: true,
            json: async () => ({
              campaign: {
                id: mockCampaignId,
                name: 'Test Campaign',
                description: 'Test description',
                extensionSyncPolicy: 'DM_AND_PLAYERS',
                inviteCode: 'TEST123',
                inviteActive: true,
                postSessionChatEnabled: true,
                postSessionChatDurationMs: 300000,
              },
            }),
          }
        }
        return { ok: true, json: async () => ({}) }
        <CampaignSettingsPage
          apiUrl={mockApiUrl}
          token={mockToken}
          campaignId={mockCampaignId}
        />
      vi.stubGlobal('fetch', fetchMock)

      render(
        <CampaignSettingsPage campaignId={mockCampaignId} onDone={vi.fn()} />
      )

      await waitFor(() => {
        expect(
          screen.getByText(
            /ALLOW permits DM and players to sync updates\. DM_ONLY restricts updates to DM\. BLOCK disables integration-driven updates\./
          )
        ).toBeTruthy()
      })
    })
  })

  describe('save functionality', () => {
    it('includes extension policy in save payload', async () => {
      const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/campaigns/' + mockCampaignId + '/settings') && init?.method === 'GET') {
          return {
            ok: true,
            json: async () => ({
              campaign: {
                id: mockCampaignId,
                name: 'Test Campaign',
                description: 'Test description',
                extensionSyncPolicy: 'DM_ONLY',
                inviteCode: 'TEST123',
                inviteActive: true,
                postSessionChatEnabled: true,
                postSessionChatDurationMs: 300000,
              },
            }),
          }
        }
        if (url.includes('/campaigns/' + mockCampaignId + '/settings') && init?.method === 'PATCH') {
          const bodyObj = JSON.parse(init.body as string)
          expect(bodyObj).toHaveProperty('extensionSyncPolicy')
          return {
            ok: true,
            json: async () => ({
              campaign: {
                id: mockCampaignId,
                name: 'Test Campaign',
                description: 'Test description',
                extensionSyncPolicy: bodyObj.extensionSyncPolicy,
                inviteCode: 'TEST123',
                inviteActive: true,
                postSessionChatEnabled: true,
                postSessionChatDurationMs: 300000,
              },
              message: 'Campaign metadata saved.',
            }),
          }
        }
        return { ok: true, json: async () => ({}) }
      })
          apiUrl={mockApiUrl}
          token={mockToken}
          campaignId={mockCampaignId}

      vi.stubGlobal('fetch', fetchMock)

      render(
        <CampaignSettingsPage campaignId={mockCampaignId} onDone={vi.fn()} />
      )

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'ALLOW' })).toBeTruthy()
      })

      fireEvent.click(screen.getByRole('button', { name: 'ALLOW' }))

      const saveButton = screen.getByRole('button', { name: /save/i })
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(screen.getByText(/Campaign metadata saved\./)).toBeTruthy()
      })
    })
  })
})
