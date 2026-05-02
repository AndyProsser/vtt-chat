/**
 * Event Handlers
 * Process specific event types and update application state.
 * All handlers are deterministic and side-effect-free during validation.
 *
 * Room and presence handlers are implemented in ./handlers/room.handler.ts.
 * Audio handlers are implemented in ./handlers/audio.handler.ts.
 * Metadata handlers are implemented in ./handlers/metadata.handler.ts.
 */

import type { EventEnvelope } from '@shared'
import { logger } from '@/utils'

export { roomHandlers } from './handlers/room.handler'

function logHandled(eventType: string, event: EventEnvelope): void {
  logger.debug('ws.handlers', `Handled ${eventType}`, {
    eventId: event.id,
    sessionId: event.sessionId,
    userId: event.userId,
    roomId: event.roomId,
  })
}

/**
 * Event handler function signature
 */
export type EventHandler = (event: EventEnvelope) => Promise<void>

/**
 * Session event handlers
 */
export const sessionHandlers = {
  async handleSessionCreated(event: EventEnvelope) {
    logHandled('SESSION:CREATED', event)
  },

  async handleSessionStarted(event: EventEnvelope) {
    logHandled('SESSION:STARTED', event)
  },

  async handleSessionPaused(event: EventEnvelope) {
    logHandled('SESSION:PAUSED', event)
  },

  async handleSessionResumed(event: EventEnvelope) {
    logHandled('SESSION:RESUMED', event)
  },

  async handleSessionEnded(event: EventEnvelope) {
    logHandled('SESSION:ENDED', event)
  },
}

/**
 * Chat event handlers
 */
export const chatHandlers = {
  async handleMessageSent(event: EventEnvelope) {
    logHandled('CHAT:MESSAGE_SENT', event)
  },

  async handleMessageEdited(event: EventEnvelope) {
    logHandled('CHAT:MESSAGE_EDITED', event)
  },

  async handleMessageDeleted(event: EventEnvelope) {
    logHandled('CHAT:MESSAGE_DELETED', event)
  },

  async handleTypingStarted(event: EventEnvelope) {
    logHandled('CHAT:TYPING_STARTED', event)
  },

  async handleTypingStopped(event: EventEnvelope) {
    logHandled('CHAT:TYPING_STOPPED', event)
  },
}

/**
 * Notes event handlers
 */
export const notesHandlers = {
  async handleNoteCreated(event: EventEnvelope) {
    logHandled('NOTES:CREATED', event)
  },

  async handleNoteUpdated(event: EventEnvelope) {
    logHandled('NOTES:UPDATED', event)
  },

  async handleNoteDeleted(event: EventEnvelope) {
    logHandled('NOTES:DELETED', event)
  },
}

/**
 * Audio event handlers
 */
export const audioHandlers = {
  async handleEffectApplied(event: EventEnvelope) {
    logHandled('AUDIO:EFFECT_APPLIED', event)
  },

  async handleEffectRemoved(event: EventEnvelope) {
    logHandled('AUDIO:EFFECT_REMOVED', event)
  },

  async handlePresetLoaded(event: EventEnvelope) {
    logHandled('AUDIO:PRESET_LOADED', event)
  },

  async handleEnvironmentSet(event: EventEnvelope) {
    logHandled('AUDIO:ENVIRONMENT_SET', event)
  },

  async handleDMOverrideApplied(event: EventEnvelope) {
    logHandled('AUDIO:DM_OVERRIDE_APPLIED', event)
  },

  async handleDMOverrideRemoved(event: EventEnvelope) {
    logHandled('AUDIO:DM_OVERRIDE_REMOVED', event)
  },
}
