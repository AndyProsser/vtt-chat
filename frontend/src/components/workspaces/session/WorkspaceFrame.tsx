import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Role } from '@shared'
import { useStore } from '@/hooks/useStore'
import { useTooltipLabelsPreference } from '@/hooks/useTooltipLabelsPreference'
import {
  getWorkspacePanelIcon,
  getWorkspacePanelLabel,
  getWorkspacePanelTabsForRole,
} from '@/utils/workspacePanelPolicy'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui'
import type { CenterPaneView, RightRailTab } from '@/types/ui'
import { Icon } from '@/components/ui/Icon'
import { telemetryClient } from '@/utils/telemetry'
import type { ToolbarActionModel, ToolbarPlaceholderAction } from '@/types/toolbar'
import '@/styles/components/workspaces/session/SessionWorkspaceFrame.css'

export type { CenterPaneView, RightRailTab } from '@/types/ui'

type DockTab = RightRailTab | 'chat'

export function getRightRailTabsForRole(role: Role): RightRailTab[] {
  return getWorkspacePanelTabsForRole(role)
}

interface SessionWorkspaceFrameProps {
  role: Role
  renderToolbar: (model: ToolbarActionModel) => ReactNode
  renderSystemToasts?: () => ReactNode
  renderLeftRail: (actions: { openRightRailTab: (tab: RightRailTab) => void }) => ReactNode
  renderCenterPane: (view: CenterPaneView) => ReactNode
  renderRightRailTab: (tab: RightRailTab) => ReactNode
  rightRailIndicators?: Partial<Record<RightRailTab, number>>
  chatIndicatorCount?: number
  forcedRightRailTab?: RightRailTab | null
  onForcedRightRailTabApplied?: () => void
}

function normalizeIndicatorCount(rawCount: number | undefined): number {
  if (!Number.isFinite(rawCount)) return 0
  return Math.max(0, Math.floor(rawCount ?? 0))
}

function formatIndicatorCount(count: number): string {
  return count > 99 ? '99+' : String(count)
}

export function SessionWorkspaceFrame({
  role,
  renderToolbar,
  renderSystemToasts,
  renderLeftRail,
  renderCenterPane,
  renderRightRailTab,
  rightRailIndicators = {},
  chatIndicatorCount = 0,
  forcedRightRailTab = null,
  onForcedRightRailTabApplied,
}: SessionWorkspaceFrameProps) {
  const { tooltipLabelsEnabled } = useTooltipLabelsPreference()
  const systemToastsNode = renderSystemToasts ? renderSystemToasts() : null
  const toolbarCenterPaneView = useStore((state) => state.toolbarCenterPaneView)
  const toolbarRightRailOpen = useStore((state) => state.toolbarRightRailOpen)
  const setToolbarCenterPaneView = useStore((state) => state.setToolbarCenterPaneView)
  const setToolbarRightRailOpen = useStore((state) => state.setToolbarRightRailOpen)
  const toggleToolbarRightRail = useStore((state) => state.toggleToolbarRightRail)

  const [isCompactLayout, setIsCompactLayout] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= 1100 : false
  )
  const [isDockLayout, setIsDockLayout] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= 720 : false
  )
  const [isRightRailVisible, setIsRightRailVisible] = useState(toolbarRightRailOpen)
  const [isRightRailClosing, setIsRightRailClosing] = useState(false)
  const [isChatDockOpen, setIsChatDockOpen] = useState(false)
  const lastTabToggleRef = useRef<{ at: number; tab: RightRailTab | null }>({
    at: 0,
    tab: null,
  })

  const tabs = useMemo(() => getRightRailTabsForRole(role), [role])
  const [selectedRightRailTab, setSelectedRightRailTab] = useState<RightRailTab>(tabs[0] || 'rooms')
  const activeRightRailTab = tabs.includes(selectedRightRailTab)
    ? selectedRightRailTab
    : tabs[0] || 'rooms'
  const activeTabIndex = Math.max(0, tabs.indexOf(activeRightRailTab))
  const pointerTabIndex = Math.min(6, activeTabIndex)

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
        surface: 'session-workspace-frame__center-pane',
        from: toolbarCenterPaneView,
        to: view,
        role,
      })
      setToolbarCenterPaneView(view)
    },
    rightRailOpen: toolbarRightRailOpen,
    activeRightRailTab,
    availableRightRailTabs: tabs,
    toggleRightRail: () => {
      telemetryClient.track('UI_PANEL_TOGGLE', {
        surface: 'command-center-right-rail',
        nextOpen: !toolbarRightRailOpen,
        role,
      })
      toggleToolbarRightRail()
    },
    openRightRailTab: (tab) => {
      if (!tabs.includes(tab)) {
        return
      }

      telemetryClient.track('UI_TAB_SWITCH', {
        surface: 'command-center-right-rail',
        from: activeRightRailTab,
        to: tab,
        role,
      })
      setIsChatDockOpen(false)
      setSelectedRightRailTab(tab)
      setToolbarRightRailOpen(true)
    },
    placeholderActions,
  }

  useEffect(() => {
    const handleResize = () => {
      setIsCompactLayout(window.innerWidth <= 1100)
      setIsDockLayout(window.innerWidth <= 720)
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  useEffect(() => {
    if (!isDockLayout && isChatDockOpen) {
      setIsChatDockOpen(false)
    }
  }, [isChatDockOpen, isDockLayout])

  useEffect(() => {
    if (!forcedRightRailTab) {
      return
    }

    if (!tabs.includes(forcedRightRailTab)) {
      onForcedRightRailTabApplied?.()
      return
    }

    setIsChatDockOpen(false)
    setSelectedRightRailTab(forcedRightRailTab)
    setToolbarRightRailOpen(true)
    onForcedRightRailTabApplied?.()
  }, [forcedRightRailTab, onForcedRightRailTabApplied, setToolbarRightRailOpen, tabs])

  useEffect(() => {
    if (toolbarRightRailOpen) {
      setIsRightRailVisible(true)
      setIsRightRailClosing(false)
      return
    }

    if (!isRightRailVisible) {
      return
    }

    setIsRightRailClosing(true)
    const closeTimer = window.setTimeout(() => {
      setIsRightRailVisible(false)
      setIsRightRailClosing(false)
    }, 190)

    return () => {
      window.clearTimeout(closeTimer)
    }
  }, [isRightRailVisible, toolbarRightRailOpen])

  const handleRightRailTabClick = (tab: RightRailTab, timestamp: number) => {
    const now = timestamp
    if (lastTabToggleRef.current.tab === tab && now - lastTabToggleRef.current.at < 140) {
      return
    }
    lastTabToggleRef.current = { at: now, tab }

    if (toolbarRightRailOpen && activeRightRailTab === tab) {
      setToolbarRightRailOpen(false)
      return
    }

    setIsChatDockOpen(false)
    setSelectedRightRailTab(tab)
    setToolbarRightRailOpen(true)
  }

  const handleChatDockClick = (timestamp: number) => {
    const now = timestamp
    if (lastTabToggleRef.current.tab === null && now - lastTabToggleRef.current.at < 140) {
      return
    }
    lastTabToggleRef.current = { at: now, tab: null }

    if (isChatDockOpen) {
      setIsChatDockOpen(false)
      return
    }

    setToolbarRightRailOpen(false)
    setIsChatDockOpen(true)
  }

  const handleRightRailClickOutside = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.currentTarget !== event.target || isRightRailClosing) {
      return
    }

    if (isChatDockOpen) {
      setIsChatDockOpen(false)
      return
    }

    if (toolbarRightRailOpen) {
      setToolbarRightRailOpen(false)
    }
  }

  const activeDockTab: DockTab = isChatDockOpen ? 'chat' : activeRightRailTab
  const isDockOverlayVisible = isChatDockOpen || isRightRailVisible
  const shouldRenderCenterPaneBase = !isDockLayout || toolbarCenterPaneView !== 'chat'
  const chatBadgeCount = normalizeIndicatorCount(chatIndicatorCount)

  return (
    <section
      aria-label="Command Center"
      className="session-workspace-frame"
      data-ui-component="SessionWorkspaceFrame"
      data-ui-state={`${role}|${toolbarCenterPaneView}|${activeRightRailTab}`}
    >
      <section
        data-testid="toolbar"
        className="session-workspace-frame__top-toolbar"
        data-ui-component="SessionWorkspaceToolbar"
      >
        {renderToolbar(toolbarModel)}
      </section>

      {systemToastsNode && (
        <section
          data-testid="system-toasts"
          className="session-workspace-frame__top-toasts"
          data-ui-component="SessionWorkspaceToasts"
        >
          {systemToastsNode}
        </section>
      )}

      <div
        data-testid="rails-layout"
        data-layout={isCompactLayout ? 'compact' : 'desktop'}
        className={`session-workspace-frame__rails ${toolbarRightRailOpen ? 'session-workspace-frame__rails--open' : 'session-workspace-frame__rails--closed'} ${
          isCompactLayout
            ? 'session-workspace-frame__rails--compact'
            : 'session-workspace-frame__rails--desktop'
        }`}
      >
        <aside
          data-testid="left-rail"
          className="session-workspace-frame__surface session-workspace-frame__left-rail-shell"
          data-ui-component="SessionWorkspaceLeftRail"
        >
          {renderLeftRail({ openRightRailTab: toolbarModel.openRightRailTab })}
        </aside>

        <div
          data-testid="center-pane"
          className="session-workspace-frame__center-pane"
          data-ui-component="SessionWorkspaceCenterPane"
          data-ui-state={toolbarCenterPaneView}
        >
          {shouldRenderCenterPaneBase ? renderCenterPane(toolbarCenterPaneView) : null}

          {isDockOverlayVisible && (
            <aside
              data-testid={isChatDockOpen ? 'chat-dock-panel' : 'right-rail'}
              className={`session-workspace-frame__right-rail-overlay ${
                isRightRailClosing ? 'session-workspace-frame__right-rail-overlay--closing' : ''
              } ${isChatDockOpen ? 'session-workspace-frame__right-rail-overlay--chat' : `session-workspace-frame__right-rail-overlay--tab-${pointerTabIndex}`}`}
              onClick={handleRightRailClickOutside}
              data-ui-component={
                isChatDockOpen ? 'SessionWorkspaceChatDock' : 'SessionWorkspaceRightRail'
              }
              data-ui-state={activeDockTab}
            >
              <div className="session-workspace-frame__right-rail-layout">
                {isChatDockOpen ? (
                  <div
                    data-testid="chat-dock-content"
                    className="session-workspace-frame__dock-chat-panel"
                  >
                    {renderCenterPane('chat')}
                  </div>
                ) : (
                  <Tabs value={activeRightRailTab}>
                    <TabsContent
                      value={activeRightRailTab}
                      data-testid="right-rail-content"
                      className="knowledge-panels__right-rail-content"
                    >
                      {renderRightRailTab(activeRightRailTab)}
                    </TabsContent>
                  </Tabs>
                )}
              </div>
            </aside>
          )}
        </div>

        <aside
          className="session-workspace-frame__right-rail-dock"
          aria-label="Tools"
          data-ui-component="SessionWorkspaceDock"
        >
          {tooltipLabelsEnabled ? (
            <TooltipProvider delayDuration={140}>
              <Tabs value={activeRightRailTab}>
                <TabsList
                  className="session-workspace-frame__right-rail-toolbar"
                  aria-label="Tool panels"
                >
                  {isDockLayout ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label="Open chat"
                          aria-pressed={isChatDockOpen}
                          className="session-workspace-frame__right-rail-trigger"
                          data-state={isChatDockOpen ? 'active' : 'inactive'}
                          onClick={(event) => {
                            handleChatDockClick(event.timeStamp)
                          }}
                        >
                          <Icon name="chat" />
                          {chatBadgeCount > 0 ? (
                            <span
                              className="session-workspace-frame__right-rail-indicator session-workspace-frame__right-rail-indicator--chat"
                              aria-hidden="true"
                            >
                              {formatIndicatorCount(chatBadgeCount)}
                            </span>
                          ) : null}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="left">Chat</TooltipContent>
                    </Tooltip>
                  ) : null}
                  {tabs.map((tab) => {
                    const label = getWorkspacePanelLabel(tab)
                    const indicatorCount = normalizeIndicatorCount(rightRailIndicators[tab])

                    return (
                      <Tooltip key={tab}>
                        <TooltipTrigger asChild>
                          <TabsTrigger
                            value={tab}
                            aria-label={`Tool ${label}`}
                            className="session-workspace-frame__right-rail-trigger"
                            onClick={(event) => {
                              handleRightRailTabClick(tab, event.timeStamp)
                            }}
                          >
                            <Icon name={getWorkspacePanelIcon(tab)} />
                            {indicatorCount > 0 ? (
                              <span
                                className={`session-workspace-frame__right-rail-indicator session-workspace-frame__right-rail-indicator--${tab}`}
                                aria-hidden="true"
                              >
                                {formatIndicatorCount(indicatorCount)}
                              </span>
                            ) : null}
                          </TabsTrigger>
                        </TooltipTrigger>
                        <TooltipContent side="left">{label}</TooltipContent>
                      </Tooltip>
                    )
                  })}
                </TabsList>
              </Tabs>
            </TooltipProvider>
          ) : (
            <Tabs value={activeRightRailTab}>
              <TabsList
                className="session-workspace-frame__right-rail-toolbar"
                aria-label="Tool panels"
              >
                {isDockLayout ? (
                  <button
                    type="button"
                    aria-label="Open chat"
                    aria-pressed={isChatDockOpen}
                    className="session-workspace-frame__right-rail-trigger"
                    data-state={isChatDockOpen ? 'active' : 'inactive'}
                    onClick={(event) => {
                      handleChatDockClick(event.timeStamp)
                    }}
                  >
                    <Icon name="chat" />
                    {chatBadgeCount > 0 ? (
                      <span
                        className="session-workspace-frame__right-rail-indicator session-workspace-frame__right-rail-indicator--chat"
                        aria-hidden="true"
                      >
                        {formatIndicatorCount(chatBadgeCount)}
                      </span>
                    ) : null}
                  </button>
                ) : null}
                {tabs.map((tab) => {
                  const label = getWorkspacePanelLabel(tab)
                  const indicatorCount = normalizeIndicatorCount(rightRailIndicators[tab])

                  return (
                    <TabsTrigger
                      key={tab}
                      value={tab}
                      aria-label={`Tool ${label}`}
                      className="session-workspace-frame__right-rail-trigger"
                      onClick={(event) => {
                        handleRightRailTabClick(tab, event.timeStamp)
                      }}
                    >
                      <Icon name={getWorkspacePanelIcon(tab)} />
                      {indicatorCount > 0 ? (
                        <span
                          className={`session-workspace-frame__right-rail-indicator session-workspace-frame__right-rail-indicator--${tab}`}
                          aria-hidden="true"
                        >
                          {formatIndicatorCount(indicatorCount)}
                        </span>
                      ) : null}
                    </TabsTrigger>
                  )
                })}
              </TabsList>
            </Tabs>
          )}
        </aside>
      </div>
    </section>
  )
}
