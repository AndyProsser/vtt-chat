/**
 * Event Dispatcher
 * Routes events from WebSocket to appropriate store reducers.
 * Validates events and checks basic schema conformance.
 */

import type { EventEnvelope } from '@shared'
import { logger } from '../utils/logger'
import { bumpLoopCounter } from '../utils/loopDiagnostics'
import type { EventHandler } from '@/types/ws'

const WS_DISPATCHER_DEBUG_ENABLED = false

export type { EventHandler } from '@/types/ws'

/**
 * Event dispatcher that routes events to registered handlers.
 * Validators are applied before handlers are invoked.
 */
export class EventDispatcher {
  private handlers: Map<string, EventHandler[]> = new Map()

  /**
   * Register a handler for a specific event type.
   * Multiple handlers can be registered for the same event type.
   *
   * @param eventType - Event type pattern (e.g., "CHAT:*" for all chat events, or specific "CHAT:MESSAGE_SENT")
   * @param handler - Handler function
   */
  register(eventType: string, handler: EventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, [])
    }
    this.handlers.get(eventType)!.push(handler)
    if (WS_DISPATCHER_DEBUG_ENABLED) {
      logger.debug('ws.dispatcher', `Registered handler for event type: ${eventType}`)
    }
  }

  /**
   * Unregister a handler.
   */
  unregister(eventType: string, handler: EventHandler): void {
    const handlers = this.handlers.get(eventType)
    if (handlers) {
      const index = handlers.indexOf(handler)
      if (index >= 0) {
        handlers.splice(index, 1)
      }
    }
  }

  /**
   * Dispatch an event to all registered handlers.
   * Validates the event envelope first.
   */
  dispatch(event: EventEnvelope): void {
    bumpLoopCounter(`ws.dispatch.event.${event.type}`)

    // Validate event envelope
    const validation = this.validateEvent(event)
    if (!validation.valid) {
      bumpLoopCounter('ws.dispatch.validation-failed')
      logger.warn('ws.dispatcher', 'Event validation failed', validation.errors)
      return
    }

    // Find matching handlers
    const handlersToInvoke: EventHandler[] = []

    // Exact match
    if (this.handlers.has(event.type)) {
      handlersToInvoke.push(...this.handlers.get(event.type)!)
    }

    // Wildcard matches (e.g., "CHAT:*")
    for (const [pattern, handlers] of this.handlers.entries()) {
      if (pattern.endsWith(':*')) {
        const prefix = pattern.slice(0, -2)
        if (event.type.startsWith(prefix + ':')) {
          handlersToInvoke.push(...handlers)
        }
      }
    }

    // Generic handler for all events
    if (this.handlers.has('*')) {
      handlersToInvoke.push(...this.handlers.get('*')!)
    }

    if (WS_DISPATCHER_DEBUG_ENABLED) {
      logger.debug('ws.dispatcher', `Dispatching event ${event.type}`, {
        eventId: event.id,
        sessionId: event.sessionId,
        handlerCount: handlersToInvoke.length,
      })
    }

    // Invoke handlers
    for (const handler of handlersToInvoke) {
      try {
        bumpLoopCounter(`ws.dispatch.handler.${event.type}`)
        handler(event)
      } catch (error) {
        bumpLoopCounter(`ws.dispatch.handler-error.${event.type}`)
        logger.error('ws.dispatcher', `Handler error for event ${event.type}`, error)
      }
    }
  }

  /**
   * Validate event envelope structure.
   * This is a basic schema validation; detailed payload validation happens in individual handlers.
   */
  private validateEvent(event: EventEnvelope): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    // Check required fields
    if (!event.id || typeof event.id !== 'string') {
      errors.push('Event must have a valid id')
    }

    if (!event.type || typeof event.type !== 'string') {
      errors.push('Event must have a type')
    }

    if (event.version !== 1) {
      errors.push(`Event version must be 1, got ${event.version}`)
    }

    if (!event.userId || typeof event.userId !== 'string') {
      errors.push('Event must have a userId')
    }

    if (!event.userRole || typeof event.userRole !== 'string') {
      errors.push('Event must have a userRole')
    }

    if (!event.sessionId || typeof event.sessionId !== 'string') {
      errors.push('Event must have a sessionId')
    }

    if (typeof event.timestamp !== 'number' || event.timestamp <= 0) {
      errors.push('Event must have a valid timestamp')
    }

    if (!event.payload || typeof event.payload !== 'object') {
      errors.push('Event must have a payload object')
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }
}
