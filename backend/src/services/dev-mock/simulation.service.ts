import { randomUUID } from 'node:crypto'
import { sendCampaignGreenroomMessage, sendMessage } from '@/services/chat.service'
import { resolveRoomAudience, uniqueVisibleAudience } from '@/services/chat-visibility.service'
import { isGreenRoomName } from '@/utils'
import { DEV_MOCK_CHAT_MESSAGES } from '@/constants/dev-mock-chat-messages.constants'
import {
  DEV_MOCK_MAX_MESSAGES_PER_MINUTE,
  DEV_MOCK_MESSAGE_WINDOW_MS,
  DEV_MOCK_PREFIX,
  MAX_DEV_MOCK_SIMULATOR_COUNT,
  MIN_DEV_MOCK_SIMULATOR_COUNT,
} from '@/constants/dev-mock.constants'
import {
  DEV_MOCK_RUNTIME_INACTIVE_TTL_MS,
  DEV_MOCK_SPEAKING_STABILITY_TICKS,
} from '@/constants/dev-mock-simulation.constants'
import { getRedisClient } from '@/infra/redis'
import { findSessionById } from '@/repositories/session.repository'
import { getSession } from '@/services/session/core.service'
import { getSessionPresence, getRooms, updatePresenceState } from '@/services/room.service'
import { DeviceClass, MessageType, PresenceState, Role, RoomType, SessionState } from '@shared'
import type { DeviceSessionEntity, EventEnvelope, UUID } from '@shared'
import eventBroadcaster from '@/ws/event-broadcaster'
import type { StoredMessage } from '@/types/chat.types'
import { listAudioDMOverridesBySession } from '@/repositories/audio.repository'
import { removeDMOverrideState, setUserMuteState } from '@/services/audio/effects.service'
import { AUDIO_DM_OVERRIDE_TYPES, AUDIO_EVENT_TYPES } from '@/constants/audio.constants'
import { logger } from '@/utils/logger'

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
  multiDeviceSimulatorEnabled: boolean
  playerCount: number
  disconnectRealismProfile: DisconnectRealismProfile
  disconnectChancePerTick: number
  ghostMinDurationMs: number
  ghostMaxDurationMs: number
}

// ---------------------------------------------------------------------------
// Multi-device simulation types
// ---------------------------------------------------------------------------

interface SimulatedDevice {
  deviceSessionId: string
  deviceClass: DeviceClass
  label: string
  connectedAt: number
}

/** State held for a mock user that is simulating two simultaneous devices. */
interface MultiDeviceMockState {
  userId: UUID
  username: string
  primaryDevice: SimulatedDevice
  secondaryDevice: SimulatedDevice
  /** Which deviceSessionId currently owns the mic. */
  activeDeviceSessionId: string
  /** True when the disconnect sim permanently dropped the secondary device. */
  secondaryPermanentlyDisconnected: boolean
}

/** Users assigned to emit device-transfer events this session. */
interface TransferMockState {
  userId: UUID
  username: string
  fromDeviceSessionId: string
  toDeviceSessionId: string
  transferEmittedAt: number | null
}

interface MockSimulationRuntime {
  config: MockSimulationConfig
  configHydrated: boolean
  isRunning: boolean
  startedAt: number
  lastTouchedAt: number
  tickTimer: ReturnType<typeof setInterval> | null
  speakingNow: Set<UUID>
  typingNow: Set<UUID>
  disconnectedByUserId: Map<UUID, DisconnectedMockState>
  messageSentAtByType: {
    IC: number[]
    OOC: number[]
    WHISPER: number[]
    DM: number[]
  }
  /** Active two-device states, keyed by userId. */
  multiDeviceByUserId: Map<UUID, MultiDeviceMockState>
  /** Users picked to emit a TRANSFER event at some point this session. */
  transferByUserId: Map<UUID, TransferMockState>
  /** Ticks since multi-device setup last ran (used to avoid immediate re-setup). */
  multiDeviceSetupAt: number
  /**
   * Countdown until the current speaker set is cycled to new speakers.
   * Counts down from DEV_MOCK_SPEAKING_STABILITY_TICKS each tick; when it
   * reaches 0 a new set is chosen and only the diff is broadcast.
   */
  speakingStabilityTicksLeft: number
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

function mockSimulationConfigKey(sessionId: UUID): string {
  return `dev-mock:session:${sessionId}:simulation-config`
}

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
    multiDeviceSimulatorEnabled: false,
    playerCount: 8,
    disconnectRealismProfile: DEFAULT_DISCONNECT_PROFILE,
    disconnectChancePerTick: preset.disconnectChancePerTick,
    ghostMinDurationMs: preset.ghostMinDurationMs,
    ghostMaxDurationMs: preset.ghostMaxDurationMs,
  }
}

function mergeMockSimulationConfig(
  previous: MockSimulationConfig,
  requested: Partial<MockSimulationConfig>
): MockSimulationConfig {
  const disconnectConfig = normalizeDisconnectConfig(previous, requested)

  return {
    speakingSimulatorEnabled:
      requested.speakingSimulatorEnabled ?? previous.speakingSimulatorEnabled,
    chatSimulatorEnabled: requested.chatSimulatorEnabled ?? previous.chatSimulatorEnabled,
    disconnectSimulatorEnabled:
      requested.disconnectSimulatorEnabled ?? previous.disconnectSimulatorEnabled,
    multiDeviceSimulatorEnabled:
      requested.multiDeviceSimulatorEnabled ?? previous.multiDeviceSimulatorEnabled,
    playerCount: clampPlayerCount(requested.playerCount ?? previous.playerCount),
    ...disconnectConfig,
  }
}

function parsePersistedMockSimulationConfig(
  raw: string | null
): Partial<MockSimulationConfig> | null {
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<MockSimulationConfig> | null
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch (error) {
    logger.warn('dev-mock-simulation', 'Failed to parse persisted mock simulation config', {
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

async function loadPersistedMockSimulationConfig(
  sessionId: UUID
): Promise<Partial<MockSimulationConfig> | null> {
  try {
    const redis = await getRedisClient()
    return parsePersistedMockSimulationConfig(await redis.get(mockSimulationConfigKey(sessionId)))
  } catch (error) {
    logger.warn('dev-mock-simulation', 'Failed to load persisted mock simulation config', {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

async function persistMockSimulationConfig(
  sessionId: UUID,
  config: MockSimulationConfig
): Promise<void> {
  try {
    const redis = await getRedisClient()
    await redis.set(mockSimulationConfigKey(sessionId), JSON.stringify(config))
  } catch (error) {
    logger.warn('dev-mock-simulation', 'Failed to persist mock simulation config', {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function deletePersistedMockSimulationConfig(sessionId: UUID): Promise<void> {
  try {
    const redis = await getRedisClient()
    await redis.del(mockSimulationConfigKey(sessionId))
  } catch (error) {
    logger.warn('dev-mock-simulation', 'Failed to delete persisted mock simulation config', {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    })
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

function pruneInactiveRuntimes(now: number): void {
  for (const [sessionId, runtime] of runtimeBySession.entries()) {
    if (runtime.isRunning || runtime.tickTimer) {
      continue
    }

    if (now - runtime.lastTouchedAt >= DEV_MOCK_RUNTIME_INACTIVE_TTL_MS) {
      runtimeBySession.delete(sessionId)
    }
  }
}

function touchRuntime(runtime: MockSimulationRuntime, now = Date.now()): void {
  runtime.lastTouchedAt = now
}

function getOrCreateRuntime(sessionId: UUID): MockSimulationRuntime {
  const now = Date.now()
  pruneInactiveRuntimes(now)

  const existing = runtimeBySession.get(sessionId)
  if (existing) {
    touchRuntime(existing, now)
    return existing
  }

  const runtime: MockSimulationRuntime = {
    config: defaultConfig(),
    configHydrated: false,
    isRunning: false,
    startedAt: now,
    lastTouchedAt: now,
    tickTimer: null,
    speakingNow: new Set<UUID>(),
    typingNow: new Set<UUID>(),
    disconnectedByUserId: new Map<UUID, DisconnectedMockState>(),
    messageSentAtByType: {
      IC: [],
      OOC: [],
      WHISPER: [],
      DM: [],
    },
    multiDeviceByUserId: new Map<UUID, MultiDeviceMockState>(),
    transferByUserId: new Map<UUID, TransferMockState>(),
    multiDeviceSetupAt: 0,
    speakingStabilityTicksLeft: 0,
  }

  runtimeBySession.set(sessionId, runtime)
  return runtime
}

/**
 * Hydrates per-session mock simulator config from Redis so refreshes and
 * reconnects recover the last backend-authoritative settings.
 */
async function ensureRuntimeConfigHydrated(
  sessionId: UUID,
  runtime: MockSimulationRuntime
): Promise<void> {
  if (runtime.configHydrated) {
    return
  }

  runtime.configHydrated = true
  const persistedConfig = await loadPersistedMockSimulationConfig(sessionId)
  if (!persistedConfig) {
    await persistMockSimulationConfig(sessionId, runtime.config)
    return
  }

  runtime.config = mergeMockSimulationConfig(defaultConfig(), persistedConfig)
}

function shouldRun(config: MockSimulationConfig): boolean {
  return (
    config.speakingSimulatorEnabled ||
    config.chatSimulatorEnabled ||
    config.disconnectSimulatorEnabled ||
    config.multiDeviceSimulatorEnabled
  )
}

function broadcastEvent(sessionId: UUID, event: EventEnvelope, visibleTo?: UUID[]): void {
  if (!eventBroadcaster.isReady()) {
    return
  }

  eventBroadcaster.broadcastToSession(sessionId, event, visibleTo)
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

function buildMessageSentEvent(params: {
  message: StoredMessage
  actorUserId: UUID
  sessionId: UUID
  roomId?: UUID
}): EventEnvelope {
  return {
    id: randomUUID() as UUID,
    type: 'CHAT:MESSAGE_SENT',
    version: 1,
    userId: params.actorUserId,
    userRole: Role.PLAYER,
    sessionId: params.sessionId,
    roomId: params.roomId || params.message.roomId || null,
    timestamp: params.message.createdAt,
    payload: {
      messageId: params.message.id,
      roomId: params.roomId || params.message.roomId,
      authorId: params.message.authorId,
      authorUsername: params.message.authorUsername,
      content: params.message.content,
      type: params.message.type,
      isDmOnly: params.message.isDmOnly,
      visibleTo: params.message.visibleTo,
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

  // If this user is in multi-device mode, disconnect the secondary device only.
  // The secondary is marked permanently disconnected until multi-device re-cycles.
  const multiDeviceState = params.runtime.multiDeviceByUserId.get(params.user.userId)
  if (multiDeviceState && !multiDeviceState.secondaryPermanentlyDisconnected) {
    multiDeviceState.secondaryPermanentlyDisconnected = true
    // Switch active to primary so the user still appears live.
    multiDeviceState.activeDeviceSessionId = multiDeviceState.primaryDevice.deviceSessionId
    const now = Date.now()
    broadcastEvent(params.sessionId, {
      id: randomUUID() as UUID,
      type: 'SESSION:DEVICE_SESSION_DISCONNECTED',
      version: 1,
      userId: params.user.userId,
      userRole: Role.PLAYER,
      sessionId: params.sessionId,
      roomId: params.user.primaryRoomId ?? null,
      timestamp: now,
      payload: {
        sessionId: params.sessionId,
        userId: params.user.userId,
        deviceSessionId: multiDeviceState.secondaryDevice.deviceSessionId,
        deviceClass: multiDeviceState.secondaryDevice.deviceClass,
        label: multiDeviceState.secondaryDevice.label,
        disconnectedAt: now,
        deviceSessions: buildFakeDeviceSessions(multiDeviceState),
      },
    })
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
  runtime.messageSentAtByType.DM = runtime.messageSentAtByType.DM.filter((ts) => ts >= cutoff)
}

function recordMessageSent(runtime: MockSimulationRuntime, type: MessageType, at: number) {
  if (
    type === MessageType.IC ||
    type === MessageType.OOC ||
    type === MessageType.WHISPER ||
    type === MessageType.DM
  ) {
    runtime.messageSentAtByType[type].push(at)
  }
  pruneMessageWindow(runtime, at)
}

function getRecentMockMessageCount(runtime: MockSimulationRuntime, now: number): number {
  pruneMessageWindow(runtime, now)

  return (
    runtime.messageSentAtByType.IC.length +
    runtime.messageSentAtByType.OOC.length +
    runtime.messageSentAtByType.WHISPER.length +
    runtime.messageSentAtByType.DM.length
  )
}

function pickChatType(room: { type: RoomType; name: string } | undefined): MessageType {
  if (room?.type === RoomType.GROUP && isGreenRoomName(room.name)) {
    return MessageType.OOC
  }

  if (room?.type === RoomType.PRIVATE) {
    return MessageType.WHISPER
  }

  const roll = Math.random()
  if (roll < 0.5) {
    return MessageType.IC
  }
  if (roll < 0.79) {
    return MessageType.OOC
  }
  if (roll < 0.93) {
    return MessageType.WHISPER
  }
  return MessageType.DM
}

function pickWhisperRecipient(
  author: MockPresenceUser,
  users: MockPresenceUser[]
): MockPresenceUser | undefined {
  const sameRoom = users.filter(
    (entry) =>
      entry.userId !== author.userId &&
      entry.state !== PresenceState.OFFLINE &&
      entry.primaryRoomId &&
      entry.primaryRoomId === author.primaryRoomId
  )

  if (sameRoom.length === 0) {
    return undefined
  }

  const index = Math.floor(Math.random() * sameRoom.length)
  return sameRoom[index]
}

async function emitPersistedChatMessage(params: {
  sessionId: UUID
  runtime: MockSimulationRuntime
  author: MockPresenceUser
  users: MockPresenceUser[]
  roomsById: Map<UUID, { id: UUID; type: RoomType; name: string }>
}) {
  if (getRecentMockMessageCount(params.runtime, Date.now()) >= DEV_MOCK_MAX_MESSAGES_PER_MINUTE) {
    return
  }

  const session = await getSession(params.sessionId)
  if (!session || !params.author.primaryRoomId) {
    return
  }

  const room = params.roomsById.get(params.author.primaryRoomId)
  const greenRoom = [...params.roomsById.values()].find(
    (candidate) => candidate.type === RoomType.GROUP && isGreenRoomName(candidate.name)
  )

  const isActiveSession = session.state === SessionState.ACTIVE
  let messageRoomId = params.author.primaryRoomId
  let type: MessageType
  let recipientId: UUID | undefined

  if (!isActiveSession) {
    // Before/after active play, mock chat is constrained to Greenroom OOC only.
    if (!greenRoom || params.author.primaryRoomId !== greenRoom.id) {
      return
    }
    messageRoomId = greenRoom.id
    type = MessageType.OOC
  } else {
    type = pickChatType(room)

    if (type === MessageType.WHISPER) {
      const recipient = pickWhisperRecipient(params.author, params.users)
      if (!recipient) {
        type = MessageType.OOC
      } else {
        recipientId = recipient.userId
      }
    }
  }

  let visibleTo: UUID[] | undefined
  if (type === MessageType.WHISPER && recipientId) {
    // Mirror real player whisper: sender + DM + recipient only
    visibleTo = uniqueVisibleAudience([params.author.userId, session.dmId, recipientId])
  } else if (type === MessageType.DM) {
    // DM message type is always sender + DM only.
    visibleTo = uniqueVisibleAudience([params.author.userId, session.dmId])
  } else {
    // Mirror real player IC/OOC: resolve room occupants at send time
    visibleTo = await resolveRoomAudience({
      sessionId: params.sessionId,
      roomId: messageRoomId,
      dmId: session.dmId,
    })
  }

  const content = pickTemplate(type)
  if (!content) {
    return
  }

  const stored = !isActiveSession
    ? await (async () => {
        const sessionRecord = await findSessionById(params.sessionId)
        if (!sessionRecord?.campaignId) {
          return null
        }

        return sendCampaignGreenroomMessage({
          campaignId: sessionRecord.campaignId as UUID,
          authorId: params.author.userId,
          authorUsername: params.author.username,
          dmId: session.dmId,
          content,
          visibleTo,
        })
      })()
    : await sendMessage({
        sessionId: params.sessionId,
        roomId: messageRoomId,
        authorId: params.author.userId,
        authorUsername: params.author.username,
        dmId: session.dmId,
        content,
        type,
        recipientId,
        visibleTo,
      })

  if (!stored) {
    return
  }

  recordMessageSent(params.runtime, type, stored.createdAt)

  const event = buildMessageSentEvent({
    message: stored,
    actorUserId: params.author.userId,
    sessionId: params.sessionId,
    roomId: messageRoomId,
  })
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
    type: 'AUDIO:MUTE_STATE_CHANGED',
    version: 1,
    userId: user.userId,
    userRole: Role.PLAYER,
    sessionId,
    roomId: null,
    timestamp: mutedAt,
    payload: {
      userId: nextMuteState.userId,
      muted: nextMuteState.userMuted,
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

// ---------------------------------------------------------------------------
// Multi-device simulation helpers
// ---------------------------------------------------------------------------

/**
 * Builds the DeviceSessionEntity[] snapshot for a mock user's simulated devices.
 * Used in all SESSION:DEVICE_* event payloads.
 */
function buildFakeDeviceSessions(state: MultiDeviceMockState): DeviceSessionEntity[] {
  const sessions: DeviceSessionEntity[] = [
    {
      deviceSessionId: state.primaryDevice.deviceSessionId,
      deviceClass: state.primaryDevice.deviceClass,
      label: state.primaryDevice.label,
      connectedAt: state.primaryDevice.connectedAt,
      isActive: state.activeDeviceSessionId === state.primaryDevice.deviceSessionId,
      isMuted: state.activeDeviceSessionId !== state.primaryDevice.deviceSessionId,
    },
  ]
  if (!state.secondaryPermanentlyDisconnected) {
    sessions.push({
      deviceSessionId: state.secondaryDevice.deviceSessionId,
      deviceClass: state.secondaryDevice.deviceClass,
      label: state.secondaryDevice.label,
      connectedAt: state.secondaryDevice.connectedAt,
      isActive: state.activeDeviceSessionId === state.secondaryDevice.deviceSessionId,
      isMuted: state.activeDeviceSessionId !== state.secondaryDevice.deviceSessionId,
    })
  }
  return sessions
}

/**
 * Picks 1–2 online mocks for two-device simulation and 1–3 others for
 * device-transfer simulation. Emits SESSION:DEVICE_SESSION_CONNECTED for each
 * secondary device so clients start tracking the secondary.
 *
 * Called on the first tick after multiDeviceSimulatorEnabled is turned on.
 */
function setupMultiDeviceMocks(
  sessionId: UUID,
  runtime: MockSimulationRuntime,
  users: MockPresenceUser[]
): void {
  const eligible = users.filter(
    (u) => u.state !== PresenceState.OFFLINE && Boolean(u.primaryRoomId)
  )
  if (eligible.length === 0) {
    return
  }

  const multiDeviceCount = Math.min(2, Math.max(1, Math.floor(eligible.length * 0.3)))
  const pickedIds = pickRandomUsers(
    eligible.map((u) => u.userId),
    multiDeviceCount
  )

  const now = Date.now()
  const usedIds = new Set<UUID>(pickedIds)

  for (const userId of pickedIds) {
    const user = eligible.find((u) => u.userId === userId)
    if (!user) {
      continue
    }

    const primaryId = `fake-dev-${userId}-primary`
    const secondaryId = `fake-dev-${userId}-secondary`
    const multiState: MultiDeviceMockState = {
      userId,
      username: user.username,
      primaryDevice: {
        deviceSessionId: primaryId,
        deviceClass: DeviceClass.DESKTOP,
        label: 'Desktop',
        connectedAt: now - 60_000,
      },
      secondaryDevice: {
        deviceSessionId: secondaryId,
        deviceClass: DeviceClass.MOBILE,
        label: 'Mobile',
        connectedAt: now,
      },
      activeDeviceSessionId: primaryId,
      secondaryPermanentlyDisconnected: false,
    }
    runtime.multiDeviceByUserId.set(userId, multiState)

    // Announce secondary device connected
    broadcastEvent(sessionId, {
      id: randomUUID() as UUID,
      type: 'SESSION:DEVICE_SESSION_CONNECTED',
      version: 1,
      userId,
      userRole: Role.PLAYER,
      sessionId,
      roomId: user.primaryRoomId ?? null,
      timestamp: now,
      payload: {
        sessionId,
        userId,
        deviceSessionId: secondaryId,
        deviceClass: DeviceClass.MOBILE,
        label: 'Mobile',
        connectedAt: now,
        deviceSessions: buildFakeDeviceSessions(multiState),
      },
    })
  }

  // Pick transfer candidates from the remaining non-multi-device users
  const transferEligible = eligible.filter((u) => !usedIds.has(u.userId))
  const transferCount = Math.min(3, Math.max(1, Math.floor(transferEligible.length * 0.2)))
  const transferIds = pickRandomUsers(
    transferEligible.map((u) => u.userId),
    transferCount
  )

  for (const userId of transferIds) {
    const user = transferEligible.find((u) => u.userId === userId)
    if (!user) {
      continue
    }
    runtime.transferByUserId.set(userId, {
      userId,
      username: user.username,
      fromDeviceSessionId: `fake-dev-${userId}-old`,
      toDeviceSessionId: `fake-dev-${userId}-new`,
      transferEmittedAt: null,
    })
  }

  runtime.multiDeviceSetupAt = now
}

/**
 * Each tick: for each multi-device mock whose secondary is still live,
 * randomly switch which device owns the mic (approximately 20% chance per user).
 */
function tickMultiDeviceMics(sessionId: UUID, runtime: MockSimulationRuntime): void {
  const now = Date.now()
  for (const [userId, state] of runtime.multiDeviceByUserId.entries()) {
    if (state.secondaryPermanentlyDisconnected) {
      continue
    }
    if (Math.random() > 0.2) {
      continue
    }
    const previous = state.activeDeviceSessionId
    const next =
      previous === state.primaryDevice.deviceSessionId
        ? state.secondaryDevice.deviceSessionId
        : state.primaryDevice.deviceSessionId
    state.activeDeviceSessionId = next

    broadcastEvent(sessionId, {
      id: randomUUID() as UUID,
      type: 'SESSION:DEVICE_MIC_OWNER_CHANGED',
      version: 1,
      userId,
      userRole: Role.PLAYER,
      sessionId,
      roomId: null,
      timestamp: now,
      payload: {
        sessionId,
        userId,
        previousDeviceSessionId: previous,
        activeDeviceSessionId: next,
        changedAt: now,
        deviceSessions: buildFakeDeviceSessions(state),
      },
    })
  }
}

/**
 * Each tick: for pending transfer mocks, ~25% chance to emit the transfer
 * event (one-shot per assigned transfer candidate).
 */
function tickTransferMocks(sessionId: UUID, runtime: MockSimulationRuntime): void {
  const now = Date.now()
  for (const [userId, state] of runtime.transferByUserId.entries()) {
    if (state.transferEmittedAt !== null) {
      continue
    }
    if (Math.random() > 0.25) {
      continue
    }
    state.transferEmittedAt = now
    broadcastEvent(sessionId, {
      id: randomUUID() as UUID,
      type: 'SESSION:DEVICE_SESSION_TRANSFERRED',
      version: 1,
      userId,
      userRole: Role.PLAYER,
      sessionId,
      roomId: null,
      timestamp: now,
      payload: {
        sessionId,
        userId,
        fromDeviceSessionId: state.fromDeviceSessionId,
        toDeviceSessionId: state.toDeviceSessionId,
        transferredAt: now,
        deviceSessions: [
          {
            deviceSessionId: state.toDeviceSessionId,
            deviceClass: DeviceClass.DESKTOP,
            label: 'Desktop (transferred)',
            connectedAt: now,
            isActive: true,
            isMuted: false,
          },
        ],
      },
    })
  }
}

/**
 * Re-cycles multi-device assignments. Users whose secondary was permanently
 * disconnected by the disconnect sim may be re-selected.
 * Called with a ~5% chance each tick to keep the simulation feeling dynamic.
 */
function maybeRecycleMultiDeviceMocks(
  sessionId: UUID,
  runtime: MockSimulationRuntime,
  users: MockPresenceUser[]
): void {
  if (Math.random() > 0.05) {
    return
  }

  // Find users whose secondary was permanently disconnected — eligible for re-assignment
  const recycleable = [...runtime.multiDeviceByUserId.values()].filter(
    (s) => s.secondaryPermanentlyDisconnected
  )
  if (recycleable.length === 0) {
    return
  }

  const now = Date.now()
  for (const stale of recycleable) {
    runtime.multiDeviceByUserId.delete(stale.userId)
    const user = users.find((u) => u.userId === stale.userId)
    if (!user || !user.primaryRoomId || user.state === PresenceState.OFFLINE) {
      continue
    }

    const primaryId = `fake-dev-${stale.userId}-primary-${now}`
    const secondaryId = `fake-dev-${stale.userId}-secondary-${now}`
    const refreshedState: MultiDeviceMockState = {
      userId: stale.userId,
      username: stale.username,
      primaryDevice: {
        deviceSessionId: primaryId,
        deviceClass: DeviceClass.DESKTOP,
        label: 'Desktop',
        connectedAt: now - 30_000,
      },
      secondaryDevice: {
        deviceSessionId: secondaryId,
        deviceClass: DeviceClass.MOBILE,
        label: 'Mobile',
        connectedAt: now,
      },
      activeDeviceSessionId: primaryId,
      secondaryPermanentlyDisconnected: false,
    }
    runtime.multiDeviceByUserId.set(stale.userId, refreshedState)

    broadcastEvent(sessionId, {
      id: randomUUID() as UUID,
      type: 'SESSION:DEVICE_SESSION_CONNECTED',
      version: 1,
      userId: stale.userId,
      userRole: Role.PLAYER,
      sessionId,
      roomId: user.primaryRoomId,
      timestamp: now,
      payload: {
        sessionId,
        userId: stale.userId,
        deviceSessionId: secondaryId,
        deviceClass: DeviceClass.MOBILE,
        label: 'Mobile',
        connectedAt: now,
        deviceSessions: buildFakeDeviceSessions(refreshedState),
      },
    })
  }
}

/**
 * Cleans up all active multi-device and transfer state, emitting
 * SESSION:DEVICE_SESSION_DISCONNECTED for any live secondary devices.
 */
function clearMultiDeviceState(sessionId: UUID, runtime: MockSimulationRuntime): void {
  const now = Date.now()
  for (const [userId, state] of runtime.multiDeviceByUserId.entries()) {
    if (!state.secondaryPermanentlyDisconnected) {
      broadcastEvent(sessionId, {
        id: randomUUID() as UUID,
        type: 'SESSION:DEVICE_SESSION_DISCONNECTED',
        version: 1,
        userId,
        userRole: Role.PLAYER,
        sessionId,
        roomId: null,
        timestamp: now,
        payload: {
          sessionId,
          userId,
          deviceSessionId: state.secondaryDevice.deviceSessionId,
          deviceClass: state.secondaryDevice.deviceClass,
          label: state.secondaryDevice.label,
          disconnectedAt: now,
          deviceSessions: [
            {
              deviceSessionId: state.primaryDevice.deviceSessionId,
              deviceClass: state.primaryDevice.deviceClass,
              label: state.primaryDevice.label,
              connectedAt: state.primaryDevice.connectedAt,
              isActive: true,
              isMuted: false,
            },
          ],
        },
      })
    }
  }
  runtime.multiDeviceByUserId.clear()
  runtime.transferByUserId.clear()
}

async function runTick(sessionId: UUID): Promise<void> {
  const runtime = runtimeBySession.get(sessionId)
  if (!runtime || !runtime.isRunning) {
    return
  }

  touchRuntime(runtime)

  try {
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
      // Stability: hold the current speaker set for DEV_MOCK_SPEAKING_STABILITY_TICKS ticks
      // before cycling. Only broadcast the diff (stopped + started speakers), not the full
      // clear-then-set churn, to reduce PRESENCE:STATE_CHANGED event frequency.
      runtime.speakingStabilityTicksLeft -= 1

      if (runtime.speakingStabilityTicksLeft <= 0) {
        const shouldSpeakThisTick = Math.random() > 0.35
        const desiredCount = shouldSpeakThisTick ? Math.floor(Math.random() * 3) + 1 : 0
        const nextSpeakingIds = new Set(
          pickRandomUsers(
            speakingEligibleUsers.map((user) => user.userId),
            desiredCount
          )
        )

        // Broadcast ONLINE only for users who stopped speaking
        for (const userId of runtime.speakingNow) {
          if (!nextSpeakingIds.has(userId)) {
            const user = usersById.get(userId)
            if (user) {
              await broadcastPresenceState(sessionId, user, PresenceState.ONLINE)
            }
          }
        }
        runtime.speakingNow.clear()

        // Broadcast SPEAKING only for users who started speaking
        for (const userId of nextSpeakingIds) {
          const user = usersById.get(userId)
          if (!user) {
            continue
          }
          runtime.speakingNow.add(userId)
          await broadcastPresenceState(sessionId, user, PresenceState.SPEAKING)
        }

        runtime.speakingStabilityTicksLeft = DEV_MOCK_SPEAKING_STABILITY_TICKS
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

    // Multi-device simulator
    if (runtime.config.multiDeviceSimulatorEnabled) {
      const needsSetup =
        runtime.multiDeviceByUserId.size === 0 && runtime.transferByUserId.size === 0

      if (needsSetup) {
        setupMultiDeviceMocks(sessionId, runtime, users)
      } else {
        tickMultiDeviceMics(sessionId, runtime)
        tickTransferMocks(sessionId, runtime)
        maybeRecycleMultiDeviceMocks(sessionId, runtime, users)
      }
    }
  } catch (error) {
    logger.error(
      'dev-mock-simulation',
      `Mock simulation tick failed for session ${sessionId}`,
      error
    )
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
  clearMultiDeviceState(sessionId, runtime)
}

function startRunner(sessionId: UUID): void {
  const runtime = getOrCreateRuntime(sessionId)
  if (runtime.tickTimer) {
    touchRuntime(runtime)
    return
  }

  runtime.isRunning = true
  runtime.startedAt = Date.now()
  touchRuntime(runtime, runtime.startedAt)
  runtime.tickTimer = setInterval(() => {
    void runTick(sessionId)
  }, 1400)

  void runTick(sessionId)
}

export async function ensureMockSimulationRunning(sessionId: UUID): Promise<boolean> {
  // Test runs should not spin background intervals that can outlive individual
  // suites and trigger noisy DB-bound tick failures.
  if ((process.env.NODE_ENV || '').toLowerCase() === 'test') {
    return false
  }

  const runtime = getOrCreateRuntime(sessionId)
  await ensureRuntimeConfigHydrated(sessionId, runtime)

  if (!runtime.isRunning && shouldRun(runtime.config)) {
    startRunner(sessionId)
  }

  return runtime.isRunning
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
  touchRuntime(runtime)
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
    DM: number
  }
}> {
  const runtime = getOrCreateRuntime(sessionId)
  await ensureRuntimeConfigHydrated(sessionId, runtime)
  await ensureMockSimulationRunning(sessionId)

  const users = await listSessionMockUsers(sessionId)
  pruneMessageWindow(runtime, Date.now())
  const activeMockUserIds = new Set(
    users
      .filter((user) => user.state !== PresenceState.OFFLINE && Boolean(user.primaryRoomId))
      .map((user) => user.userId)
  )

  return {
    sessionId,
    config: runtime.config,
    isRunning: runtime.isRunning,
    activeMockCount: activeMockUserIds.size,
    speakingNow: [...runtime.speakingNow],
    uptime: runtime.isRunning ? Math.max(0, Date.now() - runtime.startedAt) : 0,
    messagesSentLastMinuteByType: {
      IC: runtime.messageSentAtByType.IC.length,
      OOC: runtime.messageSentAtByType.OOC.length,
      WHISPER: runtime.messageSentAtByType.WHISPER.length,
      DM: runtime.messageSentAtByType.DM.length,
    },
  }
}

export async function updateMockSimulationConfig(params: {
  sessionId: UUID
  config: Partial<MockSimulationConfig>
}): Promise<MockSimulationConfig> {
  const runtime = getOrCreateRuntime(params.sessionId)
  await ensureRuntimeConfigHydrated(params.sessionId, runtime)
  const previousSpeakingSimulatorEnabled = runtime.config.speakingSimulatorEnabled
  const previousMultiDeviceEnabled = runtime.config.multiDeviceSimulatorEnabled
  runtime.config = mergeMockSimulationConfig(runtime.config, params.config)

  if (previousSpeakingSimulatorEnabled && !runtime.config.speakingSimulatorEnabled) {
    const users = await listSessionMockUsers(params.sessionId)
    await clearSpeaking(params.sessionId, runtime, users)
  }

  // When multi-device is toggled off, clean up any active fake device sessions.
  if (previousMultiDeviceEnabled && !runtime.config.multiDeviceSimulatorEnabled) {
    clearMultiDeviceState(params.sessionId, runtime)
  }

  if (shouldRun(runtime.config)) {
    startRunner(params.sessionId)
  } else {
    await stopRunner(params.sessionId)
  }

  await persistMockSimulationConfig(params.sessionId, runtime.config)

  return runtime.config
}

export async function disableMockSimulationForSessionExit(
  sessionId: UUID
): Promise<MockSimulationConfig> {
  const runtime = getOrCreateRuntime(sessionId)
  await ensureRuntimeConfigHydrated(sessionId, runtime)

  const nextConfig = mergeMockSimulationConfig(runtime.config, {
    speakingSimulatorEnabled: false,
    chatSimulatorEnabled: false,
    disconnectSimulatorEnabled: false,
    multiDeviceSimulatorEnabled: false,
  })

  if (runtime.config.speakingSimulatorEnabled) {
    const users = await listSessionMockUsers(sessionId)
    await clearSpeaking(sessionId, runtime, users)
  }

  if (runtime.config.multiDeviceSimulatorEnabled) {
    clearMultiDeviceState(sessionId, runtime)
  }

  runtime.config = nextConfig
  await persistMockSimulationConfig(sessionId, runtime.config)
  await stopRunner(sessionId)

  return runtime.config
}

export async function stopMockSimulation(sessionId: UUID): Promise<void> {
  const runtime = getOrCreateRuntime(sessionId)
  await ensureRuntimeConfigHydrated(sessionId, runtime)
  await stopRunner(sessionId)
}

export async function purgeMockSimulationSessionState(sessionId: UUID): Promise<void> {
  const runtime = runtimeBySession.get(sessionId)
  if (runtime) {
    if (!runtime.configHydrated) {
      await ensureRuntimeConfigHydrated(sessionId, runtime)
    }
    await stopRunner(sessionId)
  }

  runtimeBySession.delete(sessionId)
  await deletePersistedMockSimulationConfig(sessionId)
}

export async function getMockSimulationPlayerCount(sessionId: UUID): Promise<number> {
  const runtime = getOrCreateRuntime(sessionId)
  await ensureRuntimeConfigHydrated(sessionId, runtime)
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

export const __testOnly = {
  emitPersistedChatMessage,
  resetRuntime(sessionId?: UUID) {
    if (sessionId) {
      runtimeBySession.delete(sessionId)
      return
    }

    runtimeBySession.clear()
  },
}
