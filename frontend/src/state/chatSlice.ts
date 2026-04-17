/**
 * Chat Slice (Zustand)
 * Manages chat messages, typing indicators, and message state.
 * Reference: docs/architecture/ARCHITECTURE.md
 */

import type { StateCreator } from 'zustand'
import type { UUID, MessageType } from '@shared'
import type { EventEnvelope } from '@shared'

export interface Message {
  id: UUID
  authorId: UUID
  authorUsername: string
  content: string
  type: MessageType
  isDmOnly: boolean
  createdAt: number
  editedAt?: number
}

export interface TypingIndicator {
  userId: UUID
  username: string
  until: number // timestamp when typing should expire
}

export interface ChatSlice {
  // State
  messages: Record<UUID, Message> // keyed by sessionId, then messageId
  typingIndicators: Record<UUID, TypingIndicator[]> // keyed by sessionId
  isLoading: boolean

  // Actions
  addMessage: (sessionId: UUID, message: Message) => void
  updateMessage: (sessionId: UUID, messageId: UUID, updates: Partial<Message>) => void
  deleteMessage: (sessionId: UUID, messageId: UUID) => void
  setTypingIndicators: (sessionId: UUID, indicators: TypingIndicator[]) => void
  clearMessages: (sessionId?: UUID) => void

  // Event handlers
  handleMessageSent: (event: EventEnvelope) => void
  handleMessageEdited: (event: EventEnvelope) => void
  handleMessageDeleted: (event: EventEnvelope) => void
  handleTypingStarted: (event: EventEnvelope) => void
  handleTypingStopped: (event: EventEnvelope) => void
}

export const createChatSlice: StateCreator<ChatSlice> = (set) => ({
  // State
  messages: {},
  typingIndicators: {},
  isLoading: false,

  // Actions
  addMessage: (sessionId, message) =>
    set((state) => {
      const sessionMessages = state.messages[sessionId] || {}
      return {
        messages: {
          ...state.messages,
          [sessionId]: {
            ...sessionMessages,
            [message.id]: message,
          },
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
    set((state) => ({
      typingIndicators: {
        ...state.typingIndicators,
        [sessionId]: indicators,
      },
    })),

  clearMessages: (sessionId) =>
    set((state) => {
      if (!sessionId) {
        return { messages: {}, typingIndicators: {} }
      }

      const newMessages = { ...state.messages }
      delete newMessages[sessionId]
      const newTyping = { ...state.typingIndicators }
      delete newTyping[sessionId]

      return {
        messages: newMessages,
        typingIndicators: newTyping,
      }
    }),

  // Event handlers
  handleMessageSent: (event) => {
    const payload = event.payload as {
      messageId: UUID
      authorId: UUID
      authorUsername: string
      content: string
      type: MessageType
      isDmOnly: boolean
    }

    const message: Message = {
      id: payload.messageId,
      authorId: payload.authorId,
      authorUsername: payload.authorUsername,
      content: payload.content,
      type: payload.type,
      isDmOnly: payload.isDmOnly,
      createdAt: event.timestamp,
    }

    set((state) => ({
      messages: {
        ...state.messages,
        [event.sessionId]: {
          ...(state.messages[event.sessionId] || {}),
          [message.id]: message,
        },
      },
    }))
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

  handleTypingStarted: (event) => {
    const payload = event.payload as { userId: UUID; username: string }

    set((state) => {
      const indicators = [...(state.typingIndicators[event.sessionId] || [])]
      // Remove if already exists
      const filtered = indicators.filter((i) => i.userId !== payload.userId)
      filtered.push({
        userId: payload.userId,
        username: payload.username,
        until: event.timestamp + 5000, // Expires in 5 seconds
      })

      return {
        typingIndicators: {
          ...state.typingIndicators,
          [event.sessionId]: filtered,
        },
      }
    })
  },

  handleTypingStopped: (event) => {
    const payload = event.payload as { userId: UUID }

    set((state) => {
      const indicators = state.typingIndicators[event.sessionId] || []
      return {
        typingIndicators: {
          ...state.typingIndicators,
          [event.sessionId]: indicators.filter((i) => i.userId !== payload.userId),
        },
      }
    })
  },
})
