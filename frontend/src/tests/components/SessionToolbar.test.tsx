import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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
  it('renders cancel and extend controls in cooldown mode', () => {
    render(
      <SessionToolbar
        actions={buildActions()}
        statusColorKey="GREEN"
        statusLabel="Healthy"
        coreWsState="CONNECTED"
        livekitState="CONNECTED"
        sessionState={SessionState.ENDED}
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
        onStartSession={() => undefined}
        onPauseSession={() => undefined}
        onStopSession={() => undefined}
        onCancelCooldown={() => undefined}
        onExtendCooldown={() => undefined}
        onOpenUserSettings={() => undefined}
        onExitToSelector={() => undefined}
      />
    )

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
    render(
      <SessionToolbar
        actions={buildActions()}
        statusColorKey="GREEN"
        statusLabel="Healthy"
        coreWsState="CONNECTED"
        livekitState="CONNECTED"
        sessionState={SessionState.ENDED}
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

    expect(screen.getByRole('button', { name: 'Cancel cooldown' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Extend cooldown' })).toHaveProperty('disabled', true)
  })

  it('invokes cancel and extend callbacks when enabled', () => {
    const onCancelCooldown = vi.fn()
    const onExtendCooldown = vi.fn()

    render(
      <SessionToolbar
        actions={buildActions()}
        statusColorKey="GREEN"
        statusLabel="Healthy"
        coreWsState="CONNECTED"
        livekitState="CONNECTED"
        sessionState={SessionState.ENDED}
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
        onStartSession={() => undefined}
        onPauseSession={() => undefined}
        onStopSession={() => undefined}
        onCancelCooldown={onCancelCooldown}
        onExtendCooldown={onExtendCooldown}
        onOpenUserSettings={() => undefined}
        onExitToSelector={() => undefined}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancel cooldown' }))
    fireEvent.click(screen.getByRole('button', { name: 'Extend cooldown' }))

    expect(onCancelCooldown).toHaveBeenCalledTimes(1)
    expect(onExtendCooldown).toHaveBeenCalledTimes(1)
  })
})
