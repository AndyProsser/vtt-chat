import type { Role } from '@shared'

export type WorkspaceTab =
  | 'information'
  | 'notes'
  | 'journal'
  | 'history'
  | 'rooms'
  | 'audio'
  | 'settings'

export function getTabsForRole(role: Role): WorkspaceTab[] {
  if (role === 'DM') {
    return ['information', 'notes', 'journal', 'history', 'rooms', 'audio', 'settings']
  }
  if (role === 'PLAYER') {
    return ['information', 'notes', 'journal', 'history', 'settings']
  }
  return ['information', 'journal', 'history']
}

export function getTabLabel(tab: WorkspaceTab): string {
  switch (tab) {
    case 'information':
      return 'Info'
    case 'notes':
      return 'Notes'
    case 'journal':
      return 'Journal'
    case 'history':
      return 'History'
    case 'rooms':
      return 'Rooms'
    case 'audio':
      return 'Audio'
    case 'settings':
      return 'Settings'
    default:
      return 'Info'
  }
}

export function getTabIcon(
  tab: WorkspaceTab
): 'panel' | 'notes' | 'journal' | 'history' | 'rooms' | 'voice' | 'settings' {
  switch (tab) {
    case 'information':
      return 'panel'
    case 'notes':
      return 'notes'
    case 'journal':
      return 'journal'
    case 'history':
      return 'history'
    case 'rooms':
      return 'rooms'
    case 'audio':
      return 'voice'
    case 'settings':
      return 'settings'
    default:
      return 'panel'
  }
}
