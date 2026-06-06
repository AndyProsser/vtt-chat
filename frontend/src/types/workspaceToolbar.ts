import type { ReactNode } from 'react'

export type WorkspaceToolbarStatusRow = {
  label: string
  value: string
  toneClassName?: string
}

export type WorkspaceToolbarProps = {
  className?: string
  dataTestId?: string
  dataUiComponent?: string
  dataUiState?: string
  brandAriaLabel?: string
  centerContent?: ReactNode
  extraActions?: ReactNode
  themeMode: 'light' | 'dark'
  onToggleTheme: () => void
  onOpenUserSettings: () => void
  onExit: () => void
  exitIcon: 'logout' | 'arrow_back'
  exitAriaLabel: string
  exitTooltipLabel: string
  // Connection status leaf (preferred) — isolated from parent re-renders
  connectionStatusLeaf?: ReactNode
  // Legacy connection status props (used only if connectionStatusLeaf not provided)
  connectionStatusColorKey?: string
  connectionStatusLabel?: string
  connectionStatusRows?: WorkspaceToolbarStatusRow[]
}
