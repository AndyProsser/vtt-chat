import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionState } from '@shared'
import type { ToolbarActionModel } from '@/components/session/CommandCenterFrame'
import { SessionToolbar } from '@/components/session/SessionToolbar'

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

    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy()
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
})
