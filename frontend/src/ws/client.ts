/**
 * WebSocket Client
 * Manages connection lifecycle, event transport, and state recovery.
 * Reference: docs/architecture/EVENT-BUS.md
 */

import type { EventEnvelope, UUID } from '@shared'
import { isValidUUID } from '@shared'
import { logger } from '../utils/logger'
import type { ConnectionState, ConnectionOptions } from '@/types/ws'

export type { ConnectionState, ConnectionOptions } from '@/types/ws'
type IncomingWsMessage =
  | EventEnvelope
  | {
      type: 'WS:EVENT'
      event: EventEnvelope
    }
  | {
      type: 'WS:CONNECTED'
      connectionId: string
      userId: string
      username: string
      role: string
    }
  | {
      type: 'WS:ACK'
      eventId: string
      status: string
    }
  | {
      type: 'WS:ERROR'
      code: string
      message: string
    }

/**
 * WebSocket client for event-based communication.
 * Handles connection, authentication, event transport, and automatic reconnection.
 */
export class WebSocketClient {
  private socket: WebSocket | null = null
  private state: ConnectionState = 'disconnected'
  private token: string
  private url: string
  private manualDisconnect = false

  // Reconnection state
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelayMs = 1000
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null

  // Event queue for offline handling
  private eventQueue: EventEnvelope[] = []

  // Callbacks
  private callbacks: {
    onStateChange?: (state: ConnectionState) => void
    onEvent?: (event: EventEnvelope) => void
    onError?: (error: Error) => void
  }

  constructor(options: ConnectionOptions) {
    this.url = options.url
    this.token = options.token
    this.callbacks = {
      onStateChange: options.onStateChange,
      onEvent: options.onEvent,
      onError: options.onError,
    }

    if (options.maxReconnectAttempts !== undefined) {
      this.maxReconnectAttempts = options.maxReconnectAttempts
    }
    if (options.reconnectDelayMs !== undefined) {
      this.reconnectDelayMs = options.reconnectDelayMs
    }
  }

  /**
   * Establish WebSocket connection.
   */
  async connect(): Promise<void> {
    if (this.state !== 'disconnected' && this.state !== 'reconnecting') {
      logger.warn('ws.client', `Cannot connect: already in state ${this.state}`)
      return
    }

    this.manualDisconnect = false
    this.clearReconnectTimeout()

    this.setState('connecting')
    logger.debug('ws.client', 'Opening WebSocket connection', { url: this.url })

    return new Promise((resolve, reject) => {
      try {
        let settled = false
        const socket = new WebSocket(this.url)
        this.socket = socket

        socket.onopen = () => {
          if (socket !== this.socket || this.manualDisconnect) {
            return
          }
          logger.debug('ws.client', 'Socket opened; sending auth payload')
          socket.send(
            JSON.stringify({
              type: 'WS:AUTH',
              token: this.token,
            })
          )
          this.reconnectAttempts = 0
          this.setState('connected')
          this.flushEventQueue()
          settled = true
          resolve()
        }

        socket.onmessage = (event) => {
          if (socket !== this.socket) {
            return
          }
          logger.debug('ws.client', 'Raw message received', { data: event.data })
          this.handleMessage(event.data)
        }

        socket.onerror = (error) => {
          if (socket !== this.socket || this.manualDisconnect) {
            return
          }

          const err = new Error('WebSocket transport error')
          this.callbacks.onError?.(err)

          if (!settled) {
            settled = true
            reject(err)
          }
        }

        socket.onclose = (event) => {
          if (socket !== this.socket) {
            return
          }

          const closeCode = event?.code ?? 1005
          const closeReason = event?.reason ?? ''

          this.socket = null
          this.setState('disconnected')

          if (this.manualDisconnect) {
            logger.debug('ws.client', 'Socket closed after manual disconnect')
            if (!settled) {
              settled = true
              resolve()
            }
            return
          }

          logger.debug('ws.client', 'Socket closed; scheduling reconnect', {
            reconnectAttempts: this.reconnectAttempts,
            code: closeCode,
            reason: closeReason,
          })

          this.scheduleReconnect()

          if (!settled) {
            settled = true
            reject(new Error(`WebSocket closed before ready (code ${closeCode})`))
          }
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))
        this.callbacks.onError?.(err)
        reject(err)
      }
    })
  }

  /**
   * Disconnect from server.
   */
  disconnect(): void {
    this.manualDisconnect = true
    this.clearReconnectTimeout()

    if (this.socket) {
      this.socket.close()
      this.socket = null
    }

    this.setState('disconnected')
  }

  /**
   * Send an event to the server.
   * Events are queued if disconnected; they will be sent on reconnect.
   */
  send(event: EventEnvelope): void {
    if (!isValidUUID(event.id)) {
      const error = new Error(`Invalid event ID: ${event.id}`)
      this.callbacks.onError?.(error)
      return
    }

    if (this.state === 'connected' && this.socket) {
      try {
        logger.debug('ws.client', `Sending event ${event.type}`, {
          eventId: event.id,
          sessionId: event.sessionId,
        })
        this.socket.send(JSON.stringify(event))
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))
        logger.error('ws.client', 'Failed to send event', err)
        this.callbacks.onError?.(err)
        // Queue for retry
        this.eventQueue.push(event)
      }
    } else {
      // Queue if not connected
      this.eventQueue.push(event)
      logger.debug('ws.client', `Queued event ${event.type}`, {
        eventId: event.id,
        queuedCount: this.eventQueue.length,
      })
    }
  }

  /**
   * Get current connection state.
   */
  getState(): ConnectionState {
    return this.state
  }

  /**
   * Get queued events (for debugging).
   */
  getQueuedEvents(): EventEnvelope[] {
    return [...this.eventQueue]
  }

  /**
   * Clear queued events.
   */
  clearQueue(): void {
    this.eventQueue = []
  }

  // Private methods

  private setState(newState: ConnectionState): void {
    if (this.state !== newState) {
      this.state = newState
      this.callbacks.onStateChange?.(newState)
    }
  }

  private handleMessage(data: string): void {
    try {
      const incoming = JSON.parse(data) as IncomingWsMessage

      if ((incoming as any).type === 'WS:EVENT' && (incoming as any).event) {
        this.callbacks.onEvent?.((incoming as any).event)
        return
      }

      if ((incoming as any).type === 'WS:CONNECTED') {
        const msg = incoming as {
          type: 'WS:CONNECTED'
          connectionId: string
          userId: string
          username: string
          role: string
        }
        if (!isValidUUID(msg.userId)) {
          this.callbacks.onError?.(new Error(`Invalid WS:CONNECTED userId: ${msg.userId}`))
          return
        }

        const normalized: EventEnvelope = {
          id: crypto.randomUUID() as UUID,
          type: 'WS:CONNECTED',
          version: 1,
          userId: msg.userId,
          userRole: msg.role as any,
          sessionId: '00000000-0000-4000-8000-000000000000' as UUID,
          roomId: null,
          timestamp: Date.now(),
          payload: {
            userId: msg.userId,
            username: msg.username,
            userRole: msg.role,
            connectionId: msg.connectionId,
          },
        }
        this.callbacks.onEvent?.(normalized)
        logger.debug('ws.client', 'Server confirmed WS connection', {
          userId: msg.userId,
          connectionId: msg.connectionId,
        })
        return
      }

      if ((incoming as any).type === 'WS:ACK') {
        logger.debug('ws.client', 'Received server ACK', incoming)
        return
      }

      if ((incoming as any).type === 'WS:ERROR') {
        const msg = incoming as { type: 'WS:ERROR'; message: string }
        this.callbacks.onError?.(new Error(msg.message || 'WebSocket server error'))
        return
      }

      // Backward compatibility: raw event envelope payload
      this.callbacks.onEvent?.(incoming as EventEnvelope)
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      logger.error('ws.client', 'Failed to parse message', err)
      this.callbacks.onError?.(err)
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('ws.client', `Max reconnection attempts (${this.maxReconnectAttempts}) reached`)
      return
    }

    this.reconnectAttempts += 1
    const delay = this.reconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1)

    logger.info(
      'ws.client',
      `Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`
    )

    this.setState('reconnecting')
    this.reconnectTimeoutId = setTimeout(() => {
      this.connect().catch((error) => {
        logger.error('ws.client', 'Reconnection failed', error)
      })
    }, delay)
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId)
      this.reconnectTimeoutId = null
    }
  }

  private flushEventQueue(): void {
    while (this.eventQueue.length > 0 && this.state === 'connected' && this.socket) {
      const event = this.eventQueue.shift()
      if (event) {
        try {
          this.socket.send(JSON.stringify(event))
        } catch {
          // Put it back and give up
          this.eventQueue.unshift(event)
          break
        }
      }
    }
  }
}
