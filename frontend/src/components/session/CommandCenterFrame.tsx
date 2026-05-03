import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Role } from '@shared'
import { useStore } from '../../hooks/useStore'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../core-ui'
import type { CenterPaneView, RightRailTab } from '@/types/ui'
import { Icon } from '../ui/Icon'
import { telemetryClient } from '../../utils/telemetry'
import '../../styles/components/session/CommandCenterFrame.css'

export type { CenterPaneView, RightRailTab } from '@/types/ui'

export interface ToolbarPlaceholderAction {
  id: string
  label: string
  comingSoon: boolean
}

export interface ToolbarActionModel {
  centerPaneView: CenterPaneView
  setCenterPaneView: (view: CenterPaneView) => void
  rightRailOpen: boolean
  toggleRightRail: () => void
  placeholderActions: ToolbarPlaceholderAction[]
}

const DM_TABS: RightRailTab[] = [
  'rooms',
  'audio',
  'notes',
  'search',
  'journal',
  'history',
  'settings',
]
const PLAYER_TABS: RightRailTab[] = ['rooms', 'audio', 'notes', 'search', 'journal', 'history']
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

function iconForTab(
  tab: RightRailTab
): 'rooms' | 'voice' | 'notes' | 'search' | 'journal' | 'history' | 'settings' {
  switch (tab) {
    case 'rooms':
      return 'rooms'
    case 'audio':
      return 'voice'
    case 'notes':
      return 'notes'
    case 'search':
      return 'search'
    case 'journal':
      return 'journal'
    case 'history':
      return 'history'
    case 'settings':
      return 'settings'
    default:
      return 'settings'
  }
}

function isRightRailTab(value: string, tabs: RightRailTab[]): value is RightRailTab {
  return tabs.includes(value as RightRailTab)
}

interface CommandCenterFrameProps {
  role: Role
  renderToolbar: (model: ToolbarActionModel) => ReactNode
  renderCampaignInfo: () => ReactNode
  renderSystemToasts?: () => ReactNode
  renderLeftRail: () => ReactNode
  renderCenterPane: (view: CenterPaneView) => ReactNode
  renderRightRailTab: (tab: RightRailTab) => ReactNode
  rightRailIndicators?: Partial<Record<RightRailTab, number>>
}

function normalizeIndicatorCount(rawCount: number | undefined): number {
  if (!Number.isFinite(rawCount)) return 0
  return Math.max(0, Math.floor(rawCount ?? 0))
}

function formatIndicatorCount(count: number): string {
  return count > 99 ? '99+' : String(count)
}

export function CommandCenterFrame({
  role,
  renderToolbar,
  renderCampaignInfo,
  renderSystemToasts,
  renderLeftRail,
  renderCenterPane,
  renderRightRailTab,
  rightRailIndicators = {},
}: CommandCenterFrameProps) {
  const toolbarCenterPaneView = useStore((state) => state.toolbarCenterPaneView)
  const toolbarRightRailOpen = useStore((state) => state.toolbarRightRailOpen)
  const setToolbarCenterPaneView = useStore((state) => state.setToolbarCenterPaneView)
  const toggleToolbarRightRail = useStore((state) => state.toggleToolbarRightRail)

  const [isCompactLayout, setIsCompactLayout] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= 1100 : false
  )

  const tabs = useMemo(() => getRightRailTabsForRole(role), [role])
  const [selectedRightRailTab, setSelectedRightRailTab] = useState<RightRailTab>(tabs[0] || 'rooms')
  const activeRightRailTab = tabs.includes(selectedRightRailTab)
    ? selectedRightRailTab
    : tabs[0] || 'rooms'

  const placeholderActions: ToolbarPlaceholderAction[] = useMemo(
    () => [
      { id: 'filters', label: 'Filters', comingSoon: true },
      { id: 'timeline', label: 'Timeline', comingSoon: true },
      { id: 'quick-tools', label: 'Quick Tools', comingSoon: true },
    ],
    []
  )

  const toolbarModel: ToolbarActionModel = {
    centerPaneView: toolbarCenterPaneView,
    setCenterPaneView: (view) => {
      telemetryClient.track('UI_TAB_SWITCH', {
        surface: 'command-center-center-pane',
        from: toolbarCenterPaneView,
        to: view,
        role,
      })
      setToolbarCenterPaneView(view)
    },
    rightRailOpen: toolbarRightRailOpen,
    toggleRightRail: () => {
      telemetryClient.track('UI_PANEL_TOGGLE', {
        surface: 'command-center-right-rail',
        nextOpen: !toolbarRightRailOpen,
        role,
      })
      toggleToolbarRightRail()
    },
    placeholderActions,
  }

  useEffect(() => {
    const handleResize = () => {
      setIsCompactLayout(window.innerWidth <= 1100)
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  return (
    <section aria-label="Command Center" className="command-center-frame">
      <div className="command-center-meta-grid">
        <section data-testid="toolbar" className="command-center-surface">
          {renderToolbar(toolbarModel)}
        </section>
        <section data-testid="campaign-info" className="command-center-surface">
          {renderCampaignInfo()}
        </section>
      </div>

      {renderSystemToasts && (
        <section data-testid="system-toasts" className="command-center-surface">
          {renderSystemToasts()}
        </section>
      )}

      <div
        data-testid="rails-layout"
        data-layout={isCompactLayout ? 'compact' : 'desktop'}
        className={`command-center-rails ${toolbarRightRailOpen ? 'open' : 'closed'} ${
          isCompactLayout ? 'compact' : 'desktop'
        }`}
      >
        <aside data-testid="left-rail" className="command-center-surface">
          {renderLeftRail()}
        </aside>

        <div data-testid="center-pane">{renderCenterPane(toolbarCenterPaneView)}</div>

        {toolbarRightRailOpen && (
          <aside data-testid="right-rail" className="command-center-surface">
            <Tabs
              value={activeRightRailTab}
              onValueChange={(nextTab) => {
                if (!isRightRailTab(nextTab, tabs)) {
                  return
                }

                telemetryClient.track('UI_TAB_SWITCH', {
                  surface: 'command-center-right-rail',
                  from: activeRightRailTab,
                  to: nextTab,
                  role,
                })
                setSelectedRightRailTab(nextTab)
              }}
            >
              <div className="command-center-right-rail-layout">
                <TooltipProvider delayDuration={140}>
                  <TabsList className="command-center-right-rail-toolbar" aria-label="Tool panels">
                    {tabs.map((tab) => {
                      const label = formatTabLabel(tab)
                      const indicatorCount = normalizeIndicatorCount(rightRailIndicators[tab])

                      return (
                        <Tooltip key={tab}>
                          <TooltipTrigger asChild>
                            <TabsTrigger
                              value={tab}
                              aria-label={`Tool ${label}`}
                              className="command-center-right-rail-trigger"
                            >
                              <Icon name={iconForTab(tab)} />
                              {indicatorCount > 0 ? (
                                <span
                                  className={`command-center-right-rail-indicator command-center-right-rail-indicator--${tab}`}
                                  aria-hidden="true"
                                >
                                  {formatIndicatorCount(indicatorCount)}
                                </span>
                              ) : null}
                            </TabsTrigger>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="command-center-right-rail-tooltip">
                            {label}
                          </TooltipContent>
                        </Tooltip>
                      )
                    })}
                  </TabsList>
                </TooltipProvider>

                <TabsContent
                  value={activeRightRailTab}
                  data-testid="right-rail-content"
                  className="command-center-right-rail-content"
                >
                  {renderRightRailTab(activeRightRailTab)}
                </TabsContent>
              </div>
            </Tabs>
          </aside>
        )}
      </div>
    </section>
  )
}
