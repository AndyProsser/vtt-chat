import { PresenceState, RoomType, SessionState } from '@shared'
import type { UUID } from '@shared'
import {
  listAudioRoomStateBySession,
  removeAudioRoomStateRecord,
  upsertAudioRoomStateRecord,
} from '@/repositories/audio.repository'
import { findSessionById, listSessionsByCampaign } from '@/repositories/session.repository'
import {
  getSessionPresence,
  getRooms,
  createRoom,
  joinRoom,
  updatePresenceState,
} from './membership.service'
import {
  GREEN_ROOM_NAME,
  MAIN_ROOM_NAME,
  isCampaignPersistentRoom,
  isGreenRoomStored,
  normalizeRoomName,
  toStoredRoom,
} from './shared'

function isRestorablePauseRoom(room: { name: string; type: RoomType } | null | undefined): boolean {
  if (!room) {
    return false
  }

  return room.type !== RoomType.PRIVATE && !isGreenRoomStored({ name: room.name })
}

function resolvePausePreviousGroupId(params: {
  currentPresence?: { primaryRoomId?: UUID; previousGroupId?: UUID }
  currentRoom?: { id: UUID; name: string; type: RoomType }
  roomById: Map<UUID, { id: UUID; name: string; type: RoomType }>
}): UUID | undefined {
  const { currentPresence, currentRoom, roomById } = params
  if (!currentPresence) {
    return undefined
  }

  if (currentRoom?.type === RoomType.PRIVATE) {
    const previousRoom = currentPresence.previousGroupId
      ? roomById.get(currentPresence.previousGroupId)
      : undefined
    return isRestorablePauseRoom(previousRoom) ? currentPresence.previousGroupId : undefined
  }

  if (currentPresence.primaryRoomId && currentRoom && isRestorablePauseRoom(currentRoom)) {
    return currentPresence.primaryRoomId
  }

  return undefined
}

async function restoreCampaignRoomsForSession(params: {
  sessionId: UUID
  dmId: UUID
  existingRooms: Array<{ id: UUID; name: string; type: RoomType }>
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
    getRooms(previousSession.id as UUID),
    listAudioRoomStateBySession(previousSession.id),
  ])

  const previousEnvironmentByRoomId = new Map(
    previousEnvironmentStates.map((entry) => [entry.roomId, entry])
  )

  for (const previousRoom of previousRooms) {
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

async function ensureSessionDefaultRooms(params: { sessionId: UUID; dmId: UUID }): Promise<{
  mainRoom: Awaited<ReturnType<typeof createRoom>>
  greenRoom: Awaited<ReturnType<typeof createRoom>>
}> {
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

  let greenRoom = existingRooms.find((room) => isGreenRoomStored(room))

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

export async function ensureSessionWhisperRoomForSession(sessionId: UUID, dmId: UUID) {
  const rooms = await getRooms(sessionId)
  const existingPrivate = rooms.find((room) => room.type === RoomType.PRIVATE)
  if (existingPrivate) {
    return existingPrivate
  }

  return createRoom({
    sessionId,
    name: 'Whisper',
    type: RoomType.PRIVATE,
    createdBy: dmId,
  })
}

export async function deletePrivateRoomsForEndedSession(sessionId: UUID) {
  const rooms = await getRooms(sessionId)
  const privateRooms = rooms.filter((room) => room.type === RoomType.PRIVATE)
  if (!privateRooms.length) {
    return []
  }

  const redis = await (await import('@/infra/redis')).getRedisClient()
  for (const room of privateRooms) {
    if (redis) {
      await redis.del(`room:session:${sessionId}:${room.id}:members`)
    }
    await removeAudioRoomStateRecord({ sessionId, roomId: room.id })
    await (await import('@/repositories/room.repository')).deleteRoomRecord(room.id)
  }

  return privateRooms
}

export async function applySessionStateRoomTransition(params: {
  sessionId: UUID
  dmId: UUID
  previousState?: SessionState | null
  nextState: SessionState
  users: Array<{ id: UUID; username: string }>
}) {
  const { mainRoom, greenRoom } = await ensureSessionDefaultRooms({
    sessionId: params.sessionId,
    dmId: params.dmId,
  })

  if (params.nextState === SessionState.ACTIVE || params.nextState === SessionState.PAUSED) {
    await ensureSessionWhisperRoomForSession(params.sessionId, params.dmId)
  }

  const rooms = await getRooms(params.sessionId)
  const roomById = new Map(rooms.map((room) => [room.id, room]))
  const presence = await getSessionPresence(params.sessionId)
  const presenceByUserId = new Map(presence.map((entry) => [entry.userId, entry]))

  // ACTIVE and PAUSED: users move to MAIN room (live session).
  // COOLDOWN: users stay in MAIN room (post-game wind-down; OOC chat enabled).
  // All other states (ENDED, CLEANUP, IDLE): users move to greenroom.
  const toMainRoom =
    params.nextState === SessionState.ACTIVE ||
    params.nextState === SessionState.PAUSED ||
    params.nextState === SessionState.COOLDOWN
  const targetRoom = toMainRoom ? mainRoom : greenRoom
  // Keep session members online through ENDED/CLEANUP/IDLE staging so presence
  // and speaking indicators remain live until explicit disconnect/leave flows.
  const targetState = PresenceState.ONLINE
  const transitionUsers = new Map<UUID, { id: UUID; username: string }>()

  for (const user of params.users) {
    transitionUsers.set(user.id, user)
  }

  for (const entry of presence) {
    if (!transitionUsers.has(entry.userId)) {
      transitionUsers.set(entry.userId, {
        id: entry.userId,
        username: entry.username,
      })
    }
  }

  const isResumeFromPause =
    params.previousState === SessionState.PAUSED && params.nextState === SessionState.ACTIVE

  let movedUsers = 0
  const transitionedUsers: Array<{
    id: UUID
    username: string
    roomId: UUID
    roomName: string
    previousGroupId?: UUID
  }> = []

  for (const user of transitionUsers.values()) {
    const currentPresence = presenceByUserId.get(user.id)
    const currentRoom = currentPresence?.primaryRoomId
      ? roomById.get(currentPresence.primaryRoomId)
      : undefined

    const nextPreviousGroupId: UUID | null | undefined =
      params.nextState === SessionState.PAUSED
        ? resolvePausePreviousGroupId({
            currentPresence,
            currentRoom,
            roomById,
          })
        : isResumeFromPause
          ? currentPresence?.previousGroupId
          : params.nextState === SessionState.ACTIVE
            ? undefined
            : null

    const restoredRoom =
      isResumeFromPause && nextPreviousGroupId ? roomById.get(nextPreviousGroupId) : undefined
    const nextRoom: typeof targetRoom =
      restoredRoom && isRestorablePauseRoom(restoredRoom) ? restoredRoom : targetRoom

    const result = await joinRoom({
      sessionId: params.sessionId,
      roomId: nextRoom.id,
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
        primaryRoomId: nextRoom.id,
        previousGroupId: nextPreviousGroupId,
        privateRoomId: null,
        campaignId: result.campaignId,
      })
      transitionedUsers.push({
        id: user.id,
        username: user.username,
        roomId: nextRoom.id,
        roomName: nextRoom.name,
        previousGroupId: nextPreviousGroupId || undefined,
      })
      movedUsers += 1
    }
  }

  const distinctTargetRoomIds = new Set(transitionedUsers.map((user) => user.roomId))
  const primaryTargetRoom =
    distinctTargetRoomIds.size === 1
      ? roomById.get(transitionedUsers[0]?.roomId ?? targetRoom.id) || targetRoom
      : targetRoom

  return {
    mainRoomId: mainRoom.id,
    mainRoomName: mainRoom.name,
    greenRoomId: greenRoom.id,
    greenRoomName: greenRoom.name,
    targetRoomId: primaryTargetRoom.id,
    targetRoomName: primaryTargetRoom.name,
    movedUsers,
    users: transitionedUsers,
    targetState,
  }
}
