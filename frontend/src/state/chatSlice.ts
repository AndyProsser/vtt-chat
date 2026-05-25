/**
 * Chat Slice (Zustand)
 * Manages chat messages, typing indicators, and message state.
 * Reference: docs/architecture/ARCHITECTURE.md
 */

import type { StateCreator } from 'zustand'
import type { UUID, MessageType } from '@shared'
import type { EventEnvelope } from '@shared'
import {
  CHAT_SESSION_CACHE_MAX_MESSAGES,
  CHAT_SESSION_CACHE_RETAIN_MESSAGES,
  TYPING_INDICATOR_TTL_MS,
  TYPING_RENEW_MIN_EXTENSION_MS,
} from '@/constants/chatPresence.constants'
import type { Message, TypingIndicator } from '@/types/chat'

export type { Message, TypingIndicator } from '@/types/chat'

export interface OutgoingChatMessage {
  id: UUID
  roomId: UUID
  content: string
  type: MessageType
  recipientId?: UUID
  createdAt: number
  status: 'queued' | 'sending' | 'failed'
  error?: string
}

const SESSION_BOOKEND_PREFIXES = [
  'Session Start:',
  'Session End:',
  '[Session Started]',
  '[Session Ended]',
  '[Session Paused]',
  '[Session Resumed]',
  '[Session Cooldown]',
] as const

const SESSION_BOOKEND_DEDUPE_WINDOW_MS = 10_000

function pruneTypingIndicators(indicators: TypingIndicator[], now: number): TypingIndicator[] {
  if (indicators.length === 0) {
    return indicators
  }

  return indicators.filter((indicator) => indicator.until > now)
}

function areTypingIndicatorsEqual(a: TypingIndicator[], b: TypingIndicator[]): boolean {
  if (a.length !== b.length) {
    return false
  }

  for (let index = 0; index < a.length; index += 1) {
    const left = a[index]
    const right = b[index]
    if (
      left.userId !== right.userId ||
      left.username !== right.username ||
      left.roomId !== right.roomId ||
      left.until !== right.until
    ) {
      return false
    }
  }

  return true
}

function isSessionBookend(message: Message): boolean {
  return (
    message.type === 'SYSTEM' &&
    SESSION_BOOKEND_PREFIXES.some((prefix) => message.content.startsWith(prefix))
  )
}

function isDuplicateSessionBookend(existing: Message, incoming: Message): boolean {
  if (!isSessionBookend(existing) || !isSessionBookend(incoming)) {
    return false
  }

  return (
    existing.roomId === incoming.roomId &&
    existing.type === incoming.type &&
    existing.content === incoming.content &&
    Math.abs(existing.createdAt - incoming.createdAt) <= SESSION_BOOKEND_DEDUPE_WINDOW_MS
  )
}

function pruneSessionMessageCache(sessionMessages: Record<UUID, Message>): Record<UUID, Message> {
  const entries = Object.entries(sessionMessages) as Array<[UUID, Message]>
  if (entries.length <= CHAT_SESSION_CACHE_MAX_MESSAGES) {
    return sessionMessages
  }

  const pinnedEntries = entries.filter(([, message]) => isSessionBookend(message))
  const normalEntries = entries.filter(([, message]) => !isSessionBookend(message))
  normalEntries.sort((left, right) => left[1].createdAt - right[1].createdAt)

  const maxNormalCount = Math.max(0, CHAT_SESSION_CACHE_RETAIN_MESSAGES - pinnedEntries.length)
  const retainedNormal = normalEntries.slice(Math.max(0, normalEntries.length - maxNormalCount))
  const nextEntries = [...retainedNormal, ...pinnedEntries]
  nextEntries.sort((left, right) => left[1].createdAt - right[1].createdAt)

  return Object.fromEntries(nextEntries) as Record<UUID, Message>
}

export interface ChatSlice {
  // State
  messages: Record<UUID, Record<UUID, Message>> // keyed by sessionId, then messageId
  typingIndicators: Record<UUID, TypingIndicator[]> // keyed by sessionId
  outgoingQueue: Record<UUID, OutgoingChatMessage[]> // keyed by sessionId
  isLoading: boolean

  // Actions
  addMessage: (sessionId: UUID, message: Message) => void
  updateMessage: (sessionId: UUID, messageId: UUID, updates: Partial<Message>) => void
  deleteMessage: (sessionId: UUID, messageId: UUID) => void
  setTypingIndicators: (sessionId: UUID, indicators: TypingIndicator[]) => void
  enqueueOutgoingMessage: (sessionId: UUID, message: OutgoingChatMessage) => void
  updateOutgoingMessage: (
    sessionId: UUID,
    messageId: UUID,
    updates: Partial<OutgoingChatMessage>
  ) => void
  removeOutgoingMessage: (sessionId: UUID, messageId: UUID) => void
  clearMessages: (sessionId?: UUID) => void
  clearRoomMessages: (sessionId: UUID, roomId: UUID) => void

  // Event handlers
  handleMessageSent: (event: EventEnvelope) => void
  handleMessageEdited: (event: EventEnvelope) => void
  handleMessageDeleted: (event: EventEnvelope) => void
  handleRoomContextCleared: (event: EventEnvelope) => void
  handleTypingStarted: (event: EventEnvelope) => void
  handleTypingStopped: (event: EventEnvelope) => void
}

export const createChatSlice: StateCreator<ChatSlice> = (set) => ({
  // State
  messages: {},
  typingIndicators: {},
  outgoingQueue: {},
  isLoading: false,

  // Actions
  addMessage: (sessionId, message) =>
    set((state) => {
      const sessionMessages = state.messages[sessionId] || {}

      if (isSessionBookend(message)) {
        const hasDuplicate = Object.values(sessionMessages).some((existing) =>
          isDuplicateSessionBookend(existing, message)
        )

        if (hasDuplicate) {
          return state
        }
      }

      return {
        messages: {
          ...state.messages,
          [sessionId]: pruneSessionMessageCache({
            ...sessionMessages,
            [message.id]: message,
          }),
        },
      }
    }),

  updateMessage: (sessionId, messageId, updates) =>
    set((state) => {
      const message = state.messages[sessionId]?.[messageId]
      if (!message) return state

      const sessionMessages = state.messages[sessionId] || {}
      return {
        messages: {
          ...state.messages,
          [sessionId]: {
            ...sessionMessages,
            [messageId]: { ...message, ...updates },
          },
        },
      }
    }),

  deleteMessage: (sessionId, messageId) =>
    set((state) => {
      const sessionMessages = { ...state.messages[sessionId] }
      if (sessionMessages) {
        delete sessionMessages[messageId]
      }
      return {
        messages: {
          ...state.messages,
          [sessionId]: sessionMessages,
        },
      }
    }),

  setTypingIndicators: (sessionId, indicators) =>
    set((state) => {
      const nextIndicators = pruneTypingIndicators(indicators, Date.now())
      const currentIndicators = state.typingIndicators[sessionId] || []

      if (nextIndicators.length === 0) {
        if (!state.typingIndicators[sessionId]) {
          return state
        }

        const nextTyping = { ...state.typingIndicators }
        delete nextTyping[sessionId]
        return { typingIndicators: nextTyping }
      }

      if (areTypingIndicatorsEqual(currentIndicators, nextIndicators)) {
        return state
      }

      return {
        typingIndicators: {
          ...state.typingIndicators,
          [sessionId]: nextIndicators,
        },
      }
    }),

  enqueueOutgoingMessage: (sessionId, message) =>
    set((state) => ({
      outgoingQueue: {
        ...state.outgoingQueue,
        [sessionId]: [...(state.outgoingQueue[sessionId] || []), message],
      },
    })),

  updateOutgoingMessage: (sessionId, messageId, updates) =>
    set((state) => {
      const queue = state.outgoingQueue[sessionId] || []
      return {
        outgoingQueue: {
          ...state.outgoingQueue,
          [sessionId]: queue.map((entry) =>
            entry.id === messageId ? { ...entry, ...updates } : entry
          ),
        },
      }
    }),

  removeOutgoingMessage: (sessionId, messageId) =>
    set((state) => {
      const queue = state.outgoingQueue[sessionId] || []
      return {
        outgoingQueue: {
          ...state.outgoingQueue,
          [sessionId]: queue.filter((entry) => entry.id !== messageId),
        },
      }
    }),

  clearMessages: (sessionId) =>
    set((state) => {
      if (!sessionId) {
        return { messages: {}, typingIndicators: {}, outgoingQueue: {} }
      }

      const newMessages = { ...state.messages }
      delete newMessages[sessionId]
      const newTyping = { ...state.typingIndicators }
      delete newTyping[sessionId]
      const newOutgoingQueue = { ...state.outgoingQueue }
      delete newOutgoingQueue[sessionId]

      return {
        messages: newMessages,
        typingIndicators: newTyping,
        outgoingQueue: newOutgoingQueue,
      }
    }),

  clearRoomMessages: (sessionId, roomId) =>
    set((state) => {
      const sessionMessages = state.messages[sessionId]
      if (!sessionMessages) return state

      const nextSessionMessages = Object.fromEntries(
        Object.entries(sessionMessages).filter(([, message]) => message.roomId !== roomId)
      ) as Record<UUID, Message>

      return {
        messages: {
          ...state.messages,
          [sessionId]: nextSessionMessages,
        },
      }
    }),

  // Event handlers
  handleMessageSent: (event) => {
    const payload = event.payload as {
      messageId: UUID
      roomId?: UUID
      authorId: UUID
      authorUsername: string
      content: string
      type: MessageType
      isDmOnly: boolean
      isOffTheRecord?: boolean
      visibleTo?: UUID[]
      targetIds?: UUID[]
    }

    const message: Message = {
      id: payload.messageId,
      roomId: payload.roomId || (event.roomId as UUID),
      authorId: payload.authorId,
      authorUsername: payload.authorUsername,
      content: payload.content,
      type: payload.type,
      isDmOnly: payload.isDmOnly,
      isOffTheRecord: payload.isOffTheRecord,
      visibleTo: payload.visibleTo,
      targetIds: payload.targetIds,
      createdAt: event.timestamp,
    }

    set((state) => {
      const sessionMessages = state.messages[event.sessionId] || {}

      if (isSessionBookend(message)) {
        const hasDuplicate = Object.values(sessionMessages).some((existing) =>
          isDuplicateSessionBookend(existing, message)
        )

        if (hasDuplicate) {
          return state
        }
      }

      return {
        messages: {
          ...state.messages,
          [event.sessionId]: pruneSessionMessageCache({
            ...sessionMessages,
            [message.id]: message,
          }),
        },
      }
    })
  },

  handleMessageEdited: (event) => {
    const payload = event.payload as { messageId: UUID; content: string }

    set((state) => {
      const sessionMessages = state.messages[event.sessionId]
      const message = sessionMessages?.[payload.messageId]
      if (!message) return state

      return {
        messages: {
          ...state.messages,
          [event.sessionId]: {
            ...sessionMessages,
            [payload.messageId]: {
              ...message,
              content: payload.content,
              editedAt: event.timestamp,
            },
          },
        },
      }
    })
  },

  handleMessageDeleted: (event) => {
    const payload = event.payload as { messageId: UUID }

    set((state) => {
      const sessionMessages = { ...state.messages[event.sessionId] }
      delete sessionMessages[payload.messageId]
      return {
        messages: {
          ...state.messages,
          [event.sessionId]: sessionMessages,
        },
      }
    })
  },

  handleRoomContextCleared: (event) => {
    const payload = event.payload as { roomId?: UUID }
    const roomId = payload.roomId || (event.roomId as UUID | null)
    if (!roomId) return

    set((state) => {
      const sessionMessages = state.messages[event.sessionId]
      if (!sessionMessages) return state

      const nextSessionMessages = Object.fromEntries(
        Object.entries(sessionMessages).filter(([, message]) => message.roomId !== roomId)
      ) as Record<UUID, Message>

      return {
        messages: {
          ...state.messages,
          [event.sessionId]: nextSessionMessages,
        },
      }
    })
  },

  handleTypingStarted: (event) => {
    const payload = event.payload as { userId: UUID; username: string; roomId?: UUID }

    set((state) => {
      const currentIndicators = pruneTypingIndicators(
        state.typingIndicators[event.sessionId] || [],
        event.timestamp
      )
      const existing = currentIndicators.find((indicator) => indicator.userId === payload.userId)
      const nextUntil = event.timestamp + TYPING_INDICATOR_TTL_MS

      if (
        existing &&
        existing.username === payload.username &&
        existing.roomId === payload.roomId &&
        (existing.until >= nextUntil || nextUntil - existing.until < TYPING_RENEW_MIN_EXTENSION_MS)
      ) {
        return state
      }

      const nextIndicators = currentIndicators.filter(
        (indicator) => indicator.userId !== payload.userId
      )
      nextIndicators.push({
        userId: payload.userId,
        username: payload.username,
        roomId: payload.roomId,
        until: nextUntil,
      })

      return {
        typingIndicators: {
          ...state.typingIndicators,
          [event.sessionId]: nextIndicators,
        },
      }
    })
  },

  handleTypingStopped: (event) => {
    const payload = event.payload as { userId: UUID }

    set((state) => {
      const indicators = pruneTypingIndicators(
        state.typingIndicators[event.sessionId] || [],
        event.timestamp
      )
      const nextIndicators = indicators.filter((indicator) => indicator.userId !== payload.userId)

      if (nextIndicators.length === indicators.length) {
        return state
      }

      if (nextIndicators.length === 0) {
        if (!state.typingIndicators[event.sessionId]) {
          return state
        }

        const nextTyping = { ...state.typingIndicators }
        delete nextTyping[event.sessionId]
        return { typingIndicators: nextTyping }
      }

      return {
        typingIndicators: {
          ...state.typingIndicators,
          [event.sessionId]: nextIndicators,
        },
      }
    })
  },
})
