import { PresenceState, RoomType } from '@shared'
import type { UUID } from '@shared'
import { DEFAULT_PLAYER_META_LINE } from '../../constants/voiceGroup.constants'
import type { RoomParticipantStatus, RoomSelectorRoomWithParticipants } from './roomSelector.types'

export function getDisplayRoomName(room: RoomSelectorRoomWithParticipants): string {
  if (room.type === RoomType.MAIN && room.name.trim().toLowerCase() === 'main room') {
    return 'Main'
  }

  return room.name
}

export function getResolvedEnvironmentName(room: RoomSelectorRoomWithParticipants): string {
  return room.environmentName || 'Default'
}

export function getStatEntries(member: RoomParticipantStatus): Array<[string, unknown]> {
  const stats = member.characterStats
  if (!stats) {
    return []
  }

  const typedStats = stats as Record<string, unknown>
  const ordered: Array<[string, unknown]> = [
    ['STR', typedStats.str],
    ['DEX', typedStats.dex],
    ['CON', typedStats.con],
    ['INT', typedStats.int],
    ['WIS', typedStats.wis],
    ['CHA', typedStats.cha],
  ]

  return ordered.filter(([, value]) => value !== null && value !== undefined)
}

export function getParticipantMetaLine(
  member: RoomParticipantStatus,
  dmFlavorLine: string
): string {
  if (member.roleLabel === 'DM') {
    return dmFlavorLine
  }

  const parts = [
    member.characterClass?.trim(),
    typeof member.level === 'number' ? `Level ${member.level}` : undefined,
    member.characterRace?.trim(),
  ].filter((value): value is string => Boolean(value))

  return parts.length > 0 ? parts.join(' | ') : DEFAULT_PLAYER_META_LINE
}

export function getResolvedPresenceState(presenceState: PresenceState): PresenceState {
  return presenceState === PresenceState.IDLE ? PresenceState.OFFLINE : presenceState
}

export function getPresenceDotState(presenceState: PresenceState): 'online' | 'offline' {
  return getResolvedPresenceState(presenceState) === PresenceState.OFFLINE ? 'offline' : 'online'
}

export async function waitForRoomDeleteReconciled(options: {
  deletedRoomId: UUID
  sessionId: UUID
  syncSessionTopologyFromServer: () => Promise<void>
  getStoreState: () => {
    rooms: Record<UUID, Record<UUID, { id: UUID }>>
    sessionPresence: Record<UUID, Record<UUID, { primaryRoomId?: UUID }>>
  }
  maxWaitMs?: number
  pollIntervalMs?: number
}): Promise<void> {
  const {
    deletedRoomId,
    sessionId,
    syncSessionTopologyFromServer,
    getStoreState,
    maxWaitMs = 5000,
    pollIntervalMs = 150,
  } = options

  const maxAttempts = Math.ceil(maxWaitMs / pollIntervalMs)

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await syncSessionTopologyFromServer()

    const storeState = getStoreState()
    const sessionRooms = storeState.rooms[sessionId] || {}
    const roomStillExists = Boolean(sessionRooms[deletedRoomId])

    if (!roomStillExists) {
      const sessionPresence = storeState.sessionPresence[sessionId] || {}
      const anyUserStillPointingToDeletedRoom = Object.values(sessionPresence).some(
        (entry) => entry?.primaryRoomId === deletedRoomId
      )

      if (!anyUserStillPointingToDeletedRoom) {
        return
      }
    }

    await new Promise((resolve) => window.setTimeout(resolve, pollIntervalMs))
  }

  throw new Error('Group deletion is still reconciling. Please retry in a moment.')
}
