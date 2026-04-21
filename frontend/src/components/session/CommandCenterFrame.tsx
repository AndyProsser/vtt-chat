import { useMemo, useState, type ReactNode } from 'react'
import type { Role } from '@shared'

export type CenterPaneView = 'chat' | 'notes'
export type RightRailTab =
  | 'rooms'
  | 'audio'
  | 'notes'
  | 'search'
  | 'journal'
  | 'history'
  | 'settings'

const DM_TABS: RightRailTab[] = [
  'rooms',
  'audio',
  'notes',
  'search',
  'journal',
  'history',
  'settings',
]
const PLAYER_TABS: RightRailTab[] = ['rooms', 'audio', 'notes']
const SPECTATOR_TABS: RightRailTab[] = ['rooms']

export function getRightRailTabsForRole(role: Role): RightRailTab[] {
  if (role === 'DM') return DM_TABS
  if (role === 'PLAYER') return PLAYER_TABS
  return SPECTATOR_TABS
}

function formatTabLabel(tab: RightRailTab): string {
  switch (tab) {
    case 'rooms':
      return 'Rooms'
    case 'audio':
      return 'Audio'
    case 'notes':
      return 'Notes'
    case 'search':
      return 'Search'
    case 'journal':
      return 'Journal'
    case 'history':
      return 'History'
    case 'settings':
      return 'Settings'
    default:
      return tab
  }
}

interface CommandCenterFrameProps {
  role: Role
  renderLeftRail: () => ReactNode
  renderCenterPane: (view: CenterPaneView) => ReactNode
  renderRightRailTab: (tab: RightRailTab) => ReactNode
}

export function CommandCenterFrame({
  role,
  renderLeftRail,
  renderCenterPane,
  renderRightRailTab,
}: CommandCenterFrameProps) {
  const [centerPaneView, setCenterPaneView] = useState<CenterPaneView>('chat')
  const [rightRailOpen, setRightRailOpen] = useState(true)

  const tabs = useMemo(() => getRightRailTabsForRole(role), [role])
  const [selectedRightRailTab, setSelectedRightRailTab] = useState<RightRailTab>(tabs[0] || 'rooms')
  const activeRightRailTab = tabs.includes(selectedRightRailTab)
    ? selectedRightRailTab
    : tabs[0] || 'rooms'

  return (
    <section
      aria-label="Command Center"
      style={{
        display: 'grid',
        gap: '1rem',
      }}
    >
      <header
        style={{
          display: 'flex',
          gap: '0.5rem',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
          <button
            type="button"
            aria-label="Center Chat"
            aria-pressed={centerPaneView === 'chat'}
            onClick={() => setCenterPaneView('chat')}
          >
            Chat
          </button>
          <button
            type="button"
            aria-label="Center Notes"
            aria-pressed={centerPaneView === 'notes'}
            onClick={() => setCenterPaneView('notes')}
          >
            Notes
          </button>
        </div>

        <button type="button" onClick={() => setRightRailOpen((open) => !open)}>
          {rightRailOpen ? 'Hide Tools' : 'Show Tools'}
        </button>
      </header>

      <div
        style={{
          display: 'grid',
          gap: '1rem',
          gridTemplateColumns: rightRailOpen
            ? 'minmax(220px, 280px) minmax(0, 1fr) minmax(260px, 320px)'
            : 'minmax(220px, 280px) minmax(0, 1fr)',
          alignItems: 'start',
        }}
      >
        <aside
          data-testid="left-rail"
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            backgroundColor: '#fff',
            padding: '0.75rem',
          }}
        >
          {renderLeftRail()}
        </aside>

        <div data-testid="center-pane">{renderCenterPane(centerPaneView)}</div>

        {rightRailOpen && (
          <aside
            data-testid="right-rail"
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              backgroundColor: '#fff',
              padding: '0.75rem',
            }}
          >
            <div
              style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}
            >
              {tabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  aria-label={`Tool ${formatTabLabel(tab)}`}
                  aria-pressed={tab === activeRightRailTab}
                  onClick={() => setSelectedRightRailTab(tab)}
                >
                  {formatTabLabel(tab)}
                </button>
              ))}
            </div>
            <div data-testid="right-rail-content">{renderRightRailTab(activeRightRailTab)}</div>
          </aside>
        )}
      </div>
    </section>
  )
}
