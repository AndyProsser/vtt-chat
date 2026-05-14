import { randomUUID } from 'node:crypto'
import { sendMessage } from '@/services/chat.service'
import { DEV_MOCK_CHAT_MESSAGES } from '@/constants/dev-mock-chat-messages.constants'
import {
  DEV_MOCK_MESSAGE_WINDOW_MS,
  DEV_MOCK_PREFIX,
  MAX_DEV_MOCK_SIMULATOR_COUNT,
  MIN_DEV_MOCK_SIMULATOR_COUNT,
} from '@/constants/dev-mock.constants'
import { getSession } from '@/services/session.service'
import {
  getSessionPresence,
  getRooms,
  joinRoom,
  leaveRoom,
  updatePresenceState,
} from '@/services/room.service'
import { MessageType, PresenceState, Role, RoomType } from '@shared'
import type { EventEnvelope, UUID } from '@shared'
import eventBroadcaster from '@/services/event-broadcaster.service'
import type { StoredMessage } from '@/types/chat.types'

export interface MockSimulationConfig {
  speakingSimulatorEnabled: boolean
  chatSimulatorEnabled: boolean
  disconnectSimulatorEnabled: boolean
  playerCount: number
}

interface MockSimulationRuntime {
  config: MockSimulationConfig
  isRunning: boolean
  startedAt: number
  tickTimer: ReturnType<typeof setInterval> | null
  speakingNow: Set<UUID>
  typingNow: Set<UUID>
  disconnectedByUserId: Map<UUID, DisconnectedMockState>
  messageSentAtByType: {
    IC: number[]
    OOC: number[]
    WHISPER: number[]
  }
}

interface MockPresenceUser {
  userId: UUID
  username: string
  primaryRoomId?: UUID
  state: PresenceState
}

interface DisconnectedMockState {
  username: string
  previousRoomId?: UUID
  reconnectAt: number
}

const runtimeBySession = new Map<UUID, MockSimulationRuntime>()

function defaultConfig(): MockSimulationConfig {
  return {
    speakingSimulatorEnabled: true,
    chatSimulatorEnabled: false,
    disconnectSimulatorEnabled: false,
    playerCount: 8,
  }
}

function clampPlayerCount(value: number): number {
  if (!Number.isFinite(value)) {
    return defaultConfig().playerCount
  }

  return Math.max(
    MIN_DEV_MOCK_SIMULATOR_COUNT,
    Math.min(MAX_DEV_MOCK_SIMULATOR_COUNT, Math.floor(value))
  )
}

function pickRandomUsers(userIds: UUID[], maxCount: number): UUID[] {
  if (userIds.length === 0 || maxCount <= 0) {
    return []
  }

  const shuffled = [...userIds]
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = shuffled[i]
    shuffled[i] = shuffled[j]
    shuffled[j] = tmp
  }

  return shuffled.slice(0, Math.min(maxCount, shuffled.length))
}

function getOrCreateRuntime(sessionId: UUID): MockSimulationRuntime {
  const existing = runtimeBySession.get(sessionId)
  if (existing) {
    return existing
  }

  const runtime: MockSimulationRuntime = {
    config: defaultConfig(),
    isRunning: false,
    startedAt: Date.now(),
    tickTimer: null,
    speakingNow: new Set<UUID>(),
    typingNow: new Set<UUID>(),
    disconnectedByUserId: new Map<UUID, DisconnectedMockState>(),
    messageSentAtByType: {
      IC: [],
      OOC: [],
      WHISPER: [],
    },
  }

  runtimeBySession.set(sessionId, runtime)
  return runtime
}

function shouldRun(config: MockSimulationConfig): boolean {
  return (
    config.speakingSimulatorEnabled ||
    config.chatSimulatorEnabled ||
    config.disconnectSimulatorEnabled
  )
}

function broadcastEvent(sessionId: UUID, event: EventEnvelope, visibleTo?: UUID[]): void {
  if (!eventBroadcaster.isReady()) {
    return
  }

  eventBroadcaster.broadcastToSession(sessionId, event, visibleTo)
}

function isGreenRoomName(name: string): boolean {
  const normalized = name.trim().toLowerCase().replace(/\s+/g, ' ')
  return normalized === 'green room' || normalized === 'green-room'
}

function broadcastTypingStarted(sessionId: UUID, user: MockPresenceUser): void {
  const now = Date.now()
  broadcastEvent(sessionId, {
    id: randomUUID() as UUID,
    type: 'CHAT:TYPING_STARTED',
    version: 1,
    userId: user.userId,
    userRole: Role.PLAYER,
    sessionId,
    roomId: user.primaryRoomId || null,
    timestamp: now,
    payload: {
      userId: user.userId,
      username: user.username,
      roomId: user.primaryRoomId,
      startedAt: now,
    },
  })
}

function broadcastTypingStopped(sessionId: UUID, user: MockPresenceUser): void {
  const now = Date.now()
  broadcastEvent(sessionId, {
    id: randomUUID() as UUID,
    type: 'CHAT:TYPING_STOPPED',
    version: 1,
    userId: user.userId,
    userRole: Role.PLAYER,
    sessionId,
    roomId: user.primaryRoomId || null,
    timestamp: now,
    payload: {
      userId: user.userId,
      username: user.username,
      roomId: user.primaryRoomId,
      stoppedAt: now,
    },
  })
}

function buildMessageSentEvent(message: StoredMessage, actorUserId: UUID): EventEnvelope {
  return {
    id: randomUUID() as UUID,
    type: 'CHAT:MESSAGE_SENT',
    version: 1,
    userId: actorUserId,
    userRole: Role.PLAYER,
    sessionId: message.sessionId,
    roomId: message.roomId || null,
    timestamp: message.createdAt,
    payload: {
      messageId: message.id,
      roomId: message.roomId,
      authorId: message.authorId,
      authorUsername: message.authorUsername,
      content: message.content,
      type: message.type,
      isDmOnly: message.isDmOnly,
      visibleTo: message.visibleTo,
    },
  }
}

async function broadcastPresenceState(
  sessionId: UUID,
  user: MockPresenceUser,
  state: PresenceState
) {
  const next = await updatePresenceState({
    sessionId,
    userId: user.userId,
    username: user.username,
    state,
    primaryRoomId: user.primaryRoomId,
  })

  const changedAt = Date.now()
  broadcastEvent(sessionId, {
    id: randomUUID() as UUID,
    type: 'PRESENCE:STATE_CHANGED',
    version: 1,
    userId: user.userId,
    userRole: Role.PLAYER,
    sessionId,
    roomId: user.primaryRoomId || null,
    timestamp: changedAt,
    payload: {
      userId: user.userId,
      username: user.username,
      roomId: user.primaryRoomId,
      presence: next.state,
      newState: next.state,
      changedAt,
      previousGroupId: next.previousGroupId,
    },
  })
}

async function listSessionMockUsers(sessionId: UUID): Promise<MockPresenceUser[]> {
  const presence = await getSessionPresence(sessionId)
  return presence
    .filter((entry) => entry.username?.startsWith(DEV_MOCK_PREFIX))
    .map((entry) => ({
      userId: entry.userId,
      username: entry.username,
      primaryRoomId: entry.primaryRoomId,
      state: entry.state,
    }))
}

function pickRoomForReconnect(
  preferredRoomId: UUID | undefined,
  rooms: Array<{ id: UUID; type: RoomType }>
): UUID | undefined {
  if (preferredRoomId && rooms.some((room) => room.id === preferredRoomId)) {
    return preferredRoomId
  }

  const main = rooms.find((room) => room.type === RoomType.MAIN)
  if (main) {
    return main.id
  }

  return rooms[0]?.id
}

async function disconnectMockUser(params: {
  sessionId: UUID
  runtime: MockSimulationRuntime
  user: MockPresenceUser
  now: number
}) {
  if (!params.user.primaryRoomId) {
    return
  }

  const roomId = params.user.primaryRoomId
  await leaveRoom({
    sessionId: params.sessionId,
    roomId,
    userId: params.user.userId,
    state: PresenceState.OFFLINE,
  })

  params.runtime.disconnectedByUserId.set(params.user.userId, {
    username: params.user.username,
    previousRoomId: roomId,
    reconnectAt: params.now + 2000,
  })
  params.runtime.speakingNow.delete(params.user.userId)

  if (params.runtime.typingNow.has(params.user.userId)) {
    params.runtime.typingNow.delete(params.user.userId)
    broadcastTypingStopped(params.sessionId, params.user)
  }

  broadcastEvent(params.sessionId, {
    id: randomUUID() as UUID,
    type: 'ROOM:USER_LEFT',
    version: 1,
    userId: params.user.userId,
    userRole: Role.PLAYER,
    sessionId: params.sessionId,
    roomId,
    timestamp: params.now,
    payload: {
      roomId,
      userId: params.user.userId,
      username: params.user.username,
      leftAt: params.now,
      reason: 'dev_mock_disconnect',
    },
  })

  await broadcastPresenceState(params.sessionId, params.user, PresenceState.OFFLINE)
}

async function reconnectMockUser(params: {
  sessionId: UUID
  userId: UUID
  runtime: MockSimulationRuntime
  rooms: Array<{ id: UUID; type: RoomType }>
}) {
  const disconnected = params.runtime.disconnectedByUserId.get(params.userId)
  if (!disconnected) {
    return
  }

  const roomId = pickRoomForReconnect(disconnected.previousRoomId, params.rooms)
  if (!roomId) {
    return
  }

  const joined = await joinRoom({
    sessionId: params.sessionId,
    roomId,
    userId: params.userId,
    username: disconnected.username,
    state: PresenceState.ONLINE,
  })

  if (!joined) {
    return
  }

  params.runtime.disconnectedByUserId.delete(params.userId)
  const now = Date.now()

  broadcastEvent(params.sessionId, {
    id: randomUUID() as UUID,
    type: 'ROOM:USER_JOINED',
    version: 1,
    userId: params.userId,
    userRole: Role.PLAYER,
    sessionId: params.sessionId,
    roomId,
    timestamp: now,
    payload: {
      roomId,
      userId: params.userId,
      username: disconnected.username,
      joinedAt: now,
      reason: 'dev_mock_reconnect',
    },
  })

  await broadcastPresenceState(
    params.sessionId,
    {
      userId: params.userId,
      username: disconnected.username,
      primaryRoomId: roomId,
      state: PresenceState.ONLINE,
    },
    PresenceState.ONLINE
  )
}

function pickTemplate(type: MessageType): string {
  const typed = DEV_MOCK_CHAT_MESSAGES.filter((entry) => entry.type === type)
  if (typed.length === 0) {
    return '...'
  }

  const index = Math.floor(Math.random() * typed.length)
  return typed[index].content.trim()
}

function pruneMessageWindow(runtime: MockSimulationRuntime, now: number) {
  const cutoff = now - DEV_MOCK_MESSAGE_WINDOW_MS
  runtime.messageSentAtByType.IC = runtime.messageSentAtByType.IC.filter((ts) => ts >= cutoff)
  runtime.messageSentAtByType.OOC = runtime.messageSentAtByType.OOC.filter((ts) => ts >= cutoff)
  runtime.messageSentAtByType.WHISPER = runtime.messageSentAtByType.WHISPER.filter(
    (ts) => ts >= cutoff
  )
}

function recordMessageSent(runtime: MockSimulationRuntime, type: MessageType, at: number) {
  if (type === MessageType.IC || type === MessageType.OOC || type === MessageType.WHISPER) {
    runtime.messageSentAtByType[type].push(at)
  }
  pruneMessageWindow(runtime, at)
}

function pickChatType(room: { type: RoomType; name: string } | undefined): MessageType {
  if (room?.type === RoomType.GROUP && isGreenRoomName(room.name)) {
    return MessageType.OOC
  }

  const roll = Math.random()
  if (roll < 0.56) {
    return MessageType.IC
  }
  if (roll < 0.84) {
    return MessageType.OOC
  }
  return MessageType.WHISPER
}

function pickWhisperRecipient(
  author: MockPresenceUser,
  users: MockPresenceUser[]
): MockPresenceUser | undefined {
  const onlineOthers = users.filter(
    (entry) => entry.userId !== author.userId && entry.state !== PresenceState.OFFLINE
  )
  if (onlineOthers.length === 0) {
    return undefined
  }

  const sameRoom = onlineOthers.filter(
    (entry) => entry.primaryRoomId && entry.primaryRoomId === author.primaryRoomId
  )
  const candidates = sameRoom.length > 0 ? sameRoom : onlineOthers
  const index = Math.floor(Math.random() * candidates.length)
  return candidates[index]
}

async function emitPersistedChatMessage(params: {
  sessionId: UUID
  runtime: MockSimulationRuntime
  author: MockPresenceUser
  users: MockPresenceUser[]
  roomsById: Map<UUID, { id: UUID; type: RoomType; name: string }>
}) {
  const session = await getSession(params.sessionId)
  if (!session || !params.author.primaryRoomId) {
    return
  }

  const room = params.roomsById.get(params.author.primaryRoomId)
  let type = pickChatType(room)
  let recipientId: UUID | undefined

  if (type === MessageType.WHISPER) {
    const recipient = pickWhisperRecipient(params.author, params.users)
    if (!recipient) {
      type = MessageType.OOC
    } else {
      recipientId = recipient.userId
    }
  }

  const content = pickTemplate(type)
  if (!content) {
    return
  }

  const stored = await sendMessage({
    sessionId: params.sessionId,
    roomId: params.author.primaryRoomId,
    authorId: params.author.userId,
    authorUsername: params.author.username,
    dmId: session.dmId,
    content,
    type,
    recipientId,
  })

  recordMessageSent(params.runtime, type, stored.createdAt)

  const event = buildMessageSentEvent(stored, params.author.userId)
  broadcastEvent(params.sessionId, event, stored.visibleTo)
}

async function clearSpeaking(
  sessionId: UUID,
  runtime: MockSimulationRuntime,
  users: MockPresenceUser[]
) {
  if (runtime.speakingNow.size === 0) {
    return
  }

  const byId = new Map(users.map((user) => [user.userId, user]))
  const previousSpeaking = [...runtime.speakingNow]
  runtime.speakingNow.clear()

  for (const userId of previousSpeaking) {
    const user = byId.get(userId)
    if (!user) {
      continue
    }
    await broadcastPresenceState(sessionId, user, PresenceState.ONLINE)
  }
}

async function clearTyping(
  sessionId: UUID,
  runtime: MockSimulationRuntime,
  users: MockPresenceUser[]
) {
  if (runtime.typingNow.size === 0) {
    return
  }

  const byId = new Map(users.map((user) => [user.userId, user]))
  const previousTyping = [...runtime.typingNow]
  runtime.typingNow.clear()

  for (const userId of previousTyping) {
    const user = byId.get(userId)
    if (!user) {
      continue
    }
    broadcastTypingStopped(sessionId, user)
  }
}

async function runTick(sessionId: UUID): Promise<void> {
  const runtime = runtimeBySession.get(sessionId)
  if (!runtime || !runtime.isRunning) {
    return
  }

  pruneMessageWindow(runtime, Date.now())

  const now = Date.now()
  const users = await listSessionMockUsers(sessionId)
  const usersById = new Map(users.map((user) => [user.userId, user]))
  const rooms = await getRooms(sessionId)
  const roomsById = new Map(
    rooms.map((room) => [room.id, { id: room.id, type: room.type, name: room.name }])
  )

  for (const [userId, disconnected] of runtime.disconnectedByUserId.entries()) {
    if (disconnected.reconnectAt <= now) {
      await reconnectMockUser({
        sessionId,
        userId,
        runtime,
        rooms,
      })
    }
  }

  if (!runtime.config.disconnectSimulatorEnabled) {
    for (const userId of [...runtime.disconnectedByUserId.keys()]) {
      await reconnectMockUser({
        sessionId,
        userId,
        runtime,
        rooms,
      })
    }
  } else {
    const connectedUsers = users.filter(
      (user) => user.state !== PresenceState.OFFLINE && Boolean(user.primaryRoomId)
    )
    if (connectedUsers.length > 0 && Math.random() > 0.82) {
      const [target] = pickRandomUsers(
        connectedUsers.map((user) => user.userId),
        1
      )
      if (target) {
        const user = usersById.get(target)
        if (user) {
          await disconnectMockUser({
            sessionId,
            runtime,
            user,
            now,
          })
        }
      }
    }
  }

  const speakingEligibleUsers = users.filter(
    (user) => user.primaryRoomId && user.state !== PresenceState.OFFLINE
  )

  if (!runtime.config.speakingSimulatorEnabled) {
    await clearSpeaking(sessionId, runtime, users)
  } else {
    await clearSpeaking(sessionId, runtime, users)

    const shouldSpeakThisTick = Math.random() > 0.35
    const desiredCount = shouldSpeakThisTick ? Math.floor(Math.random() * 3) + 1 : 0
    const nextSpeakingIds = pickRandomUsers(
      speakingEligibleUsers.map((user) => user.userId),
      desiredCount
    )

    for (const userId of nextSpeakingIds) {
      const user = usersById.get(userId)
      if (!user) {
        continue
      }
      runtime.speakingNow.add(userId)
      await broadcastPresenceState(sessionId, user, PresenceState.SPEAKING)
    }
  }

  if (!runtime.config.chatSimulatorEnabled) {
    await clearTyping(sessionId, runtime, users)
  } else {
    const onlineUsers = users.filter(
      (user) => user.state !== PresenceState.OFFLINE && Boolean(user.primaryRoomId)
    )

    if (runtime.typingNow.size > 0 && Math.random() > 0.4) {
      const currentlyTyping = [...runtime.typingNow]
      const toStop = pickRandomUsers(currentlyTyping, 1)
      for (const userId of toStop) {
        const user = usersById.get(userId)
        if (!user) {
          runtime.typingNow.delete(userId)
          continue
        }
        runtime.typingNow.delete(userId)
        broadcastTypingStopped(sessionId, user)

        if (Math.random() > 0.28) {
          await emitPersistedChatMessage({
            sessionId,
            runtime,
            author: user,
            users,
            roomsById,
          })
        }
      }
    }

    if (onlineUsers.length > 0 && Math.random() > 0.45) {
      const available = onlineUsers.filter((user) => !runtime.typingNow.has(user.userId))
      const [toStart] = pickRandomUsers(
        available.map((user) => user.userId),
        1
      )
      if (toStart) {
        const user = usersById.get(toStart)
        if (user) {
          runtime.typingNow.add(toStart)
          broadcastTypingStarted(sessionId, user)
        }
      }
    }

    if (onlineUsers.length > 0 && runtime.typingNow.size === 0 && Math.random() > 0.76) {
      const [authorId] = pickRandomUsers(
        onlineUsers.map((user) => user.userId),
        1
      )
      const author = authorId ? usersById.get(authorId) : undefined
      if (author) {
        await emitPersistedChatMessage({
          sessionId,
          runtime,
          author,
          users,
          roomsById,
        })
      }
    }
  }
}

async function clearRuntimeState(sessionId: UUID, runtime: MockSimulationRuntime): Promise<void> {
  const users = await listSessionMockUsers(sessionId)
  const rooms = await getRooms(sessionId)

  for (const userId of [...runtime.disconnectedByUserId.keys()]) {
    await reconnectMockUser({
      sessionId,
      userId,
      runtime,
      rooms,
    })
  }

  await clearSpeaking(sessionId, runtime, users)
  await clearTyping(sessionId, runtime, users)
}

function startRunner(sessionId: UUID): void {
  const runtime = getOrCreateRuntime(sessionId)
  if (runtime.tickTimer) {
    return
  }

  runtime.isRunning = true
  runtime.startedAt = Date.now()
  runtime.tickTimer = setInterval(() => {
    void runTick(sessionId)
  }, 1400)

  void runTick(sessionId)
}

async function stopRunner(sessionId: UUID): Promise<void> {
  const runtime = runtimeBySession.get(sessionId)
  if (!runtime) {
    return
  }

  if (runtime.tickTimer) {
    clearInterval(runtime.tickTimer)
    runtime.tickTimer = null
  }

  runtime.isRunning = false
  await clearRuntimeState(sessionId, runtime)
}

export async function getMockSimulationStatus(sessionId: UUID): Promise<{
  sessionId: UUID
  config: MockSimulationConfig
  isRunning: boolean
  activeMockCount: number
  speakingNow: UUID[]
  uptime: number
  messagesSentLastMinuteByType: {
    IC: number
    OOC: number
    WHISPER: number
  }
}> {
  const runtime = getOrCreateRuntime(sessionId)

  if (!runtime.isRunning && shouldRun(runtime.config)) {
    startRunner(sessionId)
  }

  const users = await listSessionMockUsers(sessionId)
  pruneMessageWindow(runtime, Date.now())

  return {
    sessionId,
    config: runtime.config,
    isRunning: runtime.isRunning,
    activeMockCount: users.length,
    speakingNow: [...runtime.speakingNow],
    uptime: runtime.isRunning ? Math.max(0, Date.now() - runtime.startedAt) : 0,
    messagesSentLastMinuteByType: {
      IC: runtime.messageSentAtByType.IC.length,
      OOC: runtime.messageSentAtByType.OOC.length,
      WHISPER: runtime.messageSentAtByType.WHISPER.length,
    },
  }
}

export async function updateMockSimulationConfig(params: {
  sessionId: UUID
  config: Partial<MockSimulationConfig>
}): Promise<MockSimulationConfig> {
  const runtime = getOrCreateRuntime(params.sessionId)

  runtime.config = {
    ...runtime.config,
    ...params.config,
    playerCount: clampPlayerCount(params.config.playerCount ?? runtime.config.playerCount),
  }

  if (shouldRun(runtime.config)) {
    startRunner(params.sessionId)
  } else {
    await stopRunner(params.sessionId)
  }

  return runtime.config
}

export async function stopMockSimulation(sessionId: UUID): Promise<void> {
  await stopRunner(sessionId)
}

export function getMockSimulationPlayerCount(sessionId: UUID): number {
  const runtime = getOrCreateRuntime(sessionId)
  return clampPlayerCount(runtime.config.playerCount)
}

export function getMockSimulationBounds(): { min: number; max: number } {
  return {
    min: MIN_DEV_MOCK_SIMULATOR_COUNT,
    max: MAX_DEV_MOCK_SIMULATOR_COUNT,
  }
}
