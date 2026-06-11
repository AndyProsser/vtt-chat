import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { UUID } from '@shared'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '../../src/components/ui'
import { LobbyJoinRequestsPanel } from '../../src/components/workspaces/lobby/LobbyJoinRequestsPanel'

const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111' as UUID
const REQUEST_ID = '22222222-2222-4222-8222-222222222222' as UUID

describe('LobbyJoinRequestsPanel', () => {
  function renderPanel(props: React.ComponentProps<typeof LobbyJoinRequestsPanel>) {
    return render(
      <TooltipProvider delayDuration={0}>
        <LobbyJoinRequestsPanel {...props} />
      </TooltipProvider>
    )
  }

  it('loads pending requests when opened and resolves approvals inline', async () => {
    const onLoadPendingJoinRequests = vi.fn().mockResolvedValue([
      {
        id: REQUEST_ID,
        userId: '33333333-3333-4333-8333-333333333333' as UUID,
        username: 'ari',
        displayName: 'Ari',
        avatarUrl: null,
        message: 'Would love to join the table.',
        requestedAt: '2026-05-30T10:00:00.000Z',
      },
    ])
    const onResolveJoinRequest = vi.fn().mockResolvedValue(undefined)
    const onError = vi.fn()

    renderPanel({
      campaignId: CAMPAIGN_ID,
      pendingCount: 1,
      onLoadPendingJoinRequests,
      onResolveJoinRequest,
      onError,
    })

    fireEvent.click(screen.getByRole('button', { name: /1 pending join requests/i }))

    expect(await screen.findByText('Pending join requests')).toBeTruthy()
    expect(await screen.findByText('Ari')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /approve/i }))

    await waitFor(() => {
      expect(onResolveJoinRequest).toHaveBeenCalledWith(CAMPAIGN_ID, REQUEST_ID, 'APPROVED')
    })

    await waitFor(() => {
      expect(screen.queryByText('Ari')).toBeNull()
    })
    expect(onError).not.toHaveBeenCalled()
  })

  it('surfaces load failures through the provided error callback', async () => {
    const onError = vi.fn()

    renderPanel({
      campaignId: CAMPAIGN_ID,
      pendingCount: 1,
      onLoadPendingJoinRequests: vi.fn().mockRejectedValue(new Error('Load failed')),
      onResolveJoinRequest: vi.fn(),
      onError,
    })

    fireEvent.click(screen.getByRole('button', { name: /1 pending join requests/i }))

    expect(await screen.findByText('Load failed')).toBeTruthy()
    expect(onError).toHaveBeenCalledWith('Load failed')
  })
})
