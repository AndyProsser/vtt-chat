import { RoomType, PresenceState } from '@shared'
import type { UUID } from '@shared'
import { getRooms, getSessionPresence, joinRoom, updatePresenceState } from './membership.service'

export async function endWhisperBubbleForSession(params: {
  sessionId: UUID
  whisperRoomId: UUID
  fallbackRoomId: UUID
}): Promise<Array<{ userId: UUID; username: string; fromRoomId: UUID; toRoomId: UUID }>> {
  const rooms = await getRooms(params.sessionId)
  const validRoomIds = new Set(rooms.map((room) => room.id))

  const presence = await getSessionPresence(params.sessionId)
  const moved: Array<{ userId: UUID; username: string; fromRoomId: UUID; toRoomId: UUID }> = []

  for (const entry of presence) {
    if (entry.primaryRoomId !== params.whisperRoomId) {
      continue
    }

    const preferredTarget =
      entry.privateRoomId && validRoomIds.has(entry.privateRoomId) ? entry.privateRoomId : undefined
    const targetRoomId = preferredTarget || params.fallbackRoomId
    const updated = await joinRoom({
      sessionId: params.sessionId,
      roomId: targetRoomId,
      userId: entry.userId,
      username: entry.username,
      state: 'ONLINE' as PresenceState,
    })

    if (!updated) {
      continue
    }

    await updatePresenceState({
      sessionId: params.sessionId,
      userId: entry.userId,
      username: entry.username,
      state: updated.state,
      primaryRoomId: updated.primaryRoomId,
      privateRoomId: null,
      campaignId: updated.campaignId,
    })

    moved.push({
      userId: entry.userId,
      username: entry.username,
      fromRoomId: params.whisperRoomId,
      toRoomId: targetRoomId,
    })
  }

  return moved
}
