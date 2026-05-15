import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UUID } from '@shared'
import { CampaignSettingsPage } from '../../src/components/session/CampaignSettingsPage'

vi.mock('../../src/hooks/useToast', () => ({
  useToast: () => vi.fn(),
}))

const API_URL = 'http://localhost:3000'
const TOKEN = 'test-token'
const CAMPAIGN_ID = 'campaign-1' as UUID

function makeCampaign(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: CAMPAIGN_ID,
    name: 'Test Campaign',
    description: 'Test description',
    extensionSyncPolicy: 'DM_AND_PLAYERS',
    inviteCode: 'TEST123',
    inviteActive: true,
    spectatorInviteCode: null,
    spectatorInviteActive: false,
    postSessionChatEnabled: true,
    postSessionChatDurationMs: 300000,
    ...overrides,
  }
}

function makeGetFetch(campaignOverrides: Partial<Record<string, unknown>> = {}) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    if (!init?.method || init.method === 'GET') {
      return { ok: true, json: async () => ({ campaign: makeCampaign(campaignOverrides) }) }
    }
    return { ok: true, json: async () => ({}) }
  })
}

function renderPage() {
  return render(<CampaignSettingsPage apiUrl={API_URL} token={TOKEN} campaignId={CAMPAIGN_ID} />)
}

describe('CampaignSettingsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  describe('extension sync policy controls', () => {
    it('renders ALLOW, DM_ONLY and BLOCK buttons', async () => {
      vi.stubGlobal('fetch', makeGetFetch())
      renderPage()
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'ALLOW' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'DM_ONLY' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'BLOCK' })).toBeTruthy()
      })
    })

    it('renders Integrations heading', async () => {
      vi.stubGlobal('fetch', makeGetFetch())
      renderPage()
      await waitFor(() => {
        expect(screen.getByText(/integrations/i)).toBeTruthy()
      })
    })

    it('maps DM_AND_PLAYERS to ALLOW aria-pressed', async () => {
      vi.stubGlobal('fetch', makeGetFetch({ extensionSyncPolicy: 'DM_AND_PLAYERS' }))
      renderPage()
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'ALLOW' }).getAttribute('aria-pressed')).toBe(
          'true'
        )
        expect(screen.getByRole('button', { name: 'DM_ONLY' }).getAttribute('aria-pressed')).toBe(
          'false'
        )
        expect(screen.getByRole('button', { name: 'BLOCK' }).getAttribute('aria-pressed')).toBe(
          'false'
        )
      })
    })

    it('maps DM_ONLY to DM_ONLY aria-pressed', async () => {
      vi.stubGlobal('fetch', makeGetFetch({ extensionSyncPolicy: 'DM_ONLY' }))
      renderPage()
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'DM_ONLY' }).getAttribute('aria-pressed')).toBe(
          'true'
        )
      })
    })

    it('maps NONE to BLOCK aria-pressed', async () => {
      vi.stubGlobal('fetch', makeGetFetch({ extensionSyncPolicy: 'NONE' }))
      renderPage()
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'BLOCK' }).getAttribute('aria-pressed')).toBe(
          'true'
        )
      })
    })

    it('displays helper text for integration policy options', async () => {
      vi.stubGlobal('fetch', makeGetFetch())
      renderPage()
      await waitFor(() => {
        expect(
          screen.getByText(
            /ALLOW permits DM and players to sync updates\. DM_ONLY restricts updates to DM\. BLOCK disables integration-driven updates\./
          )
        ).toBeTruthy()
      })
    })
  })

  describe('saving', () => {
    it('sends DM_ONLY in PATCH body when DM_ONLY is selected', async () => {
      const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
        if (!init?.method || init.method === 'GET') {
          return { ok: true, json: async () => ({ campaign: makeCampaign() }) }
        }
        return {
          ok: true,
          json: async () => ({
            campaign: makeCampaign({ extensionSyncPolicy: 'DM_ONLY' }),
            message: 'Campaign metadata saved.',
          }),
        }
      })
      vi.stubGlobal('fetch', fetchMock)
      renderPage()

      await waitFor(() => expect(screen.getByRole('button', { name: 'DM_ONLY' })).toBeTruthy())
      fireEvent.click(screen.getByRole('button', { name: 'DM_ONLY' }))
      fireEvent.click(screen.getByRole('button', { name: /save/i }))

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining(`/campaigns/${CAMPAIGN_ID}/settings`),
          expect.objectContaining({
            method: 'PATCH',
            body: expect.stringContaining('"extensionSyncPolicy":"DM_ONLY"'),
          })
        )
      )
    })

    it('sends NONE in PATCH body when BLOCK is selected', async () => {
      const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
        if (!init?.method || init.method === 'GET') {
          return { ok: true, json: async () => ({ campaign: makeCampaign() }) }
        }
        return {
          ok: true,
          json: async () => ({
            campaign: makeCampaign({ extensionSyncPolicy: 'NONE' }),
            message: 'Campaign metadata saved.',
          }),
        }
      })
      vi.stubGlobal('fetch', fetchMock)
      renderPage()

      await waitFor(() => expect(screen.getByRole('button', { name: 'BLOCK' })).toBeTruthy())
      fireEvent.click(screen.getByRole('button', { name: 'BLOCK' }))
      fireEvent.click(screen.getByRole('button', { name: /save/i }))

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining(`/campaigns/${CAMPAIGN_ID}/settings`),
          expect.objectContaining({
            method: 'PATCH',
            body: expect.stringContaining('"extensionSyncPolicy":"NONE"'),
          })
        )
      )
    })

    it('PATCH payload always includes extensionSyncPolicy field', async () => {
      const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
        if (!init?.method || init.method === 'GET') {
          return {
            ok: true,
            json: async () => ({ campaign: makeCampaign({ extensionSyncPolicy: 'DM_ONLY' }) }),
          }
        }
        const body = JSON.parse(init.body as string)
        expect(body).toHaveProperty('extensionSyncPolicy')
        return {
          ok: true,
          json: async () => ({
            campaign: makeCampaign({ extensionSyncPolicy: body.extensionSyncPolicy }),
            message: 'Campaign metadata saved.',
          }),
        }
      })
      vi.stubGlobal('fetch', fetchMock)
      renderPage()

      await waitFor(() => expect(screen.getByRole('button', { name: /save/i })).toBeTruthy())
      fireEvent.click(screen.getByRole('button', { name: /save/i }))

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining(`/campaigns/${CAMPAIGN_ID}/settings`),
          expect.objectContaining({ method: 'PATCH' })
        )
      )
    })
  })
})
