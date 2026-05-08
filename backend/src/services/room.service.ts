import { randomUUID } from 'crypto'
import { PresenceState, RoomType, SessionState } from '@shared'
import type { UUID } from '@shared'
import type {
  RealtimePresence,
  SessionRoomTransitionResult,
  SessionTransitionUser,
  StoredRoom,
} from '@/types/room.types'
import { getRedisClient } from '@/infra/redis'
import {
  createRoomRecord,
  deleteRoomRecord,
  findRoomById,
  listPresenceSnapshotsBySession,
  listRoomsBySession,
  upsertPresenceSnapshotRecord,
} from '@/repositories/room.repository'

const MAIN_ROOM_NAME = 'Main Room'
const GREEN_ROOM_NAME = 'Green Room'

function presenceHashKey(sessionId: UUID): string {
  return `presence:session:${sessionId}`
}

function roomMembersKey(sessionId: UUID, roomId: UUID): string {
  return `room:session:${sessionId}:${roomId}:members`
}

function roomActivityKey(sessionId: UUID): string {
  return `presence:session:${sessionId}:activity`
}

function parsePresence(raw: string): RealtimePresence | null {
  try {
    const parsed = JSON.parse(raw) as RealtimePresence
    if (!parsed || typeof parsed !== 'object' || !parsed.userId || !parsed.sessionId) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function toStoredRoom(row: {
  id: string
  sessionId: string
  name: string
  type: 'MAIN' | 'GROUP' | 'PRIVATE'
  createdBy: string
  createdAt: Date
  updatedAt: Date
}): StoredRoom {
  return {
    id: row.id as UUID,
    sessionId: row.sessionId as UUID,
    name: row.name,
    type: row.type as RoomType,
    createdBy: row.createdBy as UUID,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }
}

async function persistPresenceSnapshot(presence: RealtimePresence): Promise<void> {
  await upsertPresenceSnapshotRecord({
    sessionId: presence.sessionId,
    campaignId: presence.campaignId,
    userId: presence.userId,
    username: presence.username,
    primaryRoomId: presence.primaryRoomId,
    privateRoomId: presence.privateRoomId,
    state: presence.state,
    lastSeenAt: new Date(presence.lastSeenAt),
  })
}

export async function createRoom(params: {
  sessionId: UUID
  name: string
  type: RoomType
  createdBy: UUID
}): Promise<StoredRoom> {
  const id = randomUUID() as UUID
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

async function upsertRealtimePresence(presence: RealtimePresence): Promise<void> {
  const redis = await getRedisClient()
  await redis.hSet(presenceHashKey(presence.sessionId), presence.userId, JSON.stringify(presence))
  await redis.zAdd(roomActivityKey(presence.sessionId), {
    score: presence.lastSeenAt,
    value: presence.userId,
  })
  await persistPresenceSnapshot(presence)
}

export async function ensurePresenceRecoveredFromSnapshots(sessionId: UUID): Promise<boolean> {
  const redis = await getRedisClient()
  const key = presenceHashKey(sessionId)
  const size = await redis.hLen(key)
  if (size > 0) return false

  const snapshots = await listPresenceSnapshotsBySession(sessionId)
  if (snapshots.length === 0) return false

  for (const snapshot of snapshots) {
    const recovered: RealtimePresence = {
      sessionId: snapshot.sessionId as UUID,
      campaignId: snapshot.campaignId ? (snapshot.campaignId as UUID) : undefined,
      userId: snapshot.userId as UUID,
      username: snapshot.username,
      primaryRoomId: snapshot.primaryRoomId ? (snapshot.primaryRoomId as UUID) : undefined,
      privateRoomId: snapshot.privateRoomId ? (snapshot.privateRoomId as UUID) : undefined,
      // Redis failure recovery restores users as offline until they reconnect.
      state: PresenceState.OFFLINE,
      lastSeenAt: snapshot.lastSeenAt.getTime(),
    }

    await redis.hSet(key, recovered.userId, JSON.stringify(recovered))
    await redis.zAdd(roomActivityKey(sessionId), {
      score: recovered.lastSeenAt,
      value: recovered.userId,
    })

    if (recovered.primaryRoomId) {
      await redis.sAdd(roomMembersKey(sessionId, recovered.primaryRoomId), recovered.userId)
    }
  }

  return true
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
    privateRoomId: existing?.privateRoomId,
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
  primaryRoomId?: UUID
  privateRoomId?: UUID
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
    primaryRoomId:
      params.primaryRoomId !== undefined ? params.primaryRoomId : (existing?.primaryRoomId as UUID),
    privateRoomId:
      params.privateRoomId !== undefined ? params.privateRoomId : (existing?.privateRoomId as UUID),
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

export async function deleteRoom(params: { sessionId: UUID; roomId: UUID }): Promise<void> {
  const room = await findRoomById(params.roomId)
  if (!room || room.sessionId !== params.sessionId) {
    return
  }

  const redis = await getRedisClient()
  await redis.del(roomMembersKey(params.sessionId, params.roomId))
  await deleteRoomRecord(params.roomId)
}

export async function snapshotSessionPresence(sessionId: UUID): Promise<number> {
  const presence = await getSessionPresence(sessionId)
  for (const entry of presence) {
    await persistPresenceSnapshot(entry)
  }
  return presence.length
}

function normalizeRoomName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

async function ensureSessionDefaultRooms(params: {
  sessionId: UUID
  dmId: UUID
}): Promise<{ mainRoom: StoredRoom; greenRoom: StoredRoom }> {
  const existingRooms = await getRooms(params.sessionId)

  let mainRoom =
    existingRooms.find((room) => room.type === RoomType.MAIN) ||
    existingRooms.find((room) => normalizeRoomName(room.name) === normalizeRoomName(MAIN_ROOM_NAME))

  if (!mainRoom) {
    mainRoom = await createRoom({
      sessionId: params.sessionId,
      name: MAIN_ROOM_NAME,
      type: RoomType.MAIN,
      createdBy: params.dmId,
    })
  }

  const greenRoomNames = new Set(['green room', 'green-room'])
  let greenRoom = existingRooms.find((room) => greenRoomNames.has(normalizeRoomName(room.name)))

  if (!greenRoom) {
    greenRoom = await createRoom({
      sessionId: params.sessionId,
      name: GREEN_ROOM_NAME,
      type: RoomType.GROUP,
      createdBy: params.dmId,
    })
  }

  return { mainRoom, greenRoom }
}

export async function ensureSessionDefaultRoomsForSession(
  sessionId: UUID,
  dmId: UUID
): Promise<void> {
  await ensureSessionDefaultRooms({ sessionId, dmId })
}

export async function applySessionStateRoomTransition(params: {
  sessionId: UUID
  dmId: UUID
  nextState: SessionState
  users: SessionTransitionUser[]
}): Promise<SessionRoomTransitionResult> {
  const { mainRoom, greenRoom } = await ensureSessionDefaultRooms({
    sessionId: params.sessionId,
    dmId: params.dmId,
  })

  const toMainRoom = params.nextState === SessionState.ACTIVE
  const targetRoom = toMainRoom ? mainRoom : greenRoom
  const targetState =
    params.nextState === SessionState.ENDED
      ? PresenceState.OFFLINE
      : toMainRoom
        ? PresenceState.ONLINE
        : PresenceState.IDLE

  let movedUsers = 0
  for (const user of params.users) {
    const result = await joinRoom({
      sessionId: params.sessionId,
      roomId: targetRoom.id,
      userId: user.id,
      username: user.username,
      state: targetState,
    })

    if (result) movedUsers += 1
  }

  return {
    mainRoomId: mainRoom.id,
    mainRoomName: mainRoom.name,
    greenRoomId: greenRoom.id,
    greenRoomName: greenRoom.name,
    targetRoomId: targetRoom.id,
    targetRoomName: targetRoom.name,
    movedUsers,
    targetState,
  }
}
