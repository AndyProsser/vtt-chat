import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowseCampaignsPage } from '../../components/auth/BrowseCampaignsPage'
import { InviteJoinPage } from '../../components/auth/InviteJoinPage'
import { SpectatorInvitePage } from '../../components/auth/SpectatorInvitePage'

describe('guest auth route surfaces', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('handles /join preflight then extension guest-login handoff', async () => {
    const onAuthenticated = vi.fn()

    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method || 'GET'

      if (url.includes('/api/campaigns/invite/ABC123/validate') && method === 'GET') {
        return {
          ok: true,
          json: async () => ({
            valid: true,
            type: 'player',
            campaign: {
              id: 'campaign-1',
              name: 'Lost Mines',
              dmDisplayName: 'Mira',
            },
            platformStatus: {
              online: true,
              version: '0.5.3',
              activeUsers: 10,
              activeCampaigns: 2,
              activeSessions: 1,
            },
          }),
        }
      }

      if (url.includes('/api/auth/extension/preflight') && method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            accountStatus: 'none',
            suggestedFlow: 'guest',
          }),
        }
      }

      if (url.includes('/api/auth/extension/guest-login') && method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            token: 'guest-token',
            user: {
              id: 'user-1',
              role: 'PLAYER',
              authType: 'GUEST',
              displayName: 'Aria Player',
            },
          }),
        }
      }

      throw new Error(`Unexpected fetch call: ${method} ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <InviteJoinPage
        apiUrl="http://localhost:3000"
        inviteCode="ABC123"
        authToken={null}
        onAuthenticated={onAuthenticated}
      />
    )

    await screen.findByText('Player Invite')

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'aria@example.com' },
    })
    fireEvent.change(screen.getByLabelText('External System'), {
      target: { value: 'dndbeyond' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Run preflight' }))

    await screen.findByText(/suggestedFlow:/)
    fireEvent.change(screen.getByLabelText('External User ID'), {
      target: { value: 'ddb-user-1' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Continue with Extension Guest Login' }))

    await waitFor(() => {
      expect(onAuthenticated).toHaveBeenCalledWith('guest-token', {
        id: 'user-1',
        username: 'Aria Player',
        role: 'PLAYER',
      })
    })
  })

  it('sends campaignPacket fields during extension guest-login', async () => {
    const onAuthenticated = vi.fn()

    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method || 'GET'

      if (url.includes('/api/campaigns/invite/BOOT123/validate') && method === 'GET') {
        return {
          ok: true,
          json: async () => ({
            valid: true,
            type: 'player',
            campaign: {
              id: 'campaign-boot',
              name: 'Boot Campaign',
              dmDisplayName: 'Mira',
            },
            platformStatus: {
              online: true,
              version: '0.5.3',
              activeUsers: 10,
              activeCampaigns: 2,
              activeSessions: 1,
            },
          }),
        }
      }

      if (url.includes('/api/auth/extension/preflight') && method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            accountStatus: 'none',
            suggestedFlow: 'guest',
          }),
        }
      }

      if (url.includes('/api/auth/extension/guest-login') && method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            token: 'guest-token',
            user: {
              id: 'user-boot',
              role: 'PLAYER',
              authType: 'GUEST',
              displayName: 'Boot User',
            },
          }),
        }
      }

      throw new Error(`Unexpected fetch call: ${method} ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <InviteJoinPage
        apiUrl="http://localhost:3000"
        inviteCode="BOOT123"
        authToken={null}
        onAuthenticated={onAuthenticated}
      />
    )

    await screen.findByText('Player Invite')

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'boot@example.com' },
    })
    fireEvent.change(screen.getByLabelText('External System'), {
      target: { value: 'dndbeyond' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Run preflight' }))
    await screen.findByText(/suggestedFlow:/)

    fireEvent.change(screen.getByLabelText('External User ID'), {
      target: { value: 'ddb-user-boot' },
    })
    fireEvent.change(screen.getByLabelText('External Campaign ID (optional)'), {
      target: { value: 'ddb-campaign-boot' },
    })
    fireEvent.change(screen.getByLabelText('DM External User ID (optional)'), {
      target: { value: 'ddb-dm-boot' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Continue with Extension Guest Login' }))

    await waitFor(() => {
      expect(onAuthenticated).toHaveBeenCalledWith('guest-token', {
        id: 'user-boot',
        username: 'Boot User',
        role: 'PLAYER',
      })
    })

    const guestLoginCall = fetchMock.mock.calls.find(([input, init]) => {
      return (
        String(input).includes('/api/auth/extension/guest-login') &&
        (init?.method || 'GET') === 'POST'
      )
    })
    expect(guestLoginCall).toBeTruthy()
    const payload = JSON.parse(String(guestLoginCall?.[1]?.body || '{}'))
    expect(payload.campaignPacket).toEqual({
      externalCampaignId: 'ddb-campaign-boot',
      dmExternalUserId: 'ddb-dm-boot',
    })
  })

  it('handles /watch guest spectator direct join path', async () => {
    const onAuthenticated = vi.fn()

    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method || 'GET'

      if (url.includes('/api/campaigns/watch/WATCH99/validate') && method === 'GET') {
        return {
          ok: true,
          json: async () => ({
            valid: true,
            type: 'spectator',
            campaign: {
              id: 'campaign-2',
              name: 'Deep Vault',
              dmDisplayName: 'Kara',
              sessionActive: true,
              spectatorSlotsFilled: 1,
              spectatorSlotsMax: 4,
              spectatorWaitlistEnabled: true,
              spectatorPolicy: 'GUESTS',
            },
            characters: [
              { name: 'Borin', class: 'Fighter', level: 4, avatarUrl: null, online: true },
            ],
          }),
        }
      }

      if (url.includes('/api/auth/spectator/guest-join') && method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            joined: true,
            token: 'spectator-token',
            user: {
              id: 'spectator-1',
              username: 'spectator-one',
              role: 'SPECTATOR',
              authType: 'GUEST',
            },
            campaignId: 'campaign-2',
          }),
        }
      }

      throw new Error(`Unexpected fetch call: ${method} ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <SpectatorInvitePage
        apiUrl="http://localhost:3000"
        inviteCode="WATCH99"
        onAuthenticated={onAuthenticated}
      />
    )

    await screen.findByText('Spectator Invite')

    fireEvent.change(screen.getByLabelText('Display Name'), {
      target: { value: 'Guest Watcher' },
    })
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'watcher@example.com' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Join Spectator Session' }))

    await waitFor(() => {
      expect(onAuthenticated).toHaveBeenCalledWith('spectator-token', {
        id: 'spectator-1',
        username: 'spectator-one',
        role: 'SPECTATOR',
      })
    })
  })

  it('handles /watch waitlist polling promotion path with fake timers', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const onAuthenticated = vi.fn()
      let waitlistPollCount = 0

      const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method || 'GET'

        if (url.includes('/api/campaigns/watch/WAITLIST42/validate') && method === 'GET') {
          return {
            ok: true,
            json: async () => ({
              valid: true,
              type: 'spectator',
              campaign: {
                id: 'campaign-7',
                name: 'Sky Citadel',
                dmDisplayName: 'Aster',
                sessionActive: true,
                spectatorSlotsFilled: 2,
                spectatorSlotsMax: 2,
                spectatorWaitlistEnabled: true,
                spectatorPolicy: 'GUESTS',
              },
              characters: [],
            }),
          }
        }

        if (url.includes('/api/auth/spectator/guest-join') && method === 'POST') {
          return {
            ok: true,
            json: async () => ({
              joined: false,
              waitlist: {
                enabled: true,
                waitlistToken: 'wait-abc',
                position: 3,
              },
              campaignId: 'campaign-7',
            }),
          }
        }

        if (
          url.includes('/api/campaigns/campaign-7/spectator/waitlist-status') &&
          method === 'GET'
        ) {
          waitlistPollCount += 1
          if (waitlistPollCount === 1) {
            return {
              ok: true,
              json: async () => ({
                status: 'WAITLISTED',
                position: 2,
              }),
            }
          }

          return {
            ok: true,
            json: async () => ({
              status: 'PROMOTED',
              token: 'promoted-token',
              user: {
                id: 'spectator-promoted',
                username: 'waitlisted-user',
                role: 'SPECTATOR',
              },
            }),
          }
        }

        throw new Error(`Unexpected fetch call: ${method} ${url}`)
      })

      vi.stubGlobal('fetch', fetchMock)

      render(
        <SpectatorInvitePage
          apiUrl="http://localhost:3000"
          inviteCode="WAITLIST42"
          onAuthenticated={onAuthenticated}
        />
      )

      await screen.findByText('Spectator Invite')

      fireEvent.change(screen.getByLabelText('Display Name'), {
        target: { value: 'Waitlist User' },
      })
      fireEvent.change(screen.getByLabelText('Email'), {
        target: { value: 'waitlist@example.com' },
      })

      fireEvent.click(screen.getByRole('button', { name: 'Join Spectator Session' }))

      await screen.findByText(/You are on the waitlist\./)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(7000)
      })
      await screen.findByText(/Current position: 2\./)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(7000)
      })
      await waitFor(() => {
        expect(onAuthenticated).toHaveBeenCalledWith('promoted-token', {
          id: 'spectator-promoted',
          username: 'waitlisted-user',
          role: 'SPECTATOR',
        })
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('handles /browse with discoverable vs private campaigns', async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method || 'GET'

      if (url.includes('/api/campaigns/browse') && method === 'GET') {
        return {
          ok: true,
          json: async () => ({
            campaigns: [
              {
                campaignId: 'c1',
                name: 'Open Keep',
                dmDisplayName: 'Mira',
                sessionActive: true,
                spectatorPolicy: 'GUESTS',
                private: false,
                spectatorSlotsFilled: 1,
                spectatorSlotsMax: 5,
                joinEnabled: true,
              },
              {
                campaignId: 'c2',
                name: 'Hidden Court',
                dmDisplayName: 'Jules',
                sessionActive: false,
                spectatorPolicy: 'NONE',
                private: true,
                spectatorSlotsFilled: 0,
                spectatorSlotsMax: 3,
                joinEnabled: false,
              },
            ],
          }),
        }
      }

      throw new Error(`Unexpected fetch call: ${method} ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    render(<BrowseCampaignsPage apiUrl="http://localhost:3000" authToken="full-token" />)

    await screen.findByText('Open Keep')
    expect(screen.getByText('Hidden Court')).toBeTruthy()
    expect(screen.getByText('Discoverable campaign')).toBeTruthy()
    expect(screen.getByText('Private campaign')).toBeTruthy()

    const buttons = screen.getAllByRole('button')
    expect(buttons[0]).toHaveProperty('disabled', false)
    expect(buttons[1]).toHaveProperty('disabled', true)
  })

  it('shows browse access errors for guest-restricted responses', async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method || 'GET'

      if (url.includes('/api/campaigns/browse') && method === 'GET') {
        return {
          ok: false,
          json: async () => ({
            code: 'FULL_ACCOUNT_REQUIRED',
            message: 'Only full accounts may browse spectator campaigns',
          }),
        }
      }

      throw new Error(`Unexpected fetch call: ${method} ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    render(<BrowseCampaignsPage apiUrl="http://localhost:3000" authToken="guest-token" />)

    await screen.findByText('Only full accounts may browse spectator campaigns')
  })
})
