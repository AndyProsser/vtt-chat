import { Role } from '@shared'
import type { RoomUser } from '@/types/room'

export const EMPTY_ROOM_MEMBERS: RoomUser[] = []

export function compareMembers(left: RoomUser, right: RoomUser): number {
  if (left.role === Role.DM && right.role !== Role.DM) return -1
  if (right.role === Role.DM && left.role !== Role.DM) return 1
  return (left.characterName || left.playerName || left.username).localeCompare(
    right.characterName || right.playerName || right.username
  )
}

export function sortMembersIfNeeded(members: RoomUser[]): RoomUser[] {
  if (members.length < 2) return members
  const sorted = [...members].sort(compareMembers)
  for (let index = 0; index < sorted.length; index += 1) {
    if (sorted[index] !== members[index]) return sorted
  }
  return members
}
