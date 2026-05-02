/**
 * Room and Presence Event Handlers
 * Handles ROOM:* and PRESENCE:* events dispatched from the WebSocket layer.
 *
 * Reference: docs/subsystems/PRESENCE-STATE-MACHINE.md
 */

import type { EventEnvelope } from '@shared'
import { PresenceState, RoomType } from '@shared'
import { logger } from '@/utils'
import { createRoom, joinRoom, leaveRoom, updatePresenceState } from '@/services/room.service'

function logHandled(eventType: string, event: EventEnvelope): void {
  logger.debug('ws.handlers', `Handled ${eventType}`, {
    eventId: event.id,
    sessionId: event.sessionId,
    userId: event.userId,
    roomId: event.roomId,
  })
}

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
