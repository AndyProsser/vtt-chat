import type { StateCreator } from 'zustand'
import type { UISlice } from './uiSlice'
import { createUISlice } from './uiSlice'

export type {
  ToolbarCenterPaneView,
  CenterPaneView,
  UISlice as CommandCenterSlice,
} from './uiSlice'

export const createCommandCenterSlice: StateCreator<UISlice> = (...args) => createUISlice(...args)
