import type { ReactNode } from 'react'

export type WorkspaceTopbarStatusRow = {
  label: string
  value: string
  toneClassName?: string
}

export type WorkspaceTopbarProps = {
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
  connectionStatusColorKey: string
  connectionStatusLabel: string
  connectionStatusRows: WorkspaceTopbarStatusRow[]
}
