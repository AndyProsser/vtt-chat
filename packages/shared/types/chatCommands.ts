/**
 * Chat Command Registry
 * Canonical source of truth for all slash commands.
 * Used by frontend (autocomplete, help popup, client-side validation) and
 * backend (server-side permission re-validation).
 */

import { Role, SessionState } from './index'

export type ChatCommandName = 'roll' | 'me' | 'whisper' | 'ooc' | 'dm' | 'loot-random'

export interface ChatCommandDefinition {
  name: ChatCommandName
  /** Displayable slash prefix, e.g. "/roll" */
  slash: string
  syntax: string
  description: string
  example: string
  roles: Role[]
  availableInStates: SessionState[]
}

export const CHAT_COMMANDS: ChatCommandDefinition[] = [
  {
    name: 'roll',
    slash: '/roll',
    syntax: '/roll [dice]',
    description: 'Roll dice. Results are resolved server-side and visible to everyone in the room.',
    example: '/roll 1d20+5',
    roles: [Role.DM, Role.PLAYER],
    availableInStates: [SessionState.ACTIVE],
  },
  {
    name: 'me',
    slash: '/me',
    syntax: '/me [action]',
    description: 'Send an in-character emote styled as italic action text.',
    example: '/me draws their sword',
    roles: [Role.DM, Role.PLAYER],
    availableInStates: [SessionState.ACTIVE],
  },
  {
    name: 'whisper',
    slash: '/whisper',
    syntax: '/whisper @{player} [message]',
    description: 'Whisper to a specific player. Same privacy rules as direct whisper.',
    example: '/whisper @Aria You notice the lock is already broken.',
    roles: [Role.DM, Role.PLAYER],
    availableInStates: [SessionState.ACTIVE],
  },
  {
    name: 'ooc',
    slash: '/OOC',
    syntax: '/OOC [message]',
    description: 'Send an out-of-character message regardless of the current IC/OOC mode toggle.',
    example: '/OOC brb two minutes',
    roles: [Role.DM, Role.PLAYER],
    availableInStates: [SessionState.ACTIVE, SessionState.PAUSED, SessionState.COOLDOWN],
  },
  {
    name: 'dm',
    slash: '/dm',
    syntax: '/dm [message]',
    description: 'Send a private message to the DM only. Other players cannot see it.',
    example: '/dm I want to pick the lock secretly',
    roles: [Role.PLAYER],
    availableInStates: [SessionState.ACTIVE],
  },
  {
    name: 'loot-random',
    slash: '/loot-random',
    syntax: '/loot-random [CR] [Rarity?] [hoard?]',
    description:
      'Generate random loot for combat using DMG treasure tables. CR sets the challenge tier; Rarity caps the magic item tier (mundane/common/uncommon/rare/very-rare/legendary/artifact); hoard multiplies loot 150–300%. Items and coins are added to the party inventory.',
    example: '/loot-random 8 rare hoard',
    roles: [Role.DM],
    availableInStates: [SessionState.ACTIVE],
  },
]

/** Lookup a command definition by its slash word (case-insensitive). */
export function findChatCommand(word: string): ChatCommandDefinition | undefined {
  const normalized = word.toLowerCase().replace(/^\//, '')
  return CHAT_COMMANDS.find((cmd) => cmd.name === normalized)
}

/** Filter commands visible to a given role. */
export function commandsForRole(role: Role): ChatCommandDefinition[] {
  return CHAT_COMMANDS.filter((cmd) => cmd.roles.includes(role))
}
