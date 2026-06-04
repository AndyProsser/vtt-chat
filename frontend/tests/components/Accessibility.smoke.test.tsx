import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import { SessionState } from '@shared'
import type { CampaignSummary } from '@/types/session/campaign'
import { CampaignCard } from '@/components/workspaces/lobby/LobbyView.CampaignCard'
import { SessionToolbar } from '@/components/workspaces/shared/toolbar/SessionToolbar'
import { WorkspaceToolbar } from '@/components/workspaces/shared/toolbar/WorkspaceToolbar'
import { ReconnectBanner } from '@/components/ui/ReconnectBanner'
import type { ToolbarActionModel } from '@/types/toolbar'
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
    latestSessionState: SessionState.IDLE,
    ...overrides,
  }
}

function buildActions(): ToolbarActionModel {
  return {
    centerPaneView: 'main',
    setCenterPaneView: () => undefined,
    rightRailOpen: false,
    activeRightRailTab: 'information',
    availableRightRailTabs: ['information', 'notes', 'journal', 'history', 'settings'],
    toggleRightRail: () => undefined,
    openRightRailTab: () => undefined,
    placeholderActions: [],
  }
}

describe('Accessibility smoke checks', () => {
  it('CampaignCard has no obvious a11y violations', async () => {
    const { container } = render(
      <TooltipProvider>
        <div role="list" aria-label="Campaign list">
          <CampaignCard
            campaign={buildCampaign()}
            isSelected={false}
            onSelectCampaign={vi.fn()}
            onOpenCampaignSettings={vi.fn()}
            onEnterCampaign={vi.fn()}
            onJoinRequest={vi.fn()}
            onWatchCampaign={vi.fn()}
            onLoadPendingJoinRequests={vi.fn(async () => [])}
            onResolveJoinRequest={vi.fn(async () => undefined)}
            onError={vi.fn()}
          />
        </div>
      </TooltipProvider>
    )

    const results = await axe(container, {
      rules: {
        // Color contrast requires real browser rendering; jsdom is not reliable for this rule.
        'color-contrast': { enabled: false },
      },
    })

    expect(results.violations).toHaveLength(0)
  })

  it('SessionToolbar has no obvious a11y violations', async () => {
    const { container } = render(
      <SessionToolbar
        actions={buildActions()}
        wsState="connected"
        sessionId={'22222222-2222-4222-8222-222222222222'}
        sessionState={SessionState.ACTIVE}
        canStartSession={false}
        canPauseSession={true}
        canStopSession={true}
        showCooldownControls={false}
        onStartSession={() => undefined}
        onPauseSession={() => undefined}
        onStopSession={() => undefined}
        onOpenUserSettings={() => undefined}
        onExitToSelector={() => undefined}
      />
    )

    const results = await axe(container, {
      rules: {
        'color-contrast': { enabled: false },
      },
    })

    expect(results.violations).toHaveLength(0)
  })

  it('WorkspaceToolbar icon-only buttons have accessible labels', async () => {
    const { container } = render(
      <TooltipProvider>
        <WorkspaceToolbar
          themeMode="dark"
          onToggleTheme={vi.fn()}
          onOpenUserSettings={vi.fn()}
          onExit={vi.fn()}
          exitIcon="logout"
          exitAriaLabel="Logoff"
          exitTooltipLabel="Logoff"
          connectionStatusLabel="Connected"
          connectionStatusColorKey="GREEN"
        />
      </TooltipProvider>
    )

    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    })

    expect(results.violations).toHaveLength(0)
  })

  it('ReconnectBanner has no obvious a11y violations when reconnecting', async () => {
    const { container } = render(<ReconnectBanner wsState="reconnecting" />)

    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    })

    expect(results.violations).toHaveLength(0)
  })

  it('ReconnectBanner has no obvious a11y violations while hydrating', async () => {
    const { container } = render(<ReconnectBanner wsState="connected" isHydrating />)

    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    })

    expect(results.violations).toHaveLength(0)
  })
})
