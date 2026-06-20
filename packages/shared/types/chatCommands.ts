/**
 * Chat Command Registry
 * Canonical source of truth for all slash commands.
 * Used by frontend (autocomplete, help popup, client-side validation) and
 * backend (server-side permission re-validation).
 */

import { Role, SessionState } from './index'

export type ChatCommandName =
  | 'roll'
  | 'me'
  | 'ic'
  | 'ooc'
  | 'whisper'
  | 'dm'
  | 'take'
  | 'give'
  | 'drop'
  | 'spend'
  | 'earn'
  | 'loot'
  | 'loot-split'
  | 'loot-random'

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
    name: 'ic',
    slash: '/ic',
    syntax: '/ic [message]',
    description: 'Send an in-character message regardless of the current IC/OOC mode toggle.',
    example: '/ic I draw my sword and advance.',
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
    name: 'dm',
    slash: '/dm',
    syntax: '/dm [message]',
    description: 'Send a private message to the DM only. Other players cannot see it.',
    example: '/dm I want to pick the lock secretly',
    roles: [Role.PLAYER],
    availableInStates: [SessionState.ACTIVE, SessionState.PAUSED],
  },
  {
    name: 'give',
    slash: '/give',
    syntax: '/give @{party|player} [item name] [qty?]',
    description:
      'Give an item from your inventory to the party or another player. Requires the /give campaign permission.',
    example: '/give @party Torch 5',
    roles: [Role.DM, Role.PLAYER],
    availableInStates: [
      SessionState.IDLE,
      SessionState.ACTIVE,
      SessionState.PAUSED,
      SessionState.COOLDOWN,
      SessionState.ENDED,
    ],
  },
  {
    name: 'take',
    slash: '/take',
    syntax: '/take [item name] [qty?]',
    description:
      'Take an item from the party inventory into your own. Quantity defaults to 1. Requires the /take campaign permission.',
    example: '/take Potion of Healing',
    roles: [Role.PLAYER],
    availableInStates: [
      SessionState.IDLE,
      SessionState.ACTIVE,
      SessionState.PAUSED,
      SessionState.COOLDOWN,
      SessionState.ENDED,
    ],
  },
  {
    name: 'drop',
    slash: '/drop',
    syntax: '/drop [item name] [qty?]',
    description:
      'Remove an item from your inventory. Quantity defaults to all. Requires confirmation.',
    example: '/drop Broken Arrow 3',
    roles: [Role.DM, Role.PLAYER],
    availableInStates: [
      SessionState.IDLE,
      SessionState.ACTIVE,
      SessionState.PAUSED,
      SessionState.COOLDOWN,
      SessionState.ENDED,
    ],
  },
  {
    name: 'spend',
    slash: '/spend',
    syntax: '/spend [currency]',
    description:
      'Spend coins from your own wallet (character if player, party purse if DM). Cannot spend more than you have — attempting to do so produces a public dry-humor message.',
    example: '/spend 1gp 3sp 33cp',
    roles: [Role.DM, Role.PLAYER],
    availableInStates: [
      SessionState.ACTIVE,
      SessionState.PAUSED,
      SessionState.COOLDOWN,
      SessionState.ENDED,
    ],
  },
  {
    name: 'earn',
    slash: '/earn',
    syntax: '/earn [currency]',
    description:
      "Credit coins to your own wallet (character if player, party purse if DM). Use for shop sales, individual rewards, or any inflow that isn't a shared loot drop.",
    example: '/earn 10gp 35sp',
    roles: [Role.DM, Role.PLAYER],
    availableInStates: [
      SessionState.ACTIVE,
      SessionState.PAUSED,
      SessionState.COOLDOWN,
      SessionState.ENDED,
    ],
  },
  {
    name: 'loot',
    slash: '/loot',
    syntax: '/loot [items] — comma-separated list',
    description:
      'Add items and/or currency to the party inventory in one command. Each comma-separated entry can be a currency amount (25gp, 3sp), an item with leading quantity (3x daggers), trailing quantity (dart x5), or a plain name (Shortsword). Values in parentheses are notes, not parsed as currency. SRD items are auto-matched.',
    example: '/loot 25gp, 3x daggers, Potion of Healing, 2x gems (25gp), dart x5',
    roles: [Role.DM],
    availableInStates: [
      SessionState.ACTIVE,
      SessionState.PAUSED,
      SessionState.COOLDOWN,
      SessionState.ENDED,
    ],
  },
  {
    name: 'loot-split',
    slash: '/loot-split',
    syntax: '/loot-split [item name] [qty?]',
    description:
      'Propose an equal split of a party inventory item among all connected players. Each player receives a 60-second Accept prompt in chat. Unaccepted shares are not transferred.',
    example: '/loot-split Potion of Healing 4',
    roles: [Role.DM],
    availableInStates: [
      SessionState.ACTIVE,
      SessionState.PAUSED,
      SessionState.COOLDOWN,
      SessionState.ENDED,
    ],
  },
  {
    name: 'loot-random',
    slash: '/loot-random',
    syntax: '/loot-random [CR] [Rarity?] [hoard?]',
    description:
      'Generate random loot for combat using DMG treasure tables. CR sets the challenge tier; Rarity caps the magic item tier (mundane/common/uncommon/rare/very-rare/legendary/artifact); hoard multiplies loot 150–300%. Items and coins are added to the party inventory.',
    example: '/loot-random 8 rare hoard',
    roles: [Role.DM],
    availableInStates: [
      SessionState.ACTIVE,
      SessionState.PAUSED,
      SessionState.COOLDOWN,
      SessionState.ENDED,
    ],
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
