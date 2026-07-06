import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Role } from '@shared'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  SessionWorkspaceFrame as CommandCenterFrame,
  type ToolbarActionModel,
  getRightRailTabsForRole,
} from '../../src/components/workspaces/session/WorkspaceFrame'
import { useStore } from '../../src/state/store'

function renderToolbar(model: ToolbarActionModel) {
  return (
    <div>
      <button
        type="button"
        aria-label="Center Chat"
        aria-pressed={model.centerPaneView === 'chat'}
        onClick={() => model.setCenterPaneView('chat')}
      >
        Chat
      </button>
      <button
        type="button"
        aria-label="Center Notes"
        aria-pressed={model.centerPaneView === 'notes'}
        onClick={() => model.setCenterPaneView('notes')}
      >
        Notes
      </button>
      <button type="button" onClick={model.toggleRightRail}>
        {model.rightRailOpen ? 'Hide Tools' : 'Show Tools'}
      </button>
      {model.placeholderActions.map((action) => (
        <button key={action.id} type="button" disabled>
          {action.label}
        </button>
      ))}
    </div>
  )
}

describe('getRightRailTabsForRole', () => {
  it('returns full toolset for DM', () => {
    expect(getRightRailTabsForRole(Role.DM)).toEqual([
      'information',
      'party',
      'inventory',
      'rooms',
      'journal',
      'notes',
      'history',
      'settings',
    ])
  })

  it('returns full player toolset for PLAYER', () => {
    expect(getRightRailTabsForRole(Role.PLAYER)).toEqual([
      'information',
      'party',
      'inventory',
      'journal',
      'notes',
      'history',
      'settings',
    ])
  })

  it('returns limited information toolset for SPECTATOR', () => {
    expect(getRightRailTabsForRole(Role.SPECTATOR)).toEqual([
      'information',
      'party',
      'inventory',
      'journal',
      'notes',
      'history',
    ])
  })
})

describe('CommandCenterFrame', () => {
  beforeEach(() => {
    useStore.getState().resetToolbarActionsState()
    // Reset window.innerWidth to a non-wide default so the auto-open
    // effect (isWideLayout && !railOpen) doesn't fire between tests.
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true, writable: true })
  })

  it('toggles center pane between chat and notes', () => {
    render(
      <CommandCenterFrame
        role={Role.DM}
        renderToolbar={(model) => (
          <div>
            {renderToolbar(model)}
            <div>Toolbar Content</div>
          </div>
        )}
        renderSystemToasts={() => <div>System Toasts Content</div>}
        renderLeftRail={() => <div>Left Rail Content</div>}
        renderCenterPane={(view) => <div>{view === 'chat' ? 'Chat Content' : 'Notes Content'}</div>}
        renderRightRailTab={(tab) => <div>Tab: {tab}</div>}
      />
    )

    expect(screen.getByText('Toolbar Content')).toBeTruthy()
    expect(screen.getByText('System Toasts Content')).toBeTruthy()
    expect(screen.getByText('Left Rail Content')).toBeTruthy()
    expect(screen.getByText('Chat Content')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Center Notes' }))
    expect(screen.getByText('Notes Content')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Center Chat' }))
    expect(screen.getByText('Chat Content')).toBeTruthy()
  })

  it('opens and closes right rail tools panel', async () => {
    render(
      <CommandCenterFrame
        role={Role.PLAYER}
        renderToolbar={renderToolbar}
        renderLeftRail={() => <div>Left Rail Content</div>}
        renderCenterPane={() => <div>Center</div>}
        renderRightRailTab={(tab) => <div>Tab: {tab}</div>}
      />
    )

    expect(screen.getByTestId('toolbar')).toBeTruthy()
    expect(screen.getByTestId('left-rail')).toBeTruthy()
    expect(screen.queryByTestId('right-rail')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show Tools' }))
    expect(screen.getByTestId('right-rail')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Hide Tools' }))
    expect(screen.getByTestId('left-rail')).toBeTruthy()
    await waitFor(() => {
      expect(screen.queryByTestId('right-rail')).toBeNull()
    })
  })

  it('renders persona-specific right-rail tabs', () => {
    const { rerender } = render(
      <CommandCenterFrame
        role={Role.SPECTATOR}
        renderToolbar={renderToolbar}
        renderLeftRail={() => <div>Left Rail Content</div>}
        renderCenterPane={() => <div>Center</div>}
        renderRightRailTab={(tab) => <div>Tab: {tab}</div>}
      />
    )

    expect(screen.getByRole('tab', { name: 'Tool Information' })).toBeTruthy()
    expect(screen.queryByRole('tab', { name: 'Tool Groups' })).toBeNull()

    rerender(
      <CommandCenterFrame
        role={Role.DM}
        renderToolbar={renderToolbar}
        renderLeftRail={() => <div>Left Rail Content</div>}
        renderCenterPane={() => <div>Center</div>}
        renderRightRailTab={(tab) => <div>Tab: {tab}</div>}
      />
    )

    expect(screen.getByRole('tab', { name: 'Tool Information' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Tool Party' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Tool Groups' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Tool Handouts' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Tool History' })).toBeTruthy()
    expect(screen.queryByRole('tab', { name: 'Tool Audio' })).toBeNull()
    expect(screen.getByRole('tab', { name: 'Tool Settings' })).toBeTruthy()

    rerender(
      <CommandCenterFrame
        role={Role.PLAYER}
        renderToolbar={renderToolbar}
        renderLeftRail={() => <div>Left Rail Content</div>}
        renderCenterPane={() => <div>Center</div>}
        renderRightRailTab={(tab) => <div>Tab: {tab}</div>}
      />
    )

    expect(screen.getByRole('tab', { name: 'Tool Information' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Tool Party' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Tool Handouts' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Tool Journal' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Tool History' })).toBeTruthy()
    expect(screen.queryByRole('tab', { name: 'Tool Groups' })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Tool Audio' })).toBeNull()
    expect(screen.getByRole('tab', { name: 'Tool Settings' })).toBeTruthy()
  })

  it('renders system toasts container only when provided', () => {
    const { rerender } = render(
      <CommandCenterFrame
        role={Role.PLAYER}
        renderToolbar={renderToolbar}
        renderSystemToasts={() => <div>System Toasts Content</div>}
        renderLeftRail={() => <div>Left Rail Content</div>}
        renderCenterPane={() => <div>Center</div>}
        renderRightRailTab={(tab) => <div>Tab: {tab}</div>}
      />
    )

    expect(screen.getByTestId('system-toasts')).toBeTruthy()

    rerender(
      <CommandCenterFrame
        role={Role.PLAYER}
        renderToolbar={renderToolbar}
        renderLeftRail={() => <div>Left Rail Content</div>}
        renderCenterPane={() => <div>Center</div>}
        renderRightRailTab={(tab) => <div>Tab: {tab}</div>}
      />
    )

    expect(screen.queryByTestId('system-toasts')).toBeNull()
  })

  it('uses globally addressable toolbar state for center pane and rail toggle', () => {
    const state = useStore.getState()
    state.setToolbarCenterPaneView('notes')
    state.setToolbarRightRailOpen(false)

    render(
      <CommandCenterFrame
        role={Role.PLAYER}
        renderToolbar={renderToolbar}
        renderLeftRail={() => <div>Left Rail Content</div>}
        renderCenterPane={(view) => <div>View: {view}</div>}
        renderRightRailTab={(tab) => <div>Tab: {tab}</div>}
      />
    )

    expect(screen.getByText('View: notes')).toBeTruthy()
    expect(screen.queryByTestId('right-rail')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Show Tools' }))
    expect(screen.getByTestId('right-rail')).toBeTruthy()
    expect(useStore.getState().toolbarRightRailOpen).toBe(true)
  })

  it('updates layout mode when viewport crosses tablet breakpoint', () => {
    Object.defineProperty(window, 'innerWidth', {
      value: 1280,
      configurable: true,
      writable: true,
    })

    render(
      <CommandCenterFrame
        role={Role.PLAYER}
        renderToolbar={renderToolbar}
        renderLeftRail={() => <div>Left Rail Content</div>}
        renderCenterPane={() => <div>Center</div>}
        renderRightRailTab={(tab) => <div>Tab: {tab}</div>}
      />
    )

    const layout = screen.getByTestId('rails-layout')
    expect(layout.getAttribute('data-layout')).toBe('desktop')

    Object.defineProperty(window, 'innerWidth', {
      value: 900,
      configurable: true,
      writable: true,
    })
    fireEvent(window, new Event('resize'))
    expect(layout.getAttribute('data-layout')).toBe('compact')

    Object.defineProperty(window, 'innerWidth', {
      value: 1280,
      configurable: true,
      writable: true,
    })
    fireEvent(window, new Event('resize'))
    expect(layout.getAttribute('data-layout')).toBe('desktop')
  })

  it('keeps right rail closed by default after reset', () => {
    useStore.getState().resetToolbarActionsState()

    render(
      <CommandCenterFrame
        role={Role.PLAYER}
        renderToolbar={renderToolbar}
        renderLeftRail={() => <div>Left Rail Content</div>}
        renderCenterPane={() => <div>Center</div>}
        renderRightRailTab={(tab) => <div>Tab: {tab}</div>}
      />
    )

    expect(screen.queryByTestId('right-rail')).toBeNull()
  })
})
