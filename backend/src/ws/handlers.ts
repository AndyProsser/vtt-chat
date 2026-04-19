/**
 * Event Handlers
 * Process specific event types and update application state.
 * All handlers are deterministic and side-effect-free during validation.
 */

import type { EventEnvelope } from '@shared'
import { PresenceState, RoomType } from '@shared'
import { logger } from '@/utils'
import { createRoom, joinRoom, leaveRoom, updatePresenceState } from '@/core/rooms/room.service'

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
 * Room event handlers
 */
export const roomHandlers = {
  async handleRoomCreated(event: EventEnvelope) {
    const payload = event.payload as {
      roomName?: string
      name?: string
      roomType?: RoomType | string
      createdBy?: string
    }

    const roomName = payload.roomName || payload.name
    if (roomName) {
      await createRoom({
        sessionId: event.sessionId,
        name: roomName,
        type: ((payload.roomType as RoomType) || RoomType.GROUP) as RoomType,
        createdBy: (payload.createdBy || event.userId) as any,
      })
    }
    logHandled('ROOM:CREATED', event)
  },

  async handleUserJoined(event: EventEnvelope) {
    const payload = event.payload as { roomId?: string; userId?: string; username?: string }
    if (payload.roomId && payload.userId && payload.username) {
      await joinRoom({
        sessionId: event.sessionId,
        roomId: payload.roomId as any,
        userId: payload.userId as any,
        username: payload.username,
        state: PresenceState.ONLINE,
      })
    }
    logHandled('ROOM:USER_JOINED', event)
  },

  async handleUserLeft(event: EventEnvelope) {
    const payload = event.payload as { roomId?: string; userId?: string }
    if (payload.roomId && payload.userId) {
      await leaveRoom({
        sessionId: event.sessionId,
        roomId: payload.roomId as any,
        userId: payload.userId as any,
        state: PresenceState.IDLE,
      })
    }
    logHandled('ROOM:USER_LEFT', event)
  },

  async handlePresenceStateChanged(event: EventEnvelope) {
    const payload = event.payload as {
      userId?: string
      username?: string
      roomId?: string | null
      presence?: PresenceState
      newState?: PresenceState
    }

    const state = payload.newState || payload.presence
    if (payload.userId && payload.username && state) {
      await updatePresenceState({
        sessionId: event.sessionId,
        userId: payload.userId as any,
        username: payload.username,
        state,
        primaryRoomId: payload.roomId ? (payload.roomId as any) : undefined,
      })
    }
    logHandled('PRESENCE:STATE_CHANGED', event)
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
