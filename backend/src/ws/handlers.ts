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
import { MessageType, NoteVisibility } from '@shared'
import { logger } from '@/utils'
import { createNote, deleteNote, updateNote } from '@/services/notes.service'
import { deleteMessage, editMessage, sendMessage } from '@/services/chat.service'
import { getSession } from '@/services/session/core.service'
import { resolveEffectiveActor } from '@/services/dev-mock/takeover.service'

export { roomHandlers } from './handlers/room.handler'
export { audioHandlers } from './handlers/audio.handler'

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
    const payload = event.payload as {
      authorUsername?: string
      content?: string
      type?: MessageType | string
      recipientId?: string
    }

    if (typeof payload.content === 'string' && payload.content.trim().length > 0) {
      const session = await getSession(event.sessionId as any)
      if (session) {
        const requestedType = payload.type as MessageType | undefined
        const type = Object.values(MessageType).includes(requestedType as MessageType)
          ? (requestedType as MessageType)
          : MessageType.OOC

        const effective = await resolveEffectiveActor({
          sessionId: event.sessionId as any,
          actorUserId: event.userId as any,
          actorUsername: payload.authorUsername || 'Unknown',
        })

        await sendMessage({
          sessionId: event.sessionId as any,
          authorId: effective.userId,
          authorUsername: effective.username,
          dmId: session.dmId as any,
          content: payload.content,
          type,
          recipientId: payload.recipientId as any,
        })
      }
    }

    logHandled('CHAT:MESSAGE_SENT', event)
  },

  async handleMessageEdited(event: EventEnvelope) {
    const payload = event.payload as { messageId?: string; newContent?: string }
    if (payload.messageId && typeof payload.newContent === 'string') {
      await editMessage(
        payload.messageId as any,
        event.userId as any,
        event.userRole as any,
        payload.newContent
      )
    }

    logHandled('CHAT:MESSAGE_EDITED', event)
  },

  async handleMessageDeleted(event: EventEnvelope) {
    const payload = event.payload as { messageId?: string }
    if (payload.messageId) {
      await deleteMessage(payload.messageId as any, event.userId as any, event.userRole as any)
    }

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
    const payload = event.payload as {
      title?: string
      content?: string
      visibility?: NoteVisibility | string
      tags?: string[]
      allowedUsers?: string[]
      authorUsername?: string
    }

    if (typeof payload.title === 'string' && typeof payload.content === 'string') {
      const requestedVisibility = payload.visibility as NoteVisibility | undefined
      const visibility = Object.values(NoteVisibility).includes(
        requestedVisibility as NoteVisibility
      )
        ? (requestedVisibility as NoteVisibility)
        : NoteVisibility.DM_ONLY

      await createNote({
        sessionId: event.sessionId as any,
        authorId: event.userId as any,
        authorUsername: payload.authorUsername || 'Unknown',
        title: payload.title,
        content: payload.content,
        visibility,
        tags: Array.isArray(payload.tags) ? payload.tags : [],
        allowedUsers: Array.isArray(payload.allowedUsers)
          ? (payload.allowedUsers.filter((item): item is string => typeof item === 'string') as any)
          : undefined,
      })
    }

    logHandled('NOTES:CREATED', event)
  },

  async handleNoteUpdated(event: EventEnvelope) {
    const payload = event.payload as {
      noteId?: string
      title?: string
      content?: string
      visibility?: NoteVisibility | string
      tags?: string[]
      allowedUsers?: string[]
    }

    if (payload.noteId) {
      const requestedVisibility = payload.visibility as NoteVisibility | undefined
      const visibility = Object.values(NoteVisibility).includes(
        requestedVisibility as NoteVisibility
      )
        ? (requestedVisibility as NoteVisibility)
        : undefined

      await updateNote(payload.noteId as any, event.userId as any, event.userRole as any, {
        title: typeof payload.title === 'string' ? payload.title : undefined,
        content: typeof payload.content === 'string' ? payload.content : undefined,
        visibility,
        tags: Array.isArray(payload.tags) ? payload.tags : undefined,
        allowedUsers: Array.isArray(payload.allowedUsers)
          ? (payload.allowedUsers.filter((item): item is string => typeof item === 'string') as any)
          : undefined,
      })
    }

    logHandled('NOTES:UPDATED', event)
  },

  async handleNoteDeleted(event: EventEnvelope) {
    const payload = event.payload as { noteId?: string }
    if (payload.noteId) {
      await deleteNote(payload.noteId as any, event.userId as any, event.userRole as any)
    }

    logHandled('NOTES:DELETED', event)
  },
}
