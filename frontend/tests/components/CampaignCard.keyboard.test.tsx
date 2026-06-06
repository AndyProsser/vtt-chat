import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CampaignSummary } from '@/types/session/campaign'
import { CampaignCard } from '@/components/workspaces/lobby/LobbyView.CampaignCard'
import { TooltipProvider } from '@/components/ui'

function buildCampaign(overrides: Partial<CampaignSummary> = {}): CampaignSummary {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'The Emerald Crown',
    description: 'A campaign description',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    discoverable: true,
    memberRole: 'DM',
    isMember: true,
    dmDisplayName: 'Andy',
    dmOnline: true,
    connectedPlayers: 3,
    connectedSpectatorsRounded: 0,
    latestSessionState: 'IDLE',
    ...overrides,
  }
}

function renderCard(overrides: Partial<CampaignSummary> = {}) {
  const onSelectCampaign = vi.fn()

  render(
    <TooltipProvider>
      <CampaignCard
        campaign={buildCampaign(overrides)}
        isSelected={false}
        onSelectCampaign={onSelectCampaign}
        onOpenCampaignSettings={vi.fn()}
        onEnterCampaign={vi.fn()}
        onJoinRequest={vi.fn()}
        onWatchCampaign={vi.fn()}
        onLoadPendingJoinRequests={vi.fn(async () => [])}
        onResolveJoinRequest={vi.fn(async () => undefined)}
        onError={vi.fn()}
      />
    </TooltipProvider>
  )

  return { onSelectCampaign }
}

describe('CampaignCard keyboard accessibility', () => {
  it('selects the campaign when Enter is pressed on the card', () => {
    const { onSelectCampaign } = renderCard()

    const card = screen.getByRole('listitem')
    fireEvent.keyDown(card, { key: 'Enter' })

    expect(onSelectCampaign).toHaveBeenCalledTimes(1)
    expect(onSelectCampaign).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
  })

  it('selects the campaign when Space is pressed on the card', () => {
    const { onSelectCampaign } = renderCard()

    const card = screen.getByRole('listitem')
    fireEvent.keyDown(card, { key: ' ' })

    expect(onSelectCampaign).toHaveBeenCalledTimes(1)
    expect(onSelectCampaign).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
  })
})
