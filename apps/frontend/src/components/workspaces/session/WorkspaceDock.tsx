import {
  Tabs,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui'
import { Icon } from '@/components/ui/Icon'
import { getWorkspacePanelIcon, getWorkspacePanelLabel } from '@/utils/workspacePanelPolicy'
import type { RightRailTab } from '@/types/ui'

interface WorkspaceDockProps {
  tabs: RightRailTab[]
  activeRightRailTab: RightRailTab
  isDockLayout: boolean
  isChatDockOpen: boolean
  chatBadgeCount: number
  rightRailIndicators: Partial<Record<RightRailTab, number>>
  tooltipLabelsEnabled: boolean
  onChatDockClick: (timestamp: number) => void
  onTabClick: (tab: RightRailTab, timestamp: number) => void
  formatIndicatorCount: (count: number) => string
  normalizeIndicatorCount: (count: number | undefined) => number
}

/** Right-side dock strip with tab icons and optional chat button for mobile layout. */
export function WorkspaceDock({
  tabs,
  activeRightRailTab,
  isDockLayout,
  isChatDockOpen,
  chatBadgeCount,
  rightRailIndicators,
  tooltipLabelsEnabled,
  onChatDockClick,
  onTabClick,
  formatIndicatorCount,
  normalizeIndicatorCount,
}: WorkspaceDockProps) {
  const chatButton = isDockLayout ? (
    <button
      type="button"
      aria-label="Open chat"
      aria-pressed={isChatDockOpen}
      className="knowledge-panels__right-rail-trigger"
      data-state={isChatDockOpen ? 'active' : 'inactive'}
      onClick={(event) => {
        onChatDockClick(event.timeStamp)
      }}
    >
      <Icon name="chat" />
      {chatBadgeCount > 0 ? (
        <span
          className="knowledge-panels__right-rail-indicator knowledge-panels__right-rail-indicator--chat"
          aria-hidden="true"
        >
          {formatIndicatorCount(chatBadgeCount)}
        </span>
      ) : null}
    </button>
  ) : null

  const tabTriggers = tabs.map((tab) => {
    const label = getWorkspacePanelLabel(tab)
    const indicatorCount = normalizeIndicatorCount(rightRailIndicators[tab])
    return (
      <TabsTrigger
        key={tab}
        value={tab}
        aria-label={`Tool ${label}`}
        className="knowledge-panels__right-rail-trigger"
        onClick={(event) => {
          onTabClick(tab, event.timeStamp)
        }}
      >
        <Icon name={getWorkspacePanelIcon(tab)} />
        {indicatorCount > 0 ? (
          <span
            className={`knowledge-panels__right-rail-indicator knowledge-panels__right-rail-indicator--${tab}`}
            aria-hidden="true"
          >
            {formatIndicatorCount(indicatorCount)}
          </span>
        ) : null}
      </TabsTrigger>
    )
  })

  return (
    <aside
      className="knowledge-panels__right-rail-dock"
      aria-label="Tools"
      data-ui-component="SessionWorkspaceDock"
    >
      {tooltipLabelsEnabled ? (
        <TooltipProvider delayDuration={140}>
          <Tabs value={activeRightRailTab}>
            <TabsList className="knowledge-panels__right-rail-toolbar" aria-label="Tool panels">
              {isDockLayout ? (
                <Tooltip>
                  <TooltipTrigger asChild>{chatButton}</TooltipTrigger>
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
                        className="knowledge-panels__right-rail-trigger"
                        onClick={(event) => {
                          onTabClick(tab, event.timeStamp)
                        }}
                      >
                        <Icon name={getWorkspacePanelIcon(tab)} />
                        {indicatorCount > 0 ? (
                          <span
                            className={`knowledge-panels__right-rail-indicator knowledge-panels__right-rail-indicator--${tab}`}
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
          <TabsList className="knowledge-panels__right-rail-toolbar" aria-label="Tool panels">
            {chatButton}
            {tabTriggers}
          </TabsList>
        </Tabs>
      )}
    </aside>
  )
}
