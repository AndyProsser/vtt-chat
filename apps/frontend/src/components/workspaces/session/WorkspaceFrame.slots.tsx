import { memo, type ReactNode } from 'react'
import type { CenterPaneView, RightRailTab } from '@/types/ui'
import type { ToolbarActionModel } from '@/types/toolbar'

type LeftRailActions = {
  openRightRailTab: (tab: RightRailTab) => void
  openInformationPanel: () => void
}

export type ToolbarRenderFn = (model: ToolbarActionModel) => ReactNode
export type LeftRailRenderFn = (actions: LeftRailActions) => ReactNode
export type CenterPaneRenderFn = (view: CenterPaneView) => ReactNode

export const ToolbarSlot = memo(
  function ToolbarSlot({
    renderToolbar,
    toolbarModel,
  }: {
    renderToolbar: ToolbarRenderFn
    toolbarModel: ToolbarActionModel
  }) {
    return <>{renderToolbar(toolbarModel)}</>
  },
  (prev, next) =>
    prev.renderToolbar === next.renderToolbar && prev.toolbarModel === next.toolbarModel
)

export const LeftRailSlot = memo(
  function LeftRailSlot({
    renderLeftRail,
    leftRailActions,
  }: {
    renderLeftRail: LeftRailRenderFn
    leftRailActions: LeftRailActions
  }) {
    return <>{renderLeftRail(leftRailActions)}</>
  },
  (prev, next) =>
    prev.renderLeftRail === next.renderLeftRail && prev.leftRailActions === next.leftRailActions
)

export const CenterPaneSlot = memo(
  function CenterPaneSlot({
    renderCenterPane,
    view,
  }: {
    renderCenterPane: CenterPaneRenderFn
    view: CenterPaneView
  }) {
    return <>{renderCenterPane(view)}</>
  },
  (prev, next) => prev.renderCenterPane === next.renderCenterPane && prev.view === next.view
)

export function normalizeIndicatorCount(rawCount: number | undefined): number {
  if (!Number.isFinite(rawCount)) return 0
  return Math.max(0, Math.floor(rawCount ?? 0))
}

export function formatIndicatorCount(count: number): string {
  return count > 99 ? '99+' : String(count)
}
