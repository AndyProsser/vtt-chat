import { Role } from '@shared'
import {
  WORKSPACE_PANEL_CANONICAL_ORDER,
  WORKSPACE_PANEL_ROLE_EXCEPTIONS,
} from '@/constants/workspacePanelPolicy.constants'
import type { WorkspacePanelTab } from '@/types/ui'

export function getWorkspacePanelTabsForRole(role: Role): WorkspacePanelTab[] {
  const exception = WORKSPACE_PANEL_ROLE_EXCEPTIONS[role]
  if (!exception) {
    return ['information']
  }

  const hiddenSet = new Set(exception.hidden)
  return WORKSPACE_PANEL_CANONICAL_ORDER.filter((tab) => !hiddenSet.has(tab))
}

export function getWorkspacePanelLabel(tab: WorkspacePanelTab): string {
  switch (tab) {
    case 'information':
      return 'Information'
    case 'party':
      return 'Party'
    case 'rooms':
      return 'Groups'
    case 'journal':
      return 'Journal'
    case 'notes':
      return 'Notes'
    case 'history':
      return 'History'
    case 'audio':
      return 'Audio'
    case 'settings':
      return 'Settings'
    default:
      return 'Information'
  }
}

export function getWorkspacePanelIcon(
  tab: WorkspacePanelTab
): 'panel' | 'party' | 'rooms' | 'journal' | 'notes' | 'history' | 'voice' | 'settings' {
  switch (tab) {
    case 'information':
      return 'panel'
    case 'party':
      return 'party'
    case 'rooms':
      return 'rooms'
    case 'journal':
      return 'journal'
    case 'notes':
      return 'notes'
    case 'history':
      return 'history'
    case 'audio':
      return 'voice'
    case 'settings':
      return 'settings'
    default:
      return 'panel'
  }
}
