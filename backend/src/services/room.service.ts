import { randomUUID } from 'node:crypto'
import { createError, ErrorCode, PresenceState, RoomType, SessionState } from '@shared'
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
  deletePresenceSnapshotRecord,
  deleteRoomRecord,
  findRoomById,
  listPresenceSnapshotsBySession,
  listRoomsBySession,
  upsertPresenceSnapshotRecord,
} from '@/repositories/room.repository'
import {
  listAudioRoomStateBySession,
  removeAudioRoomStateRecord,
  upsertAudioRoomStateRecord,
} from '@/repositories/audio.repository'
import { findSessionById, listSessionsByCampaign } from '@/repositories/session.repository'

const MAIN_ROOM_NAME = 'Main Room'
const GREEN_ROOM_NAME = 'Green Room'
const WHISPER_ROOM_NAME = 'Whisper'

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
      ghost: false,
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
    // Current non-greenroom group is the restorable target for the next whisper hop.
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
  await ensurePresenceRecoveredFromSnapshots(params.sessionId)

  const redis = await getRedisClient()
  const key = presenceHashKey(params.sessionId)
  const existingRaw = await redis.hGet(key, params.userId)
  const existing = existingRaw ? parsePresence(existingRaw) : null

  if (existing?.primaryRoomId) {
    await redis.sRem(roomMembersKey(params.sessionId, existing.primaryRoomId), params.userId)
  }

  await redis.hDel(key, params.userId)
  await redis.zRem(roomActivityKey(params.sessionId), params.userId)
  await deletePresenceSnapshotRecord({
    sessionId: params.sessionId,
    userId: params.userId,
  })
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
    await persistPresenceSnapshot(entry)
  }
  return presence.length
}

function normalizeRoomName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function isGreenRoomStored(room: Pick<StoredRoom, 'name'>): boolean {
  const normalized = normalizeRoomName(room.name)
  return normalized === 'green room' || normalized === 'green-room'
}

function isCampaignPersistentRoom(room: Pick<StoredRoom, 'name' | 'type'>): boolean {
  return room.type === RoomType.GROUP && !isGreenRoomStored(room)
}

async function restoreCampaignRoomsForSession(params: {
  sessionId: UUID
  dmId: UUID
  existingRooms: StoredRoom[]
}): Promise<void> {
  const session = await findSessionById(params.sessionId)
  if (!session?.campaignId) {
    return
  }

  const existingNames = new Set(
    params.existingRooms
      .filter(isCampaignPersistentRoom)
      .map((room) => normalizeRoomName(room.name))
  )

  const campaignSessions = await listSessionsByCampaign(session.campaignId)
  const previousSession = campaignSessions.find((entry) => entry.id !== params.sessionId)
  if (!previousSession) {
    return
  }

  const [previousRooms, previousEnvironmentStates] = await Promise.all([
    listRoomsBySession(previousSession.id),
    listAudioRoomStateBySession(previousSession.id),
  ])

  const previousEnvironmentByRoomId = new Map(
    previousEnvironmentStates.map((entry) => [entry.roomId, entry])
  )

  for (const previousRoom of previousRooms.map(toStoredRoom)) {
    if (!isCampaignPersistentRoom(previousRoom)) {
      continue
    }

    const normalizedName = normalizeRoomName(previousRoom.name)
    if (existingNames.has(normalizedName)) {
      continue
    }

    const restoredRoom = await createRoom({
      sessionId: params.sessionId,
      name: previousRoom.name,
      type: previousRoom.type,
      createdBy: params.dmId,
    })
    existingNames.add(normalizedName)

    const previousEnvironment = previousEnvironmentByRoomId.get(previousRoom.id)
    if (!previousEnvironment) {
      continue
    }

    await upsertAudioRoomStateRecord({
      sessionId: params.sessionId,
      roomId: restoredRoom.id,
      environmentName: previousEnvironment.environmentName,
      environmentId: previousEnvironment.environmentId,
      parameters:
        previousEnvironment.parameters && typeof previousEnvironment.parameters === 'object'
          ? (previousEnvironment.parameters as Record<string, unknown>)
          : {},
      setBy: previousEnvironment.setBy,
      setAt: previousEnvironment.setAt,
    })
  }
}

async function ensureSessionDefaultRooms(params: {
  sessionId: UUID
  dmId: UUID
}): Promise<{ mainRoom: StoredRoom; greenRoom: StoredRoom }> {
  let existingRooms = await getRooms(params.sessionId)

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
    existingRooms = [...existingRooms, mainRoom]
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
    existingRooms = [...existingRooms, greenRoom]
  }

  await restoreCampaignRoomsForSession({
    sessionId: params.sessionId,
    dmId: params.dmId,
    existingRooms,
  })

  const hydratedRooms = await getRooms(params.sessionId)
  return {
    mainRoom:
      hydratedRooms.find((room) => room.type === RoomType.MAIN) ||
      hydratedRooms.find(
        (room) => normalizeRoomName(room.name) === normalizeRoomName(MAIN_ROOM_NAME)
      ) ||
      mainRoom,
    greenRoom: hydratedRooms.find((room) => isGreenRoomStored(room)) || greenRoom,
  }
}

export async function ensureSessionDefaultRoomsForSession(
  sessionId: UUID,
  dmId: UUID
): Promise<void> {
  await ensureSessionDefaultRooms({ sessionId, dmId })
}

export async function ensureSessionWhisperRoomForSession(
  sessionId: UUID,
  dmId: UUID
): Promise<StoredRoom> {
  const rooms = await getRooms(sessionId)
  const existingPrivate = rooms.find((room) => room.type === RoomType.PRIVATE)
  if (existingPrivate) {
    return existingPrivate
  }

  return createRoom({
    sessionId,
    name: WHISPER_ROOM_NAME,
    type: RoomType.PRIVATE,
    createdBy: dmId,
  })
}

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
      state: PresenceState.ONLINE,
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

export async function deletePrivateRoomsForEndedSession(sessionId: UUID): Promise<StoredRoom[]> {
  const rooms = await getRooms(sessionId)
  const privateRooms = rooms.filter((room) => room.type === RoomType.PRIVATE)
  if (!privateRooms.length) {
    return []
  }

  const redis = await getRedisClient()
  for (const room of privateRooms) {
    await redis.del(roomMembersKey(sessionId, room.id))
    await removeAudioRoomStateRecord({ sessionId, roomId: room.id })
    await deleteRoomRecord(room.id)
  }

  return privateRooms
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

  if (params.nextState === SessionState.ACTIVE || params.nextState === SessionState.PAUSED) {
    await ensureSessionWhisperRoomForSession(params.sessionId, params.dmId)
  }

  const toMainRoom =
    params.nextState === SessionState.ACTIVE || params.nextState === SessionState.PAUSED
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

    if (result) {
      await updatePresenceState({
        sessionId: params.sessionId,
        userId: user.id,
        username: user.username,
        state: targetState,
        primaryRoomId: targetRoom.id,
        privateRoomId: null,
        campaignId: result.campaignId,
      })
      movedUsers += 1
    }
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
