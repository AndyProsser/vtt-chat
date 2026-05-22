import type { CenterPaneView, RightRailTab } from '@/types/ui'

export interface ToolbarPlaceholderAction {
  id: string
  label: string
  comingSoon: boolean
}

export interface ToolbarActionModel {
  centerPaneView: CenterPaneView
  setCenterPaneView: (view: CenterPaneView) => void
  rightRailOpen: boolean
  activeRightRailTab: RightRailTab
  availableRightRailTabs: RightRailTab[]
  toggleRightRail: () => void
  openRightRailTab: (tab: RightRailTab) => void
  placeholderActions: ToolbarPlaceholderAction[]
}
