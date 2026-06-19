import type { Role } from '@shared'
import {
  getWorkspacePanelIcon,
  getWorkspacePanelLabel,
  getWorkspacePanelTabsForRole,
} from '@/utils/workspacePanelPolicy'
import type { WorkspacePanelTab } from '@/types/ui'

export type WorkspaceTab = WorkspacePanelTab

export function getTabsForRole(role: Role): WorkspaceTab[] {
  return getWorkspacePanelTabsForRole(role)
}

export function getTabLabel(tab: WorkspaceTab): string {
  return getWorkspacePanelLabel(tab)
}

export function getTabIcon(
  tab: WorkspaceTab
): 'panel' | 'party' | 'inventory' | 'rooms' | 'journal' | 'notes' | 'history' | 'voice' | 'settings' {
  return getWorkspacePanelIcon(tab)
}
