import { randomUUID } from 'node:crypto'
import { getRedisClient } from '@/infra/redis'
import {
  deletePresenceSnapshotRecord,
  upsertPresenceSnapshotRecord,
} from '@/repositories/room.repository'
import { findRoomById, listPresenceSnapshotsBySession } from '@/repositories/room.repository'
import type { RealtimePresence, StoredRoom } from '@/types/room.types'
import type { PresenceState, RoomType } from '@shared'
import type { UUID } from '@shared'

export const MAIN_ROOM_NAME = 'Main'
export const GREEN_ROOM_NAME = 'Green Room'
export const WHISPER_ROOM_NAME = 'Whisper'

export function presenceHashKey(sessionId: UUID): string {
  return `presence:session:${sessionId}`
}

export function roomMembersKey(sessionId: UUID, roomId: UUID): string {
  return `room:session:${sessionId}:${roomId}:members`
}

export function roomActivityKey(sessionId: UUID): string {
  return `presence:session:${sessionId}:activity`
}

export function parsePresence(raw: string): RealtimePresence | null {
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

export function toStoredRoom(row: {
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

export function normalizeRoomName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function isGreenRoomStored(room: Pick<StoredRoom, 'name'>): boolean {
  const normalized = normalizeRoomName(room.name)
  return normalized === 'green room' || normalized === 'green-room'
}

export function isCampaignPersistentRoom(room: Pick<StoredRoom, 'name' | 'type'>): boolean {
  return room.type === 'GROUP' && !isGreenRoomStored(room)
}

export async function persistPresenceSnapshot(presence: RealtimePresence): Promise<void> {
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

export async function upsertRealtimePresence(presence: RealtimePresence): Promise<void> {
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
      state: 'OFFLINE' as PresenceState,
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

export async function setPresencePrimaryRoom(params: {
  sessionId: UUID
  userId: UUID
  roomId: UUID | undefined
}): Promise<void> {
  const redis = await getRedisClient()
  const key = presenceHashKey(params.sessionId)
  const existingRaw = await redis.hGet(key, params.userId)
  const existing = existingRaw ? parsePresence(existingRaw) : null

  if (existing?.primaryRoomId && existing.primaryRoomId !== params.roomId) {
    await redis.sRem(roomMembersKey(params.sessionId, existing.primaryRoomId), params.userId)
  }

  if (params.roomId) {
    await redis.sAdd(roomMembersKey(params.sessionId, params.roomId), params.userId)
  }
}

export async function clearPresenceSnapshot(params: {
  sessionId: UUID
  userId: UUID
}): Promise<void> {
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

export function createRoomId(): UUID {
  return randomUUID() as UUID
}
