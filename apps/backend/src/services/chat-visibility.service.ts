import type { UUID } from '@shared'
import { getSessionPresence } from '@/services/room.service'

export function uniqueVisibleAudience(userIds: Array<UUID | undefined | null>): UUID[] {
  return Array.from(new Set(userIds.filter((userId): userId is UUID => Boolean(userId))))
}

export async function resolveRoomAudience(params: {
  sessionId: UUID
  roomId: UUID
  dmId: UUID
}): Promise<UUID[]> {
  const presence = await getSessionPresence(params.sessionId)

  return uniqueVisibleAudience([
    params.dmId,
    ...presence
      .filter((entry) => entry.primaryRoomId === params.roomId)
      .map((entry) => entry.userId as UUID),
  ])
}

export async function resolveTypingAudience(params: {
  sessionId: UUID
  roomId: UUID
  dmId: UUID
  requesterId: UUID
  requesterRole: string
}): Promise<UUID[]> {
  const presence = await getSessionPresence(params.sessionId)

  if (params.requesterRole !== 'DM') {
    const requesterPresence = presence.find((entry) => entry.userId === params.requesterId)
    if (!requesterPresence || requesterPresence.primaryRoomId !== params.roomId) {
      return [params.requesterId]
    }
  }

  return uniqueVisibleAudience([
    params.requesterId,
    params.dmId,
    ...presence
      .filter((entry) => entry.primaryRoomId === params.roomId)
      .map((entry) => entry.userId as UUID),
  ])
}
