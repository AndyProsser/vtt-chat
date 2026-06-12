import { randomUUID } from 'node:crypto'
import { createError, ErrorCode, PresenceState, RoomType } from '@shared'
import type { UUID } from '@shared'
import type { RealtimePresence, StoredRoom } from '@/types/room.types'
import {
  clearPresenceSnapshot,
  createRoomId,
  ensurePresenceRecoveredFromSnapshots,
  isGreenRoomStored,
  parsePresence,
  presenceHashKey,
  roomActivityKey,
  roomMembersKey,
  setPresencePrimaryRoom,
  toStoredRoom,
  upsertRealtimePresence,
} from './shared'
import { getRedisClient } from '@/infra/redis'
import {
  createRoomRecord,
  deleteRoomRecord,
  findRoomById,
  listPresenceSnapshotsBySession,
  listRoomsBySession,
} from '@/repositories/room.repository'

export async function createRoom(params: {
  sessionId: UUID
  name: string
  type: RoomType
  createdBy: UUID
}): Promise<StoredRoom> {
  const id = createRoomId()
  const createdAt = Date.now()

  await createRoomRecord({
    id,
    sessionId: params.sessionId,
    name: params.name,
    type: params.type as 'MAIN' | 'GROUP' | 'PRIVATE',
    createdBy: params.createdBy,
    createdAt: new Date(createdAt),
  })

  return {
    id,
    sessionId: params.sessionId,
    name: params.name,
    type: params.type,
    createdBy: params.createdBy,
    createdAt,
    updatedAt: createdAt,
  }
}

export async function getRoom(roomId: UUID): Promise<StoredRoom | null> {
  const room = await findRoomById(roomId)
  return room ? toStoredRoom(room) : null
}

export async function getRooms(sessionId: UUID): Promise<StoredRoom[]> {
  const rows = await listRoomsBySession(sessionId)
  return rows.map(toStoredRoom)
}

export async function getSessionPresence(sessionId: UUID): Promise<RealtimePresence[]> {
  await ensurePresenceRecoveredFromSnapshots(sessionId)

  const redis = await getRedisClient()
  const entries = await redis.hGetAll(presenceHashKey(sessionId))

  const values = Object.values(entries)
    .map((value) => parsePresence(value))
    .filter((presence): presence is RealtimePresence => presence !== null)

  if (values.length > 0) return values

  const snapshots = await listPresenceSnapshotsBySession(sessionId)
  return snapshots.map((snapshot) => ({
    sessionId: snapshot.sessionId as UUID,
    campaignId: snapshot.campaignId ? (snapshot.campaignId as UUID) : undefined,
    userId: snapshot.userId as UUID,
    username: snapshot.username,
    primaryRoomId: snapshot.primaryRoomId ? (snapshot.primaryRoomId as UUID) : undefined,
    privateRoomId: snapshot.privateRoomId ? (snapshot.privateRoomId as UUID) : undefined,
    ghost: false,
    state: snapshot.state as PresenceState,
    lastSeenAt: snapshot.lastSeenAt.getTime(),
  }))
}

export async function joinRoom(params: {
  sessionId: UUID
  roomId: UUID
  userId: UUID
  username: string
  state?: PresenceState
}): Promise<RealtimePresence | null> {
  const room = await findRoomById(params.roomId)
  if (!room || room.sessionId !== params.sessionId) {
    return null
  }

  await ensurePresenceRecoveredFromSnapshots(params.sessionId)

  const redis = await getRedisClient()
  const key = presenceHashKey(params.sessionId)
  const existingRaw = await redis.hGet(key, params.userId)
  const existing = existingRaw ? parsePresence(existingRaw) : null

  let previousGroupId = existing?.previousGroupId
  const targetIsGreenRoom = room.type === RoomType.GROUP && isGreenRoomStored({ name: room.name })

  if (targetIsGreenRoom) {
    previousGroupId = undefined
  } else if (room.type === RoomType.PRIVATE) {
    if (existing?.primaryRoomId && existing.primaryRoomId !== params.roomId) {
      const previousRoom = await findRoomById(existing.primaryRoomId)
      if (
        previousRoom &&
        previousRoom.type !== RoomType.PRIVATE &&
        !(previousRoom.type === RoomType.GROUP && isGreenRoomStored({ name: previousRoom.name }))
      ) {
        previousGroupId = existing.primaryRoomId
      }
    }
  } else {
    previousGroupId = params.roomId
  }

  if (existing?.primaryRoomId && existing.primaryRoomId !== params.roomId) {
    await redis.sRem(roomMembersKey(params.sessionId, existing.primaryRoomId), params.userId)
  }

  await redis.sAdd(roomMembersKey(params.sessionId, params.roomId), params.userId)

  const next: RealtimePresence = {
    sessionId: params.sessionId,
    campaignId: existing?.campaignId,
    userId: params.userId,
    username: params.username,
    primaryRoomId: params.roomId,
    previousGroupId,
    privateRoomId: existing?.privateRoomId,
    ghost: existing?.ghost || false,
    userMuted: existing?.userMuted || false,
    state: params.state || existing?.state || PresenceState.ONLINE,
    lastSeenAt: Date.now(),
  }

  await upsertRealtimePresence(next)
  return next
}

export async function leaveRoom(params: {
  sessionId: UUID
  roomId: UUID
  userId: UUID
  state?: PresenceState
}): Promise<RealtimePresence | null> {
  await ensurePresenceRecoveredFromSnapshots(params.sessionId)
  const redis = await getRedisClient()
  const key = presenceHashKey(params.sessionId)

  const existingRaw = await redis.hGet(key, params.userId)
  if (!existingRaw) {
    return null
  }

  const existing = parsePresence(existingRaw)
  if (!existing) {
    return null
  }

  await redis.sRem(roomMembersKey(params.sessionId, params.roomId), params.userId)

  const next: RealtimePresence = {
    ...existing,
    primaryRoomId: existing.primaryRoomId === params.roomId ? undefined : existing.primaryRoomId,
    previousGroupId: existing.previousGroupId,
    ghost: existing.ghost || false,
    state: params.state || existing.state,
    lastSeenAt: Date.now(),
  }

  await upsertRealtimePresence(next)
  return next
}

export async function updatePresenceState(params: {
  sessionId: UUID
  userId: UUID
  username: string
  state: PresenceState
  ghost?: boolean
  primaryRoomId?: UUID
  previousGroupId?: UUID | null
  privateRoomId?: UUID | null
  campaignId?: UUID
}): Promise<RealtimePresence> {
  await ensurePresenceRecoveredFromSnapshots(params.sessionId)
  const redis = await getRedisClient()
  const key = presenceHashKey(params.sessionId)

  const existingRaw = await redis.hGet(key, params.userId)
  const existing = existingRaw ? parsePresence(existingRaw) : null

  const next: RealtimePresence = {
    sessionId: params.sessionId,
    campaignId: params.campaignId || existing?.campaignId,
    userId: params.userId,
    username: params.username,
    userMuted: existing?.userMuted || false,
    primaryRoomId:
      params.primaryRoomId !== undefined ? params.primaryRoomId : (existing?.primaryRoomId as UUID),
    previousGroupId:
      params.previousGroupId !== undefined
        ? params.previousGroupId || undefined
        : (existing?.previousGroupId as UUID),
    privateRoomId:
      params.privateRoomId !== undefined
        ? params.privateRoomId || undefined
        : (existing?.privateRoomId as UUID),
    ghost: params.ghost !== undefined ? params.ghost : existing?.ghost || false,
    state: params.state,
    lastSeenAt: Date.now(),
  }

  await upsertRealtimePresence(next)
  return next
}

export async function getRoomMemberIds(sessionId: UUID, roomId: UUID): Promise<UUID[]> {
  const redis = await getRedisClient()
  const members = await redis.sMembers(roomMembersKey(sessionId, roomId))
  return members.map((member) => member as UUID)
}

export async function removePresenceProjection(params: {
  sessionId: UUID
  userId: UUID
}): Promise<void> {
  await clearPresenceSnapshot(params)
}

export async function deleteRoom(params: { sessionId: UUID; roomId: UUID }): Promise<void> {
  const room = await findRoomById(params.roomId)
  if (!room || room.sessionId !== params.sessionId) {
    return
  }

  const memberIds = await getRoomMemberIds(params.sessionId, params.roomId)
  if (memberIds.length > 0) {
    throw createError(ErrorCode.INVALID_INPUT, {
      message: 'Room must be empty before deleteRoom is called',
      context: {
        sessionId: params.sessionId,
        roomId: params.roomId,
        memberCount: memberIds.length,
      },
    })
  }

  const redis = await getRedisClient()
  await redis.del(roomMembersKey(params.sessionId, params.roomId))
  await deleteRoomRecord(params.roomId)
}

export async function closeRoom(params: {
  sessionId: UUID
  roomId: UUID
  mainRoomId: UUID
}): Promise<{ movedUsers: Array<{ userId: UUID; username: string }>; movedUserIds: UUID[] }> {
  const room = await findRoomById(params.roomId)
  if (!room || room.sessionId !== params.sessionId) {
    return { movedUsers: [], movedUserIds: [] }
  }

  const members = await getRoomMemberIds(params.sessionId, params.roomId)
  if (members.length === 0) {
    return { movedUsers: [], movedUserIds: [] }
  }

  const currentPresence = await getSessionPresence(params.sessionId)
  const presenceByUserId = new Map(currentPresence.map((entry) => [entry.userId, entry]))

  const movedUsers: Array<{ userId: UUID; username: string }> = []
  for (const memberId of members) {
    const presence = presenceByUserId.get(memberId)
    if (!presence) {
      continue
    }

    const movedPresence = await joinRoom({
      sessionId: params.sessionId,
      roomId: params.mainRoomId,
      userId: memberId,
      username: presence.username,
      state: presence.state,
    })

    if (!movedPresence) {
      continue
    }

    movedUsers.push({
      userId: memberId,
      username: presence.username,
    })
  }

  return {
    movedUsers,
    movedUserIds: movedUsers.map((entry) => entry.userId),
  }
}

export async function snapshotSessionPresence(sessionId: UUID): Promise<number> {
  const presence = await getSessionPresence(sessionId)
  for (const entry of presence) {
    await upsertRealtimePresence(entry)
  }
  return presence.length
}
