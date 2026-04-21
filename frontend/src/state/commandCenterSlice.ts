import type { StateCreator } from 'zustand'

export type ToolbarCenterPaneView = 'chat' | 'notes'

export interface CommandCenterSlice {
  toolbarCenterPaneView: ToolbarCenterPaneView
  toolbarRightRailOpen: boolean

  setToolbarCenterPaneView: (view: ToolbarCenterPaneView) => void
  setToolbarRightRailOpen: (open: boolean) => void
  toggleToolbarRightRail: () => void
  resetToolbarActionsState: () => void
}

const DEFAULT_CENTER_PANE_VIEW: ToolbarCenterPaneView = 'chat'
const DEFAULT_RIGHT_RAIL_OPEN = true

export const createCommandCenterSlice: StateCreator<CommandCenterSlice> = (set) => ({
  toolbarCenterPaneView: DEFAULT_CENTER_PANE_VIEW,
  toolbarRightRailOpen: DEFAULT_RIGHT_RAIL_OPEN,

  setToolbarCenterPaneView: (view) => set({ toolbarCenterPaneView: view }),

  setToolbarRightRailOpen: (open) => set({ toolbarRightRailOpen: open }),

  toggleToolbarRightRail: () =>
    set((state) => ({
      toolbarRightRailOpen: !state.toolbarRightRailOpen,
    })),

  resetToolbarActionsState: () =>
    set({
      toolbarCenterPaneView: DEFAULT_CENTER_PANE_VIEW,
      toolbarRightRailOpen: DEFAULT_RIGHT_RAIL_OPEN,
    }),
})
