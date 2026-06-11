import { Role } from '@shared'
import type { WorkspacePanelTab } from '@/types/ui'

export const WORKSPACE_PANEL_CANONICAL_ORDER: WorkspacePanelTab[] = [
  'information',
  'party',
  'rooms',
  'journal',
  'notes',
  'history',
  'settings',
]

export type WorkspacePanelRoleException = {
  hidden: WorkspacePanelTab[]
  rationale: string
}

export const WORKSPACE_PANEL_ROLE_EXCEPTIONS: Record<Role, WorkspacePanelRoleException> = {
  [Role.DM]: {
    hidden: [],
    rationale: 'DM sees the full canonical panel set.',
  },
  [Role.PLAYER]: {
    hidden: ['rooms'],
    rationale: 'Player role cannot manage room topology controls.',
  },
  [Role.SPECTATOR]: {
    hidden: ['rooms', 'settings'],
    rationale: 'Spectator role is observation-focused and excludes mutation/control tools.',
  },
  [Role.SYSTEM]: {
    hidden: ['party', 'rooms', 'journal', 'notes', 'history', 'settings'],
    rationale: 'System role only needs information panel access for diagnostics fallback.',
  },
}
