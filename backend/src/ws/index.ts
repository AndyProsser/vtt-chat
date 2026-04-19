/**
 * WebSocket Server Setup
 * Handles WebSocket connections, event routing, and client lifecycle.
 */

import { WebSocket } from 'ws'
import type { Server as WSServer } from 'ws'
import { Server as HTTPServer } from 'http'
import { EventDispatcher } from './dispatcher'
import {
  handleReconnect,
  registerEventForRecovery,
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
import { PresenceState } from '@shared'
import { ErrorCode, createError } from '@shared'
import type { TokenPayload } from '@/services/auth.service'
import { extractTokenFromHeader, verifyToken } from '@/services/auth.service'
import { logger } from '@/utils'
import eventBroadcaster from '@/services/event-broadcaster.service'
import {
  ensurePresenceRecoveredFromSnapshots,
  snapshotSessionPresence,
  updatePresenceState,
} from '@/core/rooms/room.service'

const AUTH_TIMEOUT_MS = 5000
const MAX_WS_MESSAGE_SIZE = 64 * 1024
const UNASSIGNED_SESSION_ID = '00000000-0000-4000-8000-000000000000' as UUID

interface AuthMessage {
  type: 'WS:AUTH'
  token: string
}

// Create WebSocket server class if needed
let WebSocketServer: typeof WSServer

try {
  const ws = require('ws')
  WebSocketServer = ws.Server
} catch {
  WebSocketServer = require('ws').WebSocketServer
}

/**
 * Extended WebSocket with custom properties
 */
interface ExtendedWebSocket extends WebSocket {
  connectionState?: ConnectionState
  isAlive?: boolean
  authPayload?: TokenPayload
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
    this.dispatcher.registerHandler('AUDIO:ENVIRONMENT_SET', audioHandlers.handleEnvironmentSet)
    this.dispatcher.registerHandler(
      'AUDIO:DM_OVERRIDE_APPLIED',
      audioHandlers.handleDMOverrideApplied
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
    setInterval(() => {
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

  private authenticateConnection(ws: ExtendedWebSocket, token: string): void {
    const payload = verifyToken(token)
    if (!payload) {
      ws.close(1008, 'Invalid or expired token')
      return
    }

    const connectionId = `conn-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const connectionState = createConnectionState(
      payload.userId as UUID,
      (payload.sessionId || UNASSIGNED_SESSION_ID) as UUID,
      connectionId
    )

    ws.authPayload = payload
    ws.connectionState = connectionState
    this.connections.set(connectionId, ws)

    if (ws.authTimeoutId) {
      clearTimeout(ws.authTimeoutId)
      ws.authTimeoutId = undefined
    }

    logger.info('ws', `Client authenticated: ${payload.username} (${connectionId})`)

    ws.send(
      JSON.stringify({
        type: 'WS:CONNECTED',
        connectionId,
        userId: payload.userId,
        username: payload.username,
        role: payload.role,
      })
    )

    if (connectionState.sessionId !== UNASSIGNED_SESSION_ID) {
      void this.recoverAndMarkConnected(connectionState.sessionId, payload)
    }
  }

  private async recoverAndMarkConnected(sessionId: UUID, payload: TokenPayload): Promise<void> {
    try {
      await ensurePresenceRecoveredFromSnapshots(sessionId)
      await updatePresenceState({
        sessionId,
        userId: payload.userId as UUID,
        username: payload.username,
        state: PresenceState.ONLINE,
      })
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
        this.authenticateConnection(ws, auth.token)
        return
      }

      const event = message as EventEnvelope

      // Never trust client-supplied identity data.
      if (event.userId !== ws.authPayload.userId || event.userRole !== ws.authPayload.role) {
        throw createError(ErrorCode.PERMISSION_DENIED, {
          message: 'Event identity does not match authenticated user',
        })
      }

      if (ws.connectionState && ws.connectionState.sessionId === UNASSIGNED_SESSION_ID) {
        ws.connectionState.sessionId = event.sessionId
        void this.recoverAndMarkConnected(event.sessionId, ws.authPayload)
      }

      // Dispatch event
      await this.dispatcher.dispatch(event)

      // Log event for recovery
      if (ws.connectionState) {
        registerEventForRecovery(ws.connectionState.sessionId, event)
        updateConnectionState(ws.connectionState, event.id)
      }

      // Send acknowledgment
      ws.send(
        JSON.stringify({
          type: 'WS:ACK',
          eventId: event.id,
          status: 'processed',
        })
      )

      // Broadcast to other clients in same session (simple implementation)
      this.broadcastToSession(event.sessionId, event, ws)
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
    sender: ExtendedWebSocket
  ): void {
    const OPEN_STATE = 1 // WebSocket.OPEN
    this.wss.clients.forEach((client: any) => {
      if (
        client.readyState === OPEN_STATE &&
        client.authPayload &&
        client.connectionState?.sessionId === sessionId &&
        client !== sender
      ) {
        client.send(
          JSON.stringify({
            type: 'WS:EVENT',
            event,
          })
        )
      }
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

    if (ws.authPayload && ws.connectionState.sessionId !== UNASSIGNED_SESSION_ID) {
      void updatePresenceState({
        sessionId: ws.connectionState.sessionId,
        userId: ws.authPayload.userId as UUID,
        username: ws.authPayload.username,
        state: PresenceState.OFFLINE,
      })
    }

    // Keep connection state for reconnection recovery (timeout after 30 mins)
    // For now, just remove it
    this.connections.delete(connectionId)
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
      this.wss.close(() => {
        resolve()
      })
    })
  }
}

/**
 * Export types and functions for external use
 */
export { ConnectionState }
