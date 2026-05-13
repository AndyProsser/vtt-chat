import { PresenceState, RoomType } from '@shared'

export const ROOM_NAMES = {
  greenRoom: 'Green Room',
  mainRoom: 'Main Room',
} as const

export const ROOM_ROLE_LABELS = {
  dm: 'DM',
  player: 'PLAYER',
  spectator: 'SPECTATOR',
} as const

export const DEFAULT_AVATAR_META_LINES = {
  dm: 'Keeper of initiative, lore, and plausible deniability.',
  player: 'Adventurer',
} as const

export const ROOM_PRESENCE_COPY = {
  mainGroup: 'Main Group',
  otherGroups: 'Other Groups',
  noMembersInGroup: 'No members in this group.',
  noGroupsAvailable: 'No groups available.',
  noPlayers: 'No players',
  noMembers: 'No members',
  membersLabel: 'Members',
  presencePanelTitle: 'Presence and Rooms',
  presencePanelSubtitle: 'Live updates from room/presence websocket events.',
  totalTrackedUsersLabel: 'Total tracked users',
} as const

export const RADIAL_MENU_COPY = {
  move: 'Move',
  moveTo: 'Move To',
  condition: 'Condition',
  mute: 'Mute',
  unmute: 'Unmute',
  close: 'Close',
  back: 'Back',
  none: 'None',
  closePlayerActionsMenu: 'Close player actions menu',
  playerActions: 'Player actions',
  noOtherGroupsAvailable: 'No other groups available.',
} as const

const PRESENCE_DOT_CLASS_NAMES: Record<PresenceState, string> = {
  [PresenceState.ONLINE]: 'session-presence-dot-online',
  [PresenceState.SPEAKING]: 'session-presence-dot-speaking',
  [PresenceState.TYPING]: 'session-presence-dot-typing',
  [PresenceState.OFFLINE]: 'session-presence-dot-offline',
  [PresenceState.IDLE]: 'session-presence-dot-idle',
}

export function getPresenceDotClass(state: PresenceState): string {
  return PRESENCE_DOT_CLASS_NAMES[state] || PRESENCE_DOT_CLASS_NAMES[PresenceState.IDLE]
}

export function getPresenceLabel(
  state: PresenceState,
  options?: { idleAsOnline?: boolean }
): PresenceState {
  if (options?.idleAsOnline && state === PresenceState.IDLE) {
    return PresenceState.ONLINE
  }

  return state
}

export function getVoiceGroupPresenceState(state: PresenceState): PresenceState {
  return getPresenceLabel(state, { idleAsOnline: true })
}

export function isGreenRoomName(name: string): boolean {
  const normalized = name.trim().toLowerCase().replace(/\s+/g, ' ')
  return normalized === 'green room' || normalized === 'green-room'
}

export function formatRoomTypeLabel(type: RoomType): string {
  if (type === RoomType.MAIN) return ''
  if (type === RoomType.GROUP) return ''
  if (type === RoomType.PRIVATE) return 'Private'
  return type
}
