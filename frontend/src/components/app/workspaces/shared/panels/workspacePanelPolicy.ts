import { Role } from '@shared'
import type { WorkspacePanelTab } from '@/types/ui'

export const WORKSPACE_PANEL_CANONICAL_ORDER: WorkspacePanelTab[] = [
  'information',
  'party',
  'rooms',
  'journal',
  'notes',
  'history',
  'audio',
  'settings',
]

type WorkspacePanelRoleException = {
  hidden: WorkspacePanelTab[]
  rationale: string
}

// Explicitly documented exceptions keep screenshot labeling and naming deterministic.
export const WORKSPACE_PANEL_ROLE_EXCEPTIONS: Record<Role, WorkspacePanelRoleException> = {
  [Role.DM]: {
    hidden: [],
    rationale: 'DM sees the full canonical panel set.',
  },
  [Role.PLAYER]: {
    hidden: ['rooms', 'audio'],
    rationale: 'Player role cannot manage room topology or DM audio policy controls.',
  },
  [Role.SPECTATOR]: {
    hidden: ['party', 'rooms', 'notes', 'audio', 'settings'],
    rationale: 'Spectator role is observation-focused and excludes campaign mutation tools.',
  },
  [Role.SYSTEM]: {
    hidden: ['party', 'rooms', 'journal', 'notes', 'history', 'audio', 'settings'],
    rationale: 'System role only needs information panel access for diagnostics fallback.',
  },
}

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
