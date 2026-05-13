import type { StateCreator } from 'zustand'
import type { UUID } from '@shared'
import type { CenterPaneView } from '@/types/ui'

export type ToolbarCenterPaneView = CenterPaneView
export type { CenterPaneView } from '@/types/ui'

export interface UISlice {
  toolbarCenterPaneView: ToolbarCenterPaneView
  toolbarRightRailOpen: boolean
  mockTakeoverUserIdBySession: Record<string, UUID | null>

  setToolbarCenterPaneView: (view: ToolbarCenterPaneView) => void
  setToolbarRightRailOpen: (open: boolean) => void
  toggleToolbarRightRail: () => void
  setMockTakeoverUserId: (sessionId: UUID, userId: UUID | null) => void
  resetToolbarActionsState: () => void
}

const DEFAULT_CENTER_PANE_VIEW: ToolbarCenterPaneView = 'chat'
const DEFAULT_RIGHT_RAIL_OPEN = false

export const createUISlice: StateCreator<UISlice> = (set) => ({
  toolbarCenterPaneView: DEFAULT_CENTER_PANE_VIEW,
  toolbarRightRailOpen: DEFAULT_RIGHT_RAIL_OPEN,
  mockTakeoverUserIdBySession: {},

  setToolbarCenterPaneView: (view) => set({ toolbarCenterPaneView: view }),

  setToolbarRightRailOpen: (open) => set({ toolbarRightRailOpen: open }),

  toggleToolbarRightRail: () =>
    set((state) => ({
      toolbarRightRailOpen: !state.toolbarRightRailOpen,
    })),

  setMockTakeoverUserId: (sessionId, userId) =>
    set((state) => ({
      mockTakeoverUserIdBySession: {
        ...state.mockTakeoverUserIdBySession,
        [sessionId]: userId,
      },
    })),

  resetToolbarActionsState: () =>
    set({
      toolbarCenterPaneView: DEFAULT_CENTER_PANE_VIEW,
      toolbarRightRailOpen: DEFAULT_RIGHT_RAIL_OPEN,
      mockTakeoverUserIdBySession: {},
    }),
})
