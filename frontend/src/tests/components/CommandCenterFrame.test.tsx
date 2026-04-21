import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  CommandCenterFrame,
  getRightRailTabsForRole,
} from '../../components/session/CommandCenterFrame'

describe('getRightRailTabsForRole', () => {
  it('returns full toolset for DM', () => {
    expect(getRightRailTabsForRole('DM')).toEqual([
      'rooms',
      'audio',
      'notes',
      'search',
      'journal',
      'history',
      'settings',
    ])
  })

  it('returns limited toolset for PLAYER', () => {
    expect(getRightRailTabsForRole('PLAYER')).toEqual(['rooms', 'audio', 'notes'])
  })

  it('returns rooms-only toolset for SPECTATOR', () => {
    expect(getRightRailTabsForRole('SPECTATOR')).toEqual(['rooms'])
  })
})

describe('CommandCenterFrame', () => {
  it('toggles center pane between chat and notes', () => {
    render(
      <CommandCenterFrame
        role="DM"
        renderLeftRail={() => <div>Left Rail Content</div>}
        renderCenterPane={(view) => <div>{view === 'chat' ? 'Chat Content' : 'Notes Content'}</div>}
        renderRightRailTab={(tab) => <div>Tab: {tab}</div>}
      />
    )

    expect(screen.getByText('Left Rail Content')).toBeTruthy()
    expect(screen.getByText('Chat Content')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Center Notes' }))
    expect(screen.getByText('Notes Content')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Center Chat' }))
    expect(screen.getByText('Chat Content')).toBeTruthy()
  })

  it('opens and closes right rail tools panel', () => {
    render(
      <CommandCenterFrame
        role="PLAYER"
        renderLeftRail={() => <div>Left Rail Content</div>}
        renderCenterPane={() => <div>Center</div>}
        renderRightRailTab={(tab) => <div>Tab: {tab}</div>}
      />
    )

    expect(screen.getByTestId('left-rail')).toBeTruthy()
    expect(screen.getByTestId('right-rail')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Hide Tools' }))
    expect(screen.getByTestId('left-rail')).toBeTruthy()
    expect(screen.queryByTestId('right-rail')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Show Tools' }))
    expect(screen.getByTestId('right-rail')).toBeTruthy()
  })

  it('renders persona-specific right-rail tabs', () => {
    const { rerender } = render(
      <CommandCenterFrame
        role="SPECTATOR"
        renderLeftRail={() => <div>Left Rail Content</div>}
        renderCenterPane={() => <div>Center</div>}
        renderRightRailTab={(tab) => <div>Tab: {tab}</div>}
      />
    )

    expect(screen.getByRole('button', { name: 'Tool Rooms' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Tool Audio' })).toBeNull()

    rerender(
      <CommandCenterFrame
        role="DM"
        renderLeftRail={() => <div>Left Rail Content</div>}
        renderCenterPane={() => <div>Center</div>}
        renderRightRailTab={(tab) => <div>Tab: {tab}</div>}
      />
    )

    expect(screen.getByRole('button', { name: 'Tool Audio' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Tool Search' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Tool History' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Tool Settings' })).toBeTruthy()
  })
})
