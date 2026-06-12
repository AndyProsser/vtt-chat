/**
 * WebSocket Server Setup
 * Handles WebSocket connections, event routing, and client lifecycle.
 */

import { WebSocket, WebSocketServer } from 'ws'
import { Server as HTTPServer } from 'node:http'
import type { DeviceSessionEntity } from '@shared'
import { EventDispatcher } from './dispatcher'
import { buildSessionDeviceSessionsByUser } from './device-sessions'
import {
  clearInMemorySessionRecoveryState,
  registerEventForRecovery,
  registerEventForRecoveryDurable,
  replayEventsForConnectionDurable,
  updateConnectionState,
  createConnectionState,
  type ConnectionState,
} from './state-recovery'
import {
  sessionHandlers,
  chatHandlers,
  roomHandlers,
  notesHandlers,
  audioHandlers,
} from './handlers'
import type { EventEnvelope, UUID } from '@shared'
import type { DeviceClass } from '@shared'
import { PresenceState, Role } from '@shared'
import { ErrorCode, createError } from '@shared'
import type { TokenPayload } from '@/services/auth.service'
import { verifyToken } from '@/services/auth.service'
import { getSession } from '@/services/session/core.service'
import { resolveTypingAudience } from '@/services/chat-visibility.service'
import { listCampaignMemberIds } from '@/repositories/campaign.repository'
import { findSessionById } from '@/repositories/session.repository'
import { broadcastLobbyStatsUpdated } from '@/services/lobby/lobby-stats.service'
import { logger } from '@/utils'
import eventBroadcaster from '@/ws/event-broadcaster'
import { sessionDisconnectCascadeService } from '@/services/session/disconnect-cascade.service'
import {
  ensurePresenceRecoveredFromSnapshots,
  getSessionPresence,
  snapshotSessionPresence,
  updatePresenceState,
} from '@/services/room.service'
import { getServerMuteEnforcementState } from '@/services/audio/effects.service'

const AUTH_TIMEOUT_MS = 5000
const MAX_WS_MESSAGE_SIZE = 64 * 1024
const UNASSIGNED_SESSION_ID = '00000000-0000-4000-8000-000000000000' as UUID
const DEFAULT_DEVICE_CLASS = 'DESKTOP' as DeviceClass

const isDeviceClass = (value: unknown): value is DeviceClass =>
  value === 'DESKTOP' || value === 'MOBILE' || value === 'TABLET'

interface AuthMessage {
  type: 'WS:AUTH'
  token: string
  sessionId?: UUID
  lastEventId?: string
  deviceSessionId?: string
  deviceClass?: DeviceClass
}

/**
 * Extended WebSocket with custom properties
 */
interface ExtendedWebSocket extends WebSocket {
  connectionState?: ConnectionState
  isAlive?: boolean
  authPayload?: TokenPayload
  authDeviceSessionId?: string
  authDeviceClass?: DeviceClass
  authTimeoutId?: ReturnType<typeof setTimeout>
}

/**
 * WebSocket manager
 */
export class WebSocketManager {
  private wss: any
  private dispatcher: EventDispatcher
  private connections: Map<string, ExtendedWebSocket> = new Map()
  private snapshotIntervalId: ReturnType<typeof setInterval>
  private heartbeatIntervalId!: ReturnType<typeof setInterval>

  constructor(httpServer: HTTPServer) {
    this.wss = new WebSocketServer({ server: httpServer })
    this.dispatcher = new EventDispatcher()
    this.setupDispatchers()
    this.setupServer()

    // Initialize event broadcaster
    eventBroadcaster.setWebSocketManager(this)

    this.snapshotIntervalId = setInterval(() => {
      void this.persistPresenceSnapshots()
    }, 30000)
  }

  private async persistPresenceSnapshots(): Promise<void> {
    const sessions = new Set<UUID>()

    this.connections.forEach((ws) => {
      const sessionId = ws.connectionState?.sessionId
      if (sessionId && sessionId !== UNASSIGNED_SESSION_ID) {
        sessions.add(sessionId)
      }
    })

    for (const sessionId of sessions) {
      try {
        await snapshotSessionPresence(sessionId)
      } catch (error) {
        logger.warn('ws', 'Failed to persist presence snapshot', {
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  /**
   * Register all event handlers with dispatcher
   */
  private setupDispatchers(): void {
    // Session events
    this.dispatcher.registerHandler('SESSION:CREATED', sessionHandlers.handleSessionCreated)
    this.dispatcher.registerHandler('SESSION:STARTED', sessionHandlers.handleSessionStarted)
    this.dispatcher.registerHandler('SESSION:PAUSED', sessionHandlers.handleSessionPaused)
    this.dispatcher.registerHandler('SESSION:RESUMED', sessionHandlers.handleSessionResumed)
    this.dispatcher.registerHandler(
      'SESSION:COOLDOWN_STARTED',
      sessionHandlers.handleSessionCooldownStarted
    )
    this.dispatcher.registerHandler(
      'SESSION:COOLDOWN_EXTENDED',
      sessionHandlers.handleSessionCooldownExtended
    )
    this.dispatcher.registerHandler(
      'SESSION:COOLDOWN_ENDED',
      sessionHandlers.handleSessionCooldownEnded
    )
    this.dispatcher.registerHandler('SESSION:ENDED', sessionHandlers.handleSessionEnded)

    // Chat events
    this.dispatcher.registerHandler('CHAT:MESSAGE_SENT', chatHandlers.handleMessageSent)
    this.dispatcher.registerHandler('CHAT:MESSAGE_EDITED', chatHandlers.handleMessageEdited)
    this.dispatcher.registerHandler('CHAT:MESSAGE_DELETED', chatHandlers.handleMessageDeleted)
    this.dispatcher.registerHandler('CHAT:TYPING_STARTED', chatHandlers.handleTypingStarted)
    this.dispatcher.registerHandler('CHAT:TYPING_STOPPED', chatHandlers.handleTypingStopped)

    // Room & Presence events
    this.dispatcher.registerHandler('ROOM:CREATED', roomHandlers.handleRoomCreated)
    this.dispatcher.registerHandler('ROOM:USER_JOINED', roomHandlers.handleUserJoined)
    this.dispatcher.registerHandler('ROOM:USER_LEFT', roomHandlers.handleUserLeft)
    this.dispatcher.registerHandler(
      'PRESENCE:STATE_CHANGED',
      roomHandlers.handlePresenceStateChanged
    )

    // Notes events
    this.dispatcher.registerHandler('NOTES:CREATED', notesHandlers.handleNoteCreated)
    this.dispatcher.registerHandler('NOTES:UPDATED', notesHandlers.handleNoteUpdated)
    this.dispatcher.registerHandler('NOTES:DELETED', notesHandlers.handleNoteDeleted)

    // Audio events
    this.dispatcher.registerHandler('AUDIO:EFFECT_APPLIED', audioHandlers.handleEffectApplied)
    this.dispatcher.registerHandler('AUDIO:EFFECT_REMOVED', audioHandlers.handleEffectRemoved)
    this.dispatcher.registerHandler('AUDIO:PRESET_LOADED', audioHandlers.handlePresetLoaded)
    this.dispatcher.registerHandler('AUDIO:ENVIRONMENT_SET', audioHandlers.handleEnvironmentSet)
    this.dispatcher.registerHandler(
      'AUDIO:DM_OVERRIDE_APPLIED',
      audioHandlers.handleDMOverrideApplied
    )
    this.dispatcher.registerHandler(
      'AUDIO:DM_OVERRIDE_REMOVED',
      audioHandlers.handleDMOverrideRemoved
    )
    this.dispatcher.registerHandler(
      'AUDIO:MUTE_STATE_CHANGED',
      audioHandlers.handleMuteStateChanged
    )
  }

  /**
   * Set up WebSocket server event handlers
   */
  private setupServer(): void {
    this.wss.on('connection', (ws: ExtendedWebSocket, req: any) => {
      this.handleConnection(ws, req)
    })

    // Heartbeat to detect stale connections
    this.heartbeatIntervalId = setInterval(() => {
      this.wss.clients.forEach((ws: ExtendedWebSocket) => {
        if (!ws.isAlive) {
          ws.terminate()
          return
        }
        ws.isAlive = false
        ws.ping()
      })
    }, 30000) // 30 second heartbeat
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: ExtendedWebSocket, req: any): void {
    // Tokens in query params leak via logs/history. Reject and require WS auth message.
    const url = new URL(req.url || '/', `http://${req.headers.host}`)
    if (url.searchParams.get('token')) {
      ws.close(1008, 'Token in query string is not allowed')
      return
    }

    ws.isAlive = true
    ws.authTimeoutId = setTimeout(() => {
      if (!ws.authPayload) {
        ws.close(1008, 'Authentication timeout')
      }
    }, AUTH_TIMEOUT_MS)

    // Set up message handler
    ws.on('message', (data: any) => {
      this.handleMessage(ws, data)
    })

    // Heartbeat pong
    ws.on('pong', () => {
      ws.isAlive = true
    })

    // Disconnection handler
    ws.on('close', () => {
      this.handleDisconnection(ws)
    })

    ws.on('error', (err: Error) => {
      logger.error('ws', 'Connection error', err)
    })
  }

  private async authenticateConnection(
    ws: ExtendedWebSocket,
    token: string,
    sessionId?: UUID,
    lastEventId?: string,
    deviceSessionId?: string,
    deviceClass?: DeviceClass
  ): Promise<void> {
    const payload = verifyToken(token)
    if (!payload) {
      ws.close(1008, 'Invalid or expired token')
      return
    }

    const resolvedSessionId =
      sessionId || (payload.sessionId as UUID | undefined) || UNASSIGNED_SESSION_ID

    const connectionId = `conn-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const connectionState = createConnectionState(
      payload.userId as UUID,
      resolvedSessionId,
      connectionId
    )

    ws.authPayload = payload
    ws.connectionState = connectionState
    ws.authDeviceSessionId = deviceSessionId || connectionId
    ws.authDeviceClass = isDeviceClass(deviceClass) ? deviceClass : DEFAULT_DEVICE_CLASS

    if (lastEventId) {
      updateConnectionState(connectionState, lastEventId)
      connectionState.isReconnecting = true
    }

    this.connections.set(connectionId, ws)

    if (ws.authTimeoutId) {
      clearTimeout(ws.authTimeoutId)
      ws.authTimeoutId = undefined
    }

    logger.info('ws', `Client authenticated: ${payload.username} (${connectionId})`)
    logger.info('ws', 'Client session binding resolved', {
      connectionId,
      userId: payload.userId,
      tokenSessionId: payload.sessionId || null,
      authSessionId: sessionId || null,
      resolvedSessionId,
    })

    ws.send(
      JSON.stringify({
        type: 'WS:CONNECTED',
        connectionId,
        userId: payload.userId,
        username: payload.username,
        role: payload.role,
        deviceSessionId: ws.authDeviceSessionId,
        deviceClass: ws.authDeviceClass,
      })
    )

    if (connectionState.sessionId !== UNASSIGNED_SESSION_ID) {
      this.broadcastDeviceSessionSnapshot({
        sessionId: connectionState.sessionId,
        userId: payload.userId as UUID,
        userRole: payload.role as Role,
        eventType: 'SESSION:DEVICE_SESSION_CONNECTED',
        deviceSessionId: ws.authDeviceSessionId,
        deviceClass: ws.authDeviceClass,
        changedAt: connectionState.connectedAt,
      })
    }

    if (lastEventId && connectionState.sessionId !== UNASSIGNED_SESSION_ID) {
      const replayEvents = await replayEventsForConnectionDurable({
        sessionId: connectionState.sessionId,
        userId: payload.userId as UUID,
        lastEventId,
      })

      for (const replayEvent of replayEvents) {
        ws.send(
          JSON.stringify({
            type: 'WS:EVENT',
            event: replayEvent,
          })
        )
        updateConnectionState(connectionState, replayEvent.id)
      }

      connectionState.isReconnecting = false
    }

    if (connectionState.sessionId !== UNASSIGNED_SESSION_ID) {
      sessionDisconnectCascadeService.handleUserConnected(
        connectionState.sessionId,
        payload.userId as UUID
      )
      void this.recoverAndMarkConnected(connectionState.sessionId, payload)
    } else {
      void broadcastLobbyStatsUpdated(payload.userId as UUID, payload.role as Role)
    }
  }

  private async recoverAndMarkConnected(sessionId: UUID, payload: TokenPayload): Promise<void> {
    try {
      await ensurePresenceRecoveredFromSnapshots(sessionId)
      const previousPresence = await getSessionPresence(sessionId)
      const wasOnline = previousPresence.some(
        (entry) => entry.userId === (payload.userId as UUID) && entry.state === PresenceState.ONLINE
      )

      await updatePresenceState({
        sessionId,
        userId: payload.userId as UUID,
        username: payload.username,
        state: PresenceState.ONLINE,
      })

      // Re-broadcast the player's current mute state so all clients stay in
      // sync after a page refresh. The player is muted until they click Go Live
      // (which calls /api/audio/unmute), so all clients should show muted.
      try {
        const muteState = await getServerMuteEnforcementState({
          sessionId,
          userId: payload.userId as UUID,
        })
        const mutedAt = Date.now()
        // Send to all clients — including the reconnecting player so their local
        // avatar badge and mute state update immediately without going live first.
        this.broadcastEventToSession(sessionId, {
          id: crypto.randomUUID() as UUID,
          type: 'AUDIO:MUTE_STATE_CHANGED' as any,
          version: 1,
          userId: payload.userId as UUID,
          userRole: payload.role as Role,
          sessionId,
          roomId: null,
          timestamp: mutedAt,
          payload: { userId: payload.userId, muted: muteState.userMuted, mutedAt },
        })
      } catch {
        // Non-critical — mute state will correct itself when the player goes live
      }

      if (!wasOnline) {
        await this.broadcastCampaignListInvalidated(sessionId, payload.userId as UUID)
      }

      await broadcastLobbyStatsUpdated(payload.userId as UUID, payload.role as Role)
    } catch (error) {
      logger.warn('ws', 'Failed to recover presence for connection', {
        sessionId,
        userId: payload.userId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Handle incoming message from client
   */
  private async handleMessage(ws: ExtendedWebSocket, data: any): Promise<void> {
    try {
      const raw = Buffer.isBuffer(data) ? data.toString('utf8') : String(data)
      if (raw.length > MAX_WS_MESSAGE_SIZE) {
        ws.close(1009, 'Message too large')
        return
      }
      const message = JSON.parse(raw)

      if (!ws.authPayload) {
        const auth = message as Partial<AuthMessage>
        if (auth.type !== 'WS:AUTH' || typeof auth.token !== 'string') {
          ws.close(1008, 'Authenticate first using WS:AUTH')
          return
        }
        await this.authenticateConnection(
          ws,
          auth.token,
          typeof auth.sessionId === 'string' && auth.sessionId
            ? (auth.sessionId as UUID)
            : undefined,
          typeof auth.lastEventId === 'string' && auth.lastEventId ? auth.lastEventId : undefined,
          typeof auth.deviceSessionId === 'string' && auth.deviceSessionId
            ? auth.deviceSessionId
            : undefined,
          auth.deviceClass
        )
        return
      }

      const event = message as EventEnvelope

      // Never trust client-supplied identity data.
      // Normalize identity from authenticated WS payload instead of rejecting
      // mismatched client envelopes (e.g. stale role/user during UI transitions).
      const normalizedEvent: EventEnvelope = {
        ...event,
        userId: ws.authPayload.userId as UUID,
        userRole: ws.authPayload.role as Role,
      }

      if (ws.connectionState && ws.connectionState.sessionId === UNASSIGNED_SESSION_ID) {
        ws.connectionState.sessionId = normalizedEvent.sessionId
        void this.recoverAndMarkConnected(normalizedEvent.sessionId, ws.authPayload)
      }

      // Dispatch event
      await this.dispatcher.dispatch(normalizedEvent)

      // Log event for recovery
      if (ws.connectionState) {
        registerEventForRecovery(ws.connectionState.sessionId, normalizedEvent)
        updateConnectionState(ws.connectionState, normalizedEvent.id)
      }

      // Send acknowledgment
      ws.send(
        JSON.stringify({
          type: 'WS:ACK',
          eventId: normalizedEvent.id,
          status: 'processed',
        })
      )

      // Broadcast to other clients in same session (simple implementation)
      const visibleTo = await this.resolveClientEventAudience(normalizedEvent)

      if (ws.connectionState) {
        await registerEventForRecoveryDurable(
          ws.connectionState.sessionId,
          normalizedEvent,
          visibleTo
        )
      }

      this.broadcastToSession(normalizedEvent.sessionId, normalizedEvent, ws, visibleTo)
    } catch (err: any) {
      logger.warn('ws', 'Error processing message', {
        code: err.code || ErrorCode.INTERNAL_ERROR,
      })
      ws.send(
        JSON.stringify({
          type: 'WS:ERROR',
          code: err.code || ErrorCode.INTERNAL_ERROR,
          message: 'Unable to process WebSocket message',
        })
      )
    }
  }

  /**
   * Broadcast event to all clients in a session (used for WS-originated events).
   * Excludes the sender.
   */
  private broadcastToSession(
    sessionId: UUID,
    event: EventEnvelope,
    sender: ExtendedWebSocket,
    visibleTo?: UUID[]
  ): void {
    const OPEN_STATE = 1 // WebSocket.OPEN
    this.wss.clients.forEach((client: any) => {
      if (
        client.readyState === OPEN_STATE &&
        client.authPayload &&
        client.connectionState?.sessionId === sessionId &&
        client !== sender
      ) {
        if (visibleTo && !visibleTo.includes(client.authPayload.userId as UUID)) {
          return
        }

        client.send(
          JSON.stringify({
            type: 'WS:EVENT',
            event,
          })
        )
      }
    })
  }

  private async resolveClientEventAudience(event: EventEnvelope): Promise<UUID[] | undefined> {
    if (event.type !== 'CHAT:TYPING_STARTED' && event.type !== 'CHAT:TYPING_STOPPED') {
      return undefined
    }

    if (!event.roomId) {
      logger.warn('ws', 'Dropping roomless typing broadcast', {
        sessionId: event.sessionId,
        userId: event.userId,
        eventType: event.type,
      })
      return [event.userId as UUID]
    }

    const session = await getSession(event.sessionId)
    if (!session) {
      logger.warn('ws', 'Unable to resolve session for typing audience', {
        sessionId: event.sessionId,
        userId: event.userId,
        roomId: event.roomId,
        eventType: event.type,
      })
      return [event.userId as UUID]
    }

    return resolveTypingAudience({
      sessionId: event.sessionId,
      roomId: event.roomId as UUID,
      dmId: session.dmId as UUID,
      requesterId: event.userId as UUID,
      requesterRole: String(event.userRole),
    })
  }

  /**
   * Broadcast an event to all clients in a session with optional visibility filtering.
   * Used by REST route handlers to push server-originated events to clients.
   *
   * @param sessionId - Target session
   * @param event - Event envelope to broadcast
   * @param visibleTo - If set, only deliver to users in this list; otherwise deliver to all
   */
  broadcastEventToSession(sessionId: UUID, event: EventEnvelope, visibleTo?: UUID[]): void {
    void registerEventForRecoveryDurable(sessionId, event, visibleTo)

    const OPEN_STATE = 1
    this.wss.clients.forEach((client: any) => {
      const ws = client as ExtendedWebSocket
      if (
        ws.readyState !== OPEN_STATE ||
        !ws.authPayload ||
        ws.connectionState?.sessionId !== sessionId
      ) {
        return
      }

      // Visibility check: if restricted, only deliver to listed users
      if (visibleTo && !visibleTo.includes(ws.authPayload.userId as UUID)) {
        return
      }

      ws.send(JSON.stringify({ type: 'WS:EVENT', event }))
    })
  }

  getSessionDeviceSessionsSnapshot(sessionId: UUID): Record<UUID, DeviceSessionEntity[]> {
    return buildSessionDeviceSessionsByUser(this.connections.values(), sessionId)
  }

  getActiveSessionIdsForUser(userId: UUID): UUID[] {
    const sessionIds = new Set<UUID>()

    this.connections.forEach((ws) => {
      if (!ws.authPayload || ws.authPayload.userId !== userId) {
        return
      }

      const sessionId = ws.connectionState?.sessionId
      if (!sessionId || sessionId === UNASSIGNED_SESSION_ID) {
        return
      }

      sessionIds.add(sessionId)
    })

    return [...sessionIds]
  }

  /**
   * Broadcast an event to all connected clients who are members of a campaign.
   * Used for campaign-scoped events such as greenroom chat.
   * Looks up campaign member IDs from the DB and delivers to matching connections.
   */
  async broadcastToCampaignMembers(campaignId: UUID, event: EventEnvelope): Promise<void> {
    const OPEN_STATE = 1
    let memberIds: string[]
    try {
      memberIds = await listCampaignMemberIds(campaignId)
    } catch (error) {
      logger.error('ws', 'Failed to resolve campaign members for broadcast', {
        campaignId,
        error: error instanceof Error ? error.message : String(error),
      })
      return
    }
    const memberSet = new Set(memberIds)
    this.wss.clients.forEach((client: any) => {
      const ws = client as ExtendedWebSocket
      if (ws.readyState !== OPEN_STATE || !ws.authPayload) {
        return
      }
      if (!memberSet.has(ws.authPayload.userId)) {
        return
      }
      ws.send(JSON.stringify({ type: 'WS:EVENT', event }))
    })
  }

  /**
   * Handle client disconnection
   */
  private handleDisconnection(ws: ExtendedWebSocket): void {
    if (ws.authTimeoutId) {
      clearTimeout(ws.authTimeoutId)
      ws.authTimeoutId = undefined
    }

    if (!ws.connectionState) return

    const connectionId = ws.connectionState.connectionId
    logger.info('ws', `Client disconnected: ${connectionId}`)

    this.connections.delete(connectionId)

    if (ws.authPayload && ws.connectionState.sessionId !== UNASSIGNED_SESSION_ID) {
      const sessionId = ws.connectionState.sessionId
      const userId = ws.authPayload.userId as UUID

      if (!this.hasActiveConnectionsInSession(sessionId)) {
        clearInMemorySessionRecoveryState(sessionId)
      }

      this.broadcastDeviceSessionSnapshot({
        sessionId,
        userId,
        userRole: ws.authPayload.role as Role,
        eventType: 'SESSION:DEVICE_SESSION_DISCONNECTED',
        deviceSessionId: ws.authDeviceSessionId,
        deviceClass: ws.authDeviceClass,
        changedAt: Date.now(),
      })

      if (!this.hasActiveConnectionForUser(sessionId, userId)) {
        void (async () => {
          await sessionDisconnectCascadeService.handleUserDisconnected({
            sessionId,
            userId,
            username: ws.authPayload!.username,
            userRole: ws.authPayload!.role,
            wsManager: this,
            isUserConnected: (candidateSessionId, candidateUserId) =>
              this.hasActiveConnectionForUser(candidateSessionId, candidateUserId),
            isSessionConnected: (candidateSessionId) =>
              this.hasActiveConnectionsInSession(candidateSessionId),
          })
          await this.broadcastCampaignListInvalidated(sessionId, userId)
          await broadcastLobbyStatsUpdated(userId, ws.authPayload!.role as Role)
        })()
        return
      }
    }

    if (ws.authPayload) {
      void broadcastLobbyStatsUpdated(ws.authPayload.userId as UUID, ws.authPayload.role as Role)
    }
  }

  private async broadcastCampaignListInvalidated(
    sessionId: UUID,
    actorUserId: UUID
  ): Promise<void> {
    try {
      const session = await findSessionById(sessionId)
      if (!session?.campaignId) {
        return
      }

      eventBroadcaster.sendToAllAuthenticated({
        id: crypto.randomUUID() as UUID,
        type: 'CAMPAIGN:LIST_INVALIDATED',
        version: 1,
        userId: actorUserId,
        userRole: Role.SYSTEM,
        sessionId: null as unknown as UUID,
        roomId: null,
        timestamp: Date.now(),
        payload: {
          campaignId: session.campaignId as UUID,
          reason: 'RUNTIME_PRESENCE_CHANGED',
        },
      })

      await eventBroadcaster.broadcastToCampaignMembers(session.campaignId as UUID, {
        id: crypto.randomUUID() as UUID,
        type: 'CAMPAIGN:PARTY_PRESENCE_UPDATED',
        version: 1,
        userId: actorUserId,
        userRole: Role.SYSTEM,
        sessionId: null as unknown as UUID,
        roomId: null,
        timestamp: Date.now(),
        payload: {
          campaignId: session.campaignId as UUID,
          sessionId,
          reason: 'RUNTIME_PRESENCE_CHANGED',
          changedAt: Date.now(),
        },
      })
    } catch (error) {
      logger.warn('ws', 'Failed to broadcast campaign list invalidation', {
        sessionId,
        actorUserId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  hasActiveConnectionForUser(sessionId: UUID, userId: UUID): boolean {
    for (const ws of this.connections.values()) {
      if (
        ws.authPayload?.userId === userId &&
        ws.connectionState?.sessionId === sessionId &&
        ws.readyState === WebSocket.OPEN
      ) {
        return true
      }
    }

    return false
  }

  /**
   * Snapshot of active runtime session bindings by user.
   * Unassigned (lobby) sockets are excluded from this map.
   */
  getActiveRuntimeSessionsByUser(): Record<UUID, UUID[]> {
    const byUser = new Map<UUID, Set<UUID>>()

    for (const ws of this.connections.values()) {
      if (ws.readyState !== WebSocket.OPEN || !ws.authPayload?.userId) {
        continue
      }

      const boundSessionId = ws.connectionState?.sessionId
      if (!boundSessionId || boundSessionId === UNASSIGNED_SESSION_ID) {
        continue
      }

      const userId = ws.authPayload.userId as UUID
      const existing = byUser.get(userId) || new Set<UUID>()
      existing.add(boundSessionId)
      byUser.set(userId, existing)
    }

    const snapshot: Record<UUID, UUID[]> = {}
    for (const [userId, sessionIds] of byUser.entries()) {
      snapshot[userId] = Array.from(sessionIds)
    }

    return snapshot
  }

  /**
   * Snapshot of users with at least one open WS connection not bound to a runtime session.
   */
  getUsersWithUnassignedConnections(): UUID[] {
    const users = new Set<UUID>()

    for (const ws of this.connections.values()) {
      if (ws.readyState !== WebSocket.OPEN || !ws.authPayload?.userId) {
        continue
      }

      const boundSessionId = ws.connectionState?.sessionId
      if (boundSessionId === UNASSIGNED_SESSION_ID) {
        users.add(ws.authPayload.userId as UUID)
      }
    }

    return Array.from(users)
  }

  hasActiveConnectionsInSession(sessionId: UUID): boolean {
    for (const ws of this.connections.values()) {
      if (ws.connectionState?.sessionId === sessionId && ws.readyState === WebSocket.OPEN) {
        return true
      }
    }

    return false
  }

  /**
   * Get number of active connections
   */
  getConnectionCount(): number {
    return this.wss.clients.size
  }

  /**
   * Get number of active sessions
   */
  getSessionCount(): number {
    const sessions = new Set<UUID>()
    this.wss.clients.forEach((client: ExtendedWebSocket) => {
      if (client.connectionState?.sessionId) {
        sessions.add(client.connectionState.sessionId)
      }
    })
    return sessions.size
  }

  /**
   * Close all connections and shut down
   */
  close(): Promise<void> {
    return new Promise((resolve) => {
      clearInterval(this.snapshotIntervalId)
      clearInterval(this.heartbeatIntervalId)
      this.wss.close(() => {
        resolve()
      })
    })
  }

  private broadcastDeviceSessionSnapshot(params: {
    sessionId: UUID
    userId: UUID
    userRole: Role
    eventType: 'SESSION:DEVICE_SESSION_CONNECTED' | 'SESSION:DEVICE_SESSION_DISCONNECTED'
    deviceSessionId?: string
    deviceClass?: DeviceClass
    changedAt: number
  }): void {
    const deviceSessionsByUser = this.getSessionDeviceSessionsSnapshot(params.sessionId)
    const userDeviceSessions = deviceSessionsByUser[params.userId] || []
    const matchingDevice = userDeviceSessions.find(
      (device) => device.deviceSessionId === params.deviceSessionId
    )
    const fallbackLabel = matchingDevice?.label || 'Device'
    const fallbackDeviceClass = params.deviceClass || DEFAULT_DEVICE_CLASS

    const payload =
      params.eventType === 'SESSION:DEVICE_SESSION_CONNECTED'
        ? {
            sessionId: params.sessionId,
            userId: params.userId,
            deviceSessionId: params.deviceSessionId || '',
            deviceClass: fallbackDeviceClass,
            label: fallbackLabel,
            connectedAt: params.changedAt,
            deviceSessions: userDeviceSessions,
          }
        : {
            sessionId: params.sessionId,
            userId: params.userId,
            deviceSessionId: params.deviceSessionId || '',
            deviceClass: fallbackDeviceClass,
            label: fallbackLabel,
            disconnectedAt: params.changedAt,
            deviceSessions: userDeviceSessions,
          }

    this.broadcastEventToSession(params.sessionId, {
      id: crypto.randomUUID() as UUID,
      type: params.eventType,
      version: 1,
      userId: params.userId,
      userRole: params.userRole,
      sessionId: params.sessionId,
      roomId: null,
      timestamp: params.changedAt,
      payload,
    })
  }
}

/**
 * Export types and functions for external use
 */
export { ConnectionState }
