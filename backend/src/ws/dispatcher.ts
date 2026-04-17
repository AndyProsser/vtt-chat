/**
 * Event Dispatcher
 * Validates incoming events against Stage 0 contracts and dispatches to handlers.
 */

import type { EventEnvelope } from '@shared'
import { validateEventEnvelope, canPerformAction } from '@shared'
import { ErrorCode, createError } from '@shared'
import type { EventHandler } from './handlers'

/**
 * Dispatcher validates and routes events
 */
export class EventDispatcher {
  private handlers: Map<string, EventHandler[]> = new Map()

  /**
   * Register a handler for a specific event type
   */
  registerHandler(eventType: string, handler: EventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, [])
    }
    this.handlers.get(eventType)!.push(handler)
  }

  /**
   * Validate and dispatch an event to registered handlers
   */
  async dispatch(event: unknown): Promise<void> {
    // Validate event envelope
    const validation = validateEventEnvelope(event)
    if (!validation.valid) {
      throw createError(ErrorCode.INVALID_EVENT, {
        context: { errors: validation.errors },
      })
    }

    const ev = event as EventEnvelope
    const eventType = ev.type

    // Check permissions
    if (!canPerformAction(ev.userRole, this.extractDomain(eventType), this.extractAction(eventType))) {
      throw createError(ErrorCode.PERMISSION_DENIED, {
        context: {
          eventType,
          userRole: ev.userRole,
        },
      })
    }

    // Dispatch to handlers
    const handlers = this.handlers.get(eventType) || []
    for (const handler of handlers) {
      await handler(ev)
    }

    if (handlers.length === 0) {
      throw createError(ErrorCode.NOT_IMPLEMENTED, {
        context: { eventType },
      })
    }
  }

  /**
   * Extract domain from event type (DOMAIN:ACTION)
   */
  private extractDomain(eventType: string): string {
    return eventType.split(':')[0]
  }

  /**
   * Extract action from event type (DOMAIN:ACTION)
   */
  private extractAction(eventType: string): string {
    return eventType.split(':')[1]
  }
}
