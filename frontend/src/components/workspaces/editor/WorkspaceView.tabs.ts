import type { Role } from '@shared'
import {
  getWorkspacePanelIcon,
  getWorkspacePanelLabel,
  getWorkspacePanelTabsForRole,
} from '@/components/workspaces/shared/panels/workspacePanelPolicy'
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
): 'panel' | 'party' | 'rooms' | 'journal' | 'notes' | 'history' | 'voice' | 'settings' {
  return getWorkspacePanelIcon(tab)
}
