import type { Role } from '@shared'

export type WorkspaceTab =
  | 'information'
  | 'party'
  | 'rooms'
  | 'journal'
  | 'notes'
  | 'history'
  | 'audio'
  | 'settings'

export function getTabsForRole(role: Role): WorkspaceTab[] {
  if (role === 'DM') {
    return ['information', 'party', 'rooms', 'journal', 'notes', 'history', 'audio', 'settings']
  }
  if (role === 'PLAYER') {
    return ['information', 'party', 'journal', 'notes', 'history', 'settings']
  }
  return ['information', 'journal', 'history']
}

export function getTabLabel(tab: WorkspaceTab): string {
  switch (tab) {
    case 'information':
      return 'Info'
    case 'party':
      return 'Party'
    case 'rooms':
      return 'Rooms'
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
      return 'Info'
  }
}

export function getTabIcon(
  tab: WorkspaceTab
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
