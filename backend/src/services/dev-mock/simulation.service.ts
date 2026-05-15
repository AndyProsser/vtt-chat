import { randomUUID } from 'node:crypto'
import { sendMessage } from '@/services/chat.service'
import { DEV_MOCK_CHAT_MESSAGES } from '@/constants/dev-mock-chat-messages.constants'
import {
  DEV_MOCK_MESSAGE_WINDOW_MS,
  DEV_MOCK_PREFIX,
  MAX_DEV_MOCK_SIMULATOR_COUNT,
  MIN_DEV_MOCK_SIMULATOR_COUNT,
} from '@/constants/dev-mock.constants'
import { getSession } from '@/services/session/core.service'
import { getSessionPresence, getRooms, updatePresenceState } from '@/services/room.service'
import { MessageType, PresenceState, Role, RoomType } from '@shared'
import type { EventEnvelope, UUID } from '@shared'
import eventBroadcaster from '@/ws/event-broadcaster'
import type { StoredMessage } from '@/types/chat.types'
import { listAudioDMOverridesBySession } from '@/repositories/audio.repository'
import { removeDMOverrideState, setUserMuteState } from '@/services/audio/effects.service'
import { AUDIO_DM_OVERRIDE_TYPES, AUDIO_EVENT_TYPES } from '@/constants/audio.constants'

type DisconnectRealismProfile = 'SHORT_BLIPS' | 'BALANCED' | 'NETWORK_CHURN'

interface DisconnectRealismPreset {
  disconnectChancePerTick: number
  ghostMinDurationMs: number
  ghostMaxDurationMs: number
}

export interface MockSimulationConfig {
  speakingSimulatorEnabled: boolean
  chatSimulatorEnabled: boolean
  disconnectSimulatorEnabled: boolean
  playerCount: number
  disconnectRealismProfile: DisconnectRealismProfile
  disconnectChancePerTick: number
  ghostMinDurationMs: number
  ghostMaxDurationMs: number
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

const DISCONNECT_REALISM_PRESETS: Record<DisconnectRealismProfile, DisconnectRealismPreset> = {
  SHORT_BLIPS: {
    disconnectChancePerTick: 0.08,
    ghostMinDurationMs: 1200,
    ghostMaxDurationMs: 3200,
  },
  BALANCED: {
    disconnectChancePerTick: 0.18,
    ghostMinDurationMs: 2500,
    ghostMaxDurationMs: 7000,
  },
  NETWORK_CHURN: {
    disconnectChancePerTick: 0.34,
    ghostMinDurationMs: 4500,
    ghostMaxDurationMs: 14000,
  },
}

const MIN_DISCONNECT_CHANCE_PER_TICK = 0
const MAX_DISCONNECT_CHANCE_PER_TICK = 0.95
const MIN_GHOST_DURATION_MS = 500
const MAX_GHOST_DURATION_MS = 60000
const DEFAULT_DISCONNECT_PROFILE: DisconnectRealismProfile = 'BALANCED'

const runtimeBySession = new Map<UUID, MockSimulationRuntime>()

function isMockUsername(username: string): boolean {
  return username.startsWith(DEV_MOCK_PREFIX)
}

function clampDisconnectChancePerTick(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback
  }

  return Math.max(
    MIN_DISCONNECT_CHANCE_PER_TICK,
    Math.min(MAX_DISCONNECT_CHANCE_PER_TICK, Number(value))
  )
}

function clampGhostDurationMs(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback
  }

  return Math.max(MIN_GHOST_DURATION_MS, Math.min(MAX_GHOST_DURATION_MS, Math.floor(value)))
}

function toDisconnectProfile(value: unknown): DisconnectRealismProfile | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
  if (normalized === 'BLIPS') {
    return 'SHORT_BLIPS'
  }
  if (normalized === 'CHURN') {
    return 'NETWORK_CHURN'
  }

  if (normalized === 'SHORT_BLIPS' || normalized === 'BALANCED' || normalized === 'NETWORK_CHURN') {
    return normalized
  }

  return undefined
}

function normalizeDisconnectConfig(
  previous: MockSimulationConfig,
  requested: Partial<MockSimulationConfig>
): Pick<
  MockSimulationConfig,
  | 'disconnectRealismProfile'
  | 'disconnectChancePerTick'
  | 'ghostMinDurationMs'
  | 'ghostMaxDurationMs'
> {
  const requestedProfile = toDisconnectProfile(requested.disconnectRealismProfile)
  const baseProfile = requestedProfile || previous.disconnectRealismProfile
  const preset = DISCONNECT_REALISM_PRESETS[baseProfile]

  const chance =
    requested.disconnectChancePerTick !== undefined
      ? clampDisconnectChancePerTick(
          requested.disconnectChancePerTick,
          preset.disconnectChancePerTick
        )
      : requestedProfile
        ? preset.disconnectChancePerTick
        : previous.disconnectChancePerTick

  let ghostMin =
    requested.ghostMinDurationMs !== undefined
      ? clampGhostDurationMs(requested.ghostMinDurationMs, preset.ghostMinDurationMs)
      : requestedProfile
        ? preset.ghostMinDurationMs
        : previous.ghostMinDurationMs

  let ghostMax =
    requested.ghostMaxDurationMs !== undefined
      ? clampGhostDurationMs(requested.ghostMaxDurationMs, preset.ghostMaxDurationMs)
      : requestedProfile
        ? preset.ghostMaxDurationMs
        : previous.ghostMaxDurationMs

  if (ghostMin > ghostMax) {
    const tmp = ghostMin
    ghostMin = ghostMax
    ghostMax = tmp
  }

  return {
    disconnectRealismProfile: baseProfile,
    disconnectChancePerTick: chance,
    ghostMinDurationMs: ghostMin,
    ghostMaxDurationMs: ghostMax,
  }
}

function defaultConfig(): MockSimulationConfig {
  const preset = DISCONNECT_REALISM_PRESETS[DEFAULT_DISCONNECT_PROFILE]

  return {
    speakingSimulatorEnabled: true,
    chatSimulatorEnabled: false,
    disconnectSimulatorEnabled: false,
    playerCount: 8,
    disconnectRealismProfile: DEFAULT_DISCONNECT_PROFILE,
    disconnectChancePerTick: preset.disconnectChancePerTick,
    ghostMinDurationMs: preset.ghostMinDurationMs,
    ghostMaxDurationMs: preset.ghostMaxDurationMs,
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
    .filter((entry) => isMockUsername(entry.username || ''))
    .map((entry) => ({
      userId: entry.userId,
      username: entry.username,
      primaryRoomId: entry.primaryRoomId,
      state: entry.state,
    }))
}

async function disconnectMockUser(params: {
  sessionId: UUID
  runtime: MockSimulationRuntime
  user: MockPresenceUser
  now: number
}) {
  if (!params.user.primaryRoomId || !isMockUsername(params.user.username)) {
    return
  }

  const roomId = params.user.primaryRoomId
  const reconnectDelayMs =
    params.runtime.config.ghostMinDurationMs +
    Math.floor(
      Math.random() *
        (params.runtime.config.ghostMaxDurationMs - params.runtime.config.ghostMinDurationMs + 1)
    )

  const disconnectedPresence = await updatePresenceState({
    sessionId: params.sessionId,
    userId: params.user.userId,
    username: params.user.username,
    state: PresenceState.OFFLINE,
    primaryRoomId: roomId,
    ghost: true,
  })

  params.runtime.disconnectedByUserId.set(params.user.userId, {
    username: params.user.username,
    previousRoomId: roomId,
    reconnectAt: params.now + reconnectDelayMs,
  })
  params.runtime.speakingNow.delete(params.user.userId)

  if (params.runtime.typingNow.has(params.user.userId)) {
    params.runtime.typingNow.delete(params.user.userId)
    broadcastTypingStopped(params.sessionId, params.user)
  }

  broadcastEvent(params.sessionId, {
    id: randomUUID() as UUID,
    type: 'PRESENCE:USER_GHOST_MODE_CHANGED',
    version: 1,
    userId: params.user.userId,
    userRole: Role.PLAYER,
    sessionId: params.sessionId,
    roomId,
    timestamp: disconnectedPresence.lastSeenAt,
    payload: {
      userId: disconnectedPresence.userId,
      username: disconnectedPresence.username,
      roomId: disconnectedPresence.primaryRoomId || null,
      ghostMode: true,
      changedAt: disconnectedPresence.lastSeenAt,
      previousGroupId: disconnectedPresence.previousGroupId || null,
    },
  })

  broadcastEvent(params.sessionId, {
    id: randomUUID() as UUID,
    type: 'PRESENCE:STATE_CHANGED',
    version: 1,
    userId: params.user.userId,
    userRole: Role.PLAYER,
    sessionId: params.sessionId,
    roomId,
    timestamp: disconnectedPresence.lastSeenAt,
    payload: {
      userId: disconnectedPresence.userId,
      username: disconnectedPresence.username,
      roomId: disconnectedPresence.primaryRoomId || null,
      presence: PresenceState.OFFLINE,
      newState: PresenceState.OFFLINE,
      changedAt: disconnectedPresence.lastSeenAt,
      previousGroupId: disconnectedPresence.previousGroupId || null,
    },
  })
}

async function reconnectMockUser(params: {
  sessionId: UUID
  userId: UUID
  runtime: MockSimulationRuntime
}) {
  const disconnected = params.runtime.disconnectedByUserId.get(params.userId)
  if (!disconnected) {
    return
  }

  if (!isMockUsername(disconnected.username)) {
    params.runtime.disconnectedByUserId.delete(params.userId)
    return
  }

  const currentPresence = await getSessionPresence(params.sessionId)
  const current = currentPresence.find((entry) => entry.userId === params.userId)
  if (current && !isMockUsername(current.username || '')) {
    params.runtime.disconnectedByUserId.delete(params.userId)
    return
  }

  const reconnectedPresence = await updatePresenceState({
    sessionId: params.sessionId,
    userId: params.userId,
    username: disconnected.username,
    state: PresenceState.ONLINE,
    primaryRoomId: disconnected.previousRoomId,
    ghost: false,
  })

  params.runtime.disconnectedByUserId.delete(params.userId)

  broadcastEvent(params.sessionId, {
    id: randomUUID() as UUID,
    type: 'PRESENCE:USER_GHOST_MODE_CHANGED',
    version: 1,
    userId: params.userId,
    userRole: Role.PLAYER,
    sessionId: params.sessionId,
    roomId: reconnectedPresence.primaryRoomId || null,
    timestamp: reconnectedPresence.lastSeenAt,
    payload: {
      userId: reconnectedPresence.userId,
      username: reconnectedPresence.username,
      roomId: reconnectedPresence.primaryRoomId || null,
      ghostMode: false,
      changedAt: reconnectedPresence.lastSeenAt,
      previousGroupId: reconnectedPresence.previousGroupId || null,
    },
  })

  broadcastEvent(params.sessionId, {
    id: randomUUID() as UUID,
    type: 'PRESENCE:STATE_CHANGED',
    version: 1,
    userId: params.userId,
    userRole: Role.PLAYER,
    sessionId: params.sessionId,
    roomId: reconnectedPresence.primaryRoomId || null,
    timestamp: reconnectedPresence.lastSeenAt,
    payload: {
      userId: reconnectedPresence.userId,
      username: reconnectedPresence.username,
      roomId: reconnectedPresence.primaryRoomId || null,
      presence: PresenceState.ONLINE,
      newState: PresenceState.ONLINE,
      changedAt: reconnectedPresence.lastSeenAt,
      previousGroupId: reconnectedPresence.previousGroupId || null,
    },
  })
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

async function listDmMutedMockUsers(
  sessionId: UUID,
  users: MockPresenceUser[]
): Promise<MockPresenceUser[]> {
  const overrides = await listAudioDMOverridesBySession(sessionId)
  const dmMutedUserIds = new Set(
    overrides
      .filter((override) => override.overrideType === AUDIO_DM_OVERRIDE_TYPES.MUTE)
      .map((override) => override.targetUserId as UUID)
  )

  return users.filter(
    (user) =>
      dmMutedUserIds.has(user.userId) &&
      Boolean(user.primaryRoomId) &&
      user.state !== PresenceState.OFFLINE
  )
}

async function emitMockSelfUnmute(sessionId: UUID, user: MockPresenceUser): Promise<void> {
  const removedAt = Date.now()
  await removeDMOverrideState({
    sessionId,
    targetUserId: user.userId,
    overrideType: AUDIO_DM_OVERRIDE_TYPES.MUTE,
  })

  broadcastEvent(sessionId, {
    id: randomUUID() as UUID,
    type: AUDIO_EVENT_TYPES.DM_OVERRIDE_REMOVED,
    version: 1,
    userId: user.userId,
    userRole: Role.PLAYER,
    sessionId,
    roomId: null,
    timestamp: removedAt,
    payload: {
      targetUserId: user.userId,
      dmId: user.userId,
      overrideType: AUDIO_DM_OVERRIDE_TYPES.MUTE,
      removedAt,
    },
  })

  const mutedAt = Date.now()
  const nextMuteState = await setUserMuteState({
    sessionId,
    userId: user.userId,
    muted: false,
    mutedAt,
  })

  broadcastEvent(sessionId, {
    id: randomUUID() as UUID,
    type: 'AUDIO:USER_UNMUTED',
    version: 1,
    userId: user.userId,
    userRole: Role.PLAYER,
    sessionId,
    roomId: null,
    timestamp: mutedAt,
    payload: {
      userId: nextMuteState.userId,
      userMuted: nextMuteState.userMuted,
      mutedAt: nextMuteState.mutedAt,
    },
  })
}

async function maybeEmitMockSelfUnmute(
  sessionId: UUID,
  runtime: MockSimulationRuntime,
  users: MockPresenceUser[]
): Promise<void> {
  // Intentionally mirrors a real player action: a user can unmute themselves
  // after a DM mute, which clears the mute override and updates mute state.
  if (!runtime.config.speakingSimulatorEnabled) {
    return
  }

  const dmMutedUsers = await listDmMutedMockUsers(sessionId, users)
  if (dmMutedUsers.length === 0 || Math.random() <= 0.72) {
    return
  }

  const [userId] = pickRandomUsers(
    dmMutedUsers.map((user) => user.userId),
    1
  )

  if (!userId) {
    return
  }

  const selected = dmMutedUsers.find((user) => user.userId === userId)
  if (!selected) {
    return
  }

  await emitMockSelfUnmute(sessionId, selected)
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

  await maybeEmitMockSelfUnmute(sessionId, runtime, users)

  for (const [userId, disconnected] of runtime.disconnectedByUserId.entries()) {
    if (disconnected.reconnectAt <= now) {
      await reconnectMockUser({
        sessionId,
        userId,
        runtime,
      })
    }
  }

  if (!runtime.config.disconnectSimulatorEnabled) {
    for (const userId of [...runtime.disconnectedByUserId.keys()]) {
      await reconnectMockUser({
        sessionId,
        userId,
        runtime,
      })
    }
  } else {
    const connectedUsers = users.filter(
      (user) => user.state !== PresenceState.OFFLINE && Boolean(user.primaryRoomId)
    )
    if (connectedUsers.length > 0 && Math.random() < runtime.config.disconnectChancePerTick) {
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
  const disconnectConfig = normalizeDisconnectConfig(runtime.config, params.config)

  runtime.config = {
    speakingSimulatorEnabled:
      params.config.speakingSimulatorEnabled ?? runtime.config.speakingSimulatorEnabled,
    chatSimulatorEnabled: params.config.chatSimulatorEnabled ?? runtime.config.chatSimulatorEnabled,
    disconnectSimulatorEnabled:
      params.config.disconnectSimulatorEnabled ?? runtime.config.disconnectSimulatorEnabled,
    playerCount: clampPlayerCount(params.config.playerCount ?? runtime.config.playerCount),
    ...disconnectConfig,
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

export function getMockDisconnectRealismProfiles(): Record<
  DisconnectRealismProfile,
  DisconnectRealismPreset
> {
  return DISCONNECT_REALISM_PRESETS
}
