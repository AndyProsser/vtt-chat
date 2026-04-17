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
import { ErrorCode, createError } from '@shared'
import { extractTokenFromHeader, verifyToken } from '@/services/auth.service'

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
}

/**
 * WebSocket manager
 */
export class WebSocketManager {
  private wss: any
  private dispatcher: EventDispatcher
  private connections: Map<string, ExtendedWebSocket> = new Map()

  constructor(httpServer: HTTPServer) {
    this.wss = new WebSocketServer({ server: httpServer })
    this.dispatcher = new EventDispatcher()
    this.setupDispatchers()
    this.setupServer()
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
    this.dispatcher.registerHandler('PRESENCE:STATE_CHANGED', roomHandlers.handlePresenceStateChanged)

    // Notes events
    this.dispatcher.registerHandler('NOTES:CREATED', notesHandlers.handleNoteCreated)
    this.dispatcher.registerHandler('NOTES:UPDATED', notesHandlers.handleNoteUpdated)
    this.dispatcher.registerHandler('NOTES:DELETED', notesHandlers.handleNoteDeleted)

    // Audio events
    this.dispatcher.registerHandler('AUDIO:EFFECT_APPLIED', audioHandlers.handleEffectApplied)
    this.dispatcher.registerHandler('AUDIO:ENVIRONMENT_SET', audioHandlers.handleEnvironmentSet)
    this.dispatcher.registerHandler('AUDIO:DM_OVERRIDE_APPLIED', audioHandlers.handleDMOverrideApplied)
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
    // Extract auth token from URL query params or headers
    const url = new URL(req.url || '/', `http://${req.headers.host}`)
    const token = url.searchParams.get('token') || extractTokenFromHeader(req.headers.authorization)

    if (!token) {
      ws.close(1008, 'Missing authentication token')
      return
    }

    const payload = verifyToken(token)
    if (!payload) {
      ws.close(1008, 'Invalid or expired token')
      return
    }

    // Create connection state
    const connectionId = `conn-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const connectionState = createConnectionState(
      payload.userId as UUID,
      payload.sessionId || ('' as UUID),
      connectionId
    )

    ws.connectionState = connectionState
    ws.isAlive = true
    this.connections.set(connectionId, ws)

    console.log(`[WS] Client connected: ${payload.username} (${connectionId})`)

    // Send welcome message with connection info
    ws.send(
      JSON.stringify({
        type: 'WS:CONNECTED',
        connectionId,
        userId: payload.userId,
        username: payload.username,
        role: payload.role,
      })
    )

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
      console.error(`[WS] Error on ${connectionId}:`, err)
    })
  }

  /**
   * Handle incoming message from client
   */
  private async handleMessage(ws: ExtendedWebSocket, data: any): Promise<void> {
    try {
      const message = typeof data === 'string' ? JSON.parse(data) : data
      const event = message as EventEnvelope

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
      console.error('[WS] Error processing message:', err)
      ws.send(
        JSON.stringify({
          type: 'WS:ERROR',
          code: err.code || ErrorCode.INTERNAL_ERROR,
          message: err.message,
        })
      )
    }
  }

  /**
   * Broadcast event to all clients in a session
   */
  private broadcastToSession(sessionId: UUID, event: EventEnvelope, sender: ExtendedWebSocket): void {
    const OPEN_STATE = 1 // WebSocket.OPEN
    this.wss.clients.forEach((client: any) => {
      if (
        client.readyState === OPEN_STATE &&
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
   * Handle client disconnection
   */
  private handleDisconnection(ws: ExtendedWebSocket): void {
    if (!ws.connectionState) return

    const connectionId = ws.connectionState.connectionId
    console.log(`[WS] Client disconnected: ${connectionId}`)

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
