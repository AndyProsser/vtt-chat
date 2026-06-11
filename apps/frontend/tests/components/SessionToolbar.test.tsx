import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionState } from '@shared'
import type { ToolbarActionModel } from '@/types/toolbar'
import type { UUID } from '@shared'
import { SessionToolbar } from '@/components/workspaces/shared/toolbar/SessionToolbar'
import { useStore } from '@/hooks/useStore'

const TEST_SESSION_ID = '11111111-1111-4111-8111-111111111111' as UUID

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

describe('SessionToolbar cooldown controls', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders cancel and extend controls in cooldown mode', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-15T12:00:00.000Z'))

    render(
      <SessionToolbar
        actions={buildActions()}
        statusColorKey="GREEN"
        statusLabel="Healthy"
        coreWsState="CONNECTED"
        livekitState="CONNECTED"
        sessionState={SessionState.COOLDOWN}
        sessionStartedAt={Date.now() - 30 * 60_000}
        sessionEndedAt={Date.now() - 15_000}
        cumulativePauseMs={0}
        pauseCount={0}
        cooldownDurationMs={60_000}
        canStartSession={false}
        canPauseSession={false}
        canStopSession={false}
        showCooldownControls={true}
        canManageCooldown={true}
        canExtendCooldown={true}
        onStartSession={() => undefined}
        onPauseSession={() => undefined}
        onStopSession={() => undefined}
        onCancelCooldown={() => undefined}
        onExtendCooldown={() => undefined}
        onOpenUserSettings={() => undefined}
        onExitToSelector={() => undefined}
      />
    )

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(screen.getByRole('button', { name: 'Cancel cooldown' })).not.toHaveProperty(
      'disabled',
      true
    )
    expect(screen.getByRole('button', { name: 'Extend cooldown' })).not.toHaveProperty(
      'disabled',
      true
    )
  })
  it('locks cooldown controls when management is not allowed', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-15T12:00:00.000Z'))

    render(
      <SessionToolbar
        actions={buildActions()}
        statusColorKey="GREEN"
        statusLabel="Healthy"
        coreWsState="CONNECTED"
        livekitState="CONNECTED"
        sessionState={SessionState.COOLDOWN}
        sessionStartedAt={Date.now() - 30 * 60_000}
        sessionEndedAt={Date.now() - 15_000}
        cumulativePauseMs={0}
        pauseCount={0}
        cooldownDurationMs={60_000}
        canStartSession={false}
        canPauseSession={false}
        canStopSession={false}
        showCooldownControls={true}
        canManageCooldown={false}
        cooldownControlLockedReason="Cooldown controls unlock for players only if the DM disconnects."
        onStartSession={() => undefined}
        onPauseSession={() => undefined}
        onStopSession={() => undefined}
        onCancelCooldown={() => undefined}
        onExtendCooldown={() => undefined}
        onOpenUserSettings={() => undefined}
        onExitToSelector={() => undefined}
      />
    )

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(screen.getByRole('button', { name: 'Cancel cooldown' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Extend cooldown' })).toHaveProperty('disabled', true)
  })
  it('hides Start while cooldown is active and shows it once cooldown expires', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-15T12:00:00.000Z'))

    const { rerender } = render(
      <SessionToolbar
        actions={buildActions()}
        statusColorKey="GREEN"
        statusLabel="Healthy"
        coreWsState="CONNECTED"
        livekitState="CONNECTED"
        sessionState={SessionState.COOLDOWN}
        sessionStartedAt={Date.now() - 30 * 60_000}
        sessionEndedAt={Date.now() - 15_000}
        cumulativePauseMs={0}
        pauseCount={0}
        cooldownDurationMs={60_000}
        canStartSession={true}
        canPauseSession={false}
        canStopSession={false}
        showCooldownControls={true}
        canManageCooldown={true}
        canExtendCooldown={true}
        onStartSession={() => undefined}
        onPauseSession={() => undefined}
        onStopSession={() => undefined}
        onCancelCooldown={() => undefined}
        onExtendCooldown={() => undefined}
        onOpenUserSettings={() => undefined}
        onExitToSelector={() => undefined}
      />
    )

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull()

    rerender(
      <SessionToolbar
        actions={buildActions()}
        statusColorKey="GREEN"
        statusLabel="Healthy"
        coreWsState="CONNECTED"
        livekitState="CONNECTED"
        sessionState={SessionState.ENDED}
        sessionStartedAt={Date.now() - 30 * 60_000}
        sessionEndedAt={Date.now() - 120_000}
        cumulativePauseMs={0}
        pauseCount={0}
        cooldownDurationMs={60_000}
        canStartSession={true}
        canPauseSession={false}
        canStopSession={false}
        showCooldownControls={true}
        canManageCooldown={true}
        onStartSession={() => undefined}
        onPauseSession={() => undefined}
        onStopSession={() => undefined}
        onCancelCooldown={() => undefined}
        onExtendCooldown={() => undefined}
        onOpenUserSettings={() => undefined}
        onExitToSelector={() => undefined}
      />
    )

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    // When session is in ENDED state, the button label is 'Reset' (to start fresh session)
    expect(screen.getByRole('button', { name: 'Reset' })).toBeTruthy()
  })

  it('invokes cancel and extend callbacks when enabled', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-15T12:00:00.000Z'))

    const onCancelCooldown = vi.fn()
    const onExtendCooldown = vi.fn()

    render(
      <SessionToolbar
        actions={buildActions()}
        statusColorKey="GREEN"
        statusLabel="Healthy"
        coreWsState="CONNECTED"
        livekitState="CONNECTED"
        sessionState={SessionState.COOLDOWN}
        sessionStartedAt={Date.now() - 30 * 60_000}
        sessionEndedAt={Date.now() - 15_000}
        cumulativePauseMs={0}
        pauseCount={0}
        cooldownDurationMs={60_000}
        canStartSession={false}
        canPauseSession={false}
        canStopSession={false}
        showCooldownControls={true}
        canManageCooldown={true}
        canExtendCooldown={true}
        onStartSession={() => undefined}
        onPauseSession={() => undefined}
        onStopSession={() => undefined}
        onCancelCooldown={onCancelCooldown}
        onExtendCooldown={onExtendCooldown}
        onOpenUserSettings={() => undefined}
        onExitToSelector={() => undefined}
      />
    )

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Cancel cooldown' }))
    fireEvent.click(screen.getByRole('button', { name: 'Extend cooldown' }))

    expect(onCancelCooldown).toHaveBeenCalledTimes(1)
    expect(onExtendCooldown).toHaveBeenCalledTimes(1)
  })

  it('prefers backend cooldown end anchor when provided', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-15T12:00:00.000Z'))

    // Set up Zustand store with the session data including backend-authoritative cooldownExpiresAt
    act(() => {
      useStore.getState().createSession({
        id: TEST_SESSION_ID,
        name: 'Test Session',
        dmId: 'dm-user-id' as UUID,
        campaignId: 'campaign-id' as UUID,
        state: SessionState.COOLDOWN,
        startedAt: Date.now() - 30 * 60_000,
        endedAt: Date.now() - 5_000,
        cooldownExpiresAt: Date.now() + 90_000,
        createdAt: Date.now() - 60 * 60_000,
      } as any)
    })

    render(
      <SessionToolbar
        actions={buildActions()}
        sessionId={TEST_SESSION_ID}
        statusColorKey="GREEN"
        statusLabel="Healthy"
        coreWsState="CONNECTED"
        livekitState="CONNECTED"
        sessionState={SessionState.COOLDOWN}
        sessionStartedAt={Date.now() - 30 * 60_000}
        sessionEndedAt={Date.now() - 5_000}
        cumulativePauseMs={0}
        pauseCount={0}
        cooldownDurationMs={60_000}
        canStartSession={false}
        canPauseSession={false}
        canStopSession={false}
        showCooldownControls={true}
        canManageCooldown={true}
        canExtendCooldown={true}
        onStartSession={() => undefined}
        onPauseSession={() => undefined}
        onStopSession={() => undefined}
        onCancelCooldown={() => undefined}
        onExtendCooldown={() => undefined}
        onOpenUserSettings={() => undefined}
        onExitToSelector={() => undefined}
      />
    )

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    // If fallback math were used (endedAt + 60s), remaining would be ~55s.
    // Backend anchor (cooldownExpiresAt) should show ~90s remaining instead.
    expect(screen.getByText('00:01:30')).toBeTruthy()
  })
})
