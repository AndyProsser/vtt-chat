/**
 * Chat Slice (Zustand)
 * Manages chat messages and outgoing message queue.
 * Typing indicators have moved to presenceSlice (presenceTypingBySession).
 * Reference: docs/architecture/ARCHITECTURE.md
 */

import type { StateCreator } from 'zustand'
import type { UUID, MessageType } from '@shared'
import type { EventEnvelope } from '@shared'
import {
  CHAT_SESSION_CACHE_MAX_MESSAGES,
  CHAT_SESSION_CACHE_RETAIN_MESSAGES,
} from '@/constants/chatPresence.constants'
import type { Message } from '@/types/chat'

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

function hasDuplicateSessionBookend(
  sessionMessages: Record<UUID, Message>,
  incoming: Message
): boolean {
  for (const messageId in sessionMessages) {
    const existing = sessionMessages[messageId as UUID]
    if (isDuplicateSessionBookend(existing, incoming)) {
      return true
    }
  }

  return false
}

function isSameMessage(existing: Message, next: Message): boolean {
  return (
    existing.id === next.id &&
    existing.roomId === next.roomId &&
    existing.authorId === next.authorId &&
    existing.authorUsername === next.authorUsername &&
    existing.content === next.content &&
    existing.type === next.type &&
    existing.isDmOnly === next.isDmOnly &&
    existing.isOffTheRecord === next.isOffTheRecord &&
    existing.createdAt === next.createdAt &&
    existing.editedAt === next.editedAt &&
    existing.visibleTo === next.visibleTo &&
    existing.targetIds === next.targetIds
  )
}

function removeMessagesForRoom(
  sessionMessages: Record<UUID, Message>,
  roomId: UUID
): Record<UUID, Message> | null {
  let removedAny = false
  const nextSessionMessages: Record<UUID, Message> = {}

  for (const messageId in sessionMessages) {
    const typedMessageId = messageId as UUID
    const message = sessionMessages[typedMessageId]
    if (message.roomId === roomId) {
      removedAny = true
      continue
    }

    nextSessionMessages[typedMessageId] = message
  }

  return removedAny ? nextSessionMessages : null
}

function isSameOutgoingMessage(existing: OutgoingChatMessage, next: OutgoingChatMessage): boolean {
  return (
    existing.id === next.id &&
    existing.roomId === next.roomId &&
    existing.content === next.content &&
    existing.type === next.type &&
    existing.recipientId === next.recipientId &&
    existing.createdAt === next.createdAt &&
    existing.status === next.status &&
    existing.error === next.error
  )
}

function pruneSessionMessageCache(sessionMessages: Record<UUID, Message>): Record<UUID, Message> {
  const pinnedIds: UUID[] = []
  const normalIds: UUID[] = []
  let totalCount = 0

  for (const messageId in sessionMessages) {
    totalCount += 1
    const typedMessageId = messageId as UUID
    if (isSessionBookend(sessionMessages[typedMessageId])) {
      pinnedIds.push(typedMessageId)
    } else {
      normalIds.push(typedMessageId)
    }
  }

  if (totalCount <= CHAT_SESSION_CACHE_MAX_MESSAGES) {
    return sessionMessages
  }

  normalIds.sort(
    (left, right) => sessionMessages[left].createdAt - sessionMessages[right].createdAt
  )
  pinnedIds.sort(
    (left, right) => sessionMessages[left].createdAt - sessionMessages[right].createdAt
  )

  const maxNormalCount = Math.max(0, CHAT_SESSION_CACHE_RETAIN_MESSAGES - pinnedIds.length)
  const normalStartIndex = Math.max(0, normalIds.length - maxNormalCount)

  const nextEntries: Array<[UUID, Message]> = []
  let normalIndex = normalStartIndex
  let pinnedIndex = 0

  while (normalIndex < normalIds.length && pinnedIndex < pinnedIds.length) {
    const normalId = normalIds[normalIndex]
    const pinnedId = pinnedIds[pinnedIndex]
    if (sessionMessages[normalId].createdAt <= sessionMessages[pinnedId].createdAt) {
      nextEntries.push([normalId, sessionMessages[normalId]])
      normalIndex += 1
    } else {
      nextEntries.push([pinnedId, sessionMessages[pinnedId]])
      pinnedIndex += 1
    }
  }

  while (normalIndex < normalIds.length) {
    const normalId = normalIds[normalIndex]
    nextEntries.push([normalId, sessionMessages[normalId]])
    normalIndex += 1
  }

  while (pinnedIndex < pinnedIds.length) {
    const pinnedId = pinnedIds[pinnedIndex]
    nextEntries.push([pinnedId, sessionMessages[pinnedId]])
    pinnedIndex += 1
  }

  return Object.fromEntries(nextEntries) as Record<UUID, Message>
}

export interface ChatSlice {
  // State
  messages: Record<UUID, Record<UUID, Message>> // keyed by sessionId, then messageId
  outgoingQueue: Record<UUID, OutgoingChatMessage[]> // keyed by sessionId
  isLoading: boolean

  // Actions
  addMessage: (sessionId: UUID, message: Message) => void
  addMessages: (sessionId: UUID, messages: Message[], options?: { skipPrune?: boolean }) => void
  updateMessage: (sessionId: UUID, messageId: UUID, updates: Partial<Message>) => void
  deleteMessage: (sessionId: UUID, messageId: UUID) => void
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
}

export const createChatSlice: StateCreator<ChatSlice> = (set) => ({
  // State
  messages: {},
  outgoingQueue: {},
  isLoading: false,

  // Actions
  addMessage: (sessionId, message) =>
    set((state) => {
      const sessionMessages = state.messages[sessionId] || {}
      const existing = sessionMessages[message.id]
      if (existing && isSameMessage(existing, message)) {
        return state
      }

      if (isSessionBookend(message)) {
        if (hasDuplicateSessionBookend(sessionMessages, message)) {
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

  addMessages: (sessionId, messages, options) =>
    set((state) => {
      if (messages.length === 0) {
        return state
      }

      const sessionMessages = state.messages[sessionId] || {}
      const nextSessionMessages = { ...sessionMessages }
      let didChange = false

      for (const message of messages) {
        const existing = nextSessionMessages[message.id]
        if (existing && isSameMessage(existing, message)) {
          continue
        }

        if (isSessionBookend(message)) {
          if (hasDuplicateSessionBookend(nextSessionMessages, message)) {
            continue
          }
        }

        nextSessionMessages[message.id] = message
        didChange = true
      }

      if (!didChange) {
        return state
      }

      return {
        messages: {
          ...state.messages,
          [sessionId]: options?.skipPrune
            ? nextSessionMessages
            : pruneSessionMessageCache(nextSessionMessages),
        },
      }
    }),

  updateMessage: (sessionId, messageId, updates) =>
    set((state) => {
      const message = state.messages[sessionId]?.[messageId]
      if (!message) return state

      const updateEntries = Object.entries(updates) as Array<[keyof Message, unknown]>
      if (updateEntries.length === 0) {
        return state
      }

      const hasChanges = updateEntries.some(([key, value]) => message[key] !== value)
      if (!hasChanges) return state

      const nextMessage = { ...message, ...updates }

      const sessionMessages = state.messages[sessionId] || {}
      return {
        messages: {
          ...state.messages,
          [sessionId]: {
            ...sessionMessages,
            [messageId]: nextMessage,
          },
        },
      }
    }),

  deleteMessage: (sessionId, messageId) =>
    set((state) => {
      const currentSessionMessages = state.messages[sessionId]
      if (!currentSessionMessages || !currentSessionMessages[messageId]) {
        return state
      }

      const sessionMessages = { ...currentSessionMessages }
      delete sessionMessages[messageId]

      return {
        messages: {
          ...state.messages,
          [sessionId]: sessionMessages,
        },
      }
    }),

  enqueueOutgoingMessage: (sessionId, message) =>
    set((state) => {
      const queue = state.outgoingQueue[sessionId] || []
      const existingIndex = queue.findIndex((entry) => entry.id === message.id)

      if (existingIndex === -1) {
        return {
          outgoingQueue: {
            ...state.outgoingQueue,
            [sessionId]: [...queue, message],
          },
        }
      }

      const existing = queue[existingIndex]
      if (isSameOutgoingMessage(existing, message)) {
        return state
      }

      const nextQueue = queue.slice()
      nextQueue[existingIndex] = message
      return {
        outgoingQueue: {
          ...state.outgoingQueue,
          [sessionId]: nextQueue,
        },
      }
    }),

  updateOutgoingMessage: (sessionId, messageId, updates) =>
    set((state) => {
      const queue = state.outgoingQueue[sessionId] || []
      const targetIndex = queue.findIndex((entry) => entry.id === messageId)
      if (targetIndex === -1) {
        return state
      }

      const currentEntry = queue[targetIndex]
      const updateEntries = Object.entries(updates) as Array<[keyof OutgoingChatMessage, unknown]>
      if (updateEntries.length === 0) {
        return state
      }

      const hasChanges = updateEntries.some(([key, value]) => currentEntry[key] !== value)
      if (!hasChanges) {
        return state
      }

      const nextEntry = { ...currentEntry, ...updates }
      const nextQueue = queue.slice()
      nextQueue[targetIndex] = nextEntry

      return {
        outgoingQueue: {
          ...state.outgoingQueue,
          [sessionId]: nextQueue,
        },
      }
    }),

  removeOutgoingMessage: (sessionId, messageId) =>
    set((state) => {
      const queue = state.outgoingQueue[sessionId] || []
      const targetIndex = queue.findIndex((entry) => entry.id === messageId)
      if (targetIndex === -1) {
        return state
      }

      const nextQueue = queue.slice()
      nextQueue.splice(targetIndex, 1)

      return {
        outgoingQueue: {
          ...state.outgoingQueue,
          [sessionId]: nextQueue,
        },
      }
    }),

  clearMessages: (sessionId) =>
    set((state) => {
      if (!sessionId) {
        if (
          Object.keys(state.messages).length === 0 &&
          Object.keys(state.outgoingQueue).length === 0
        ) {
          return state
        }

        return { messages: {}, outgoingQueue: {} }
      }

      const hasSessionMessages = Boolean(state.messages[sessionId])
      const hasSessionQueue = Boolean(state.outgoingQueue[sessionId])
      if (!hasSessionMessages && !hasSessionQueue) {
        return state
      }

      const newMessages = { ...state.messages }
      delete newMessages[sessionId]
      const newOutgoingQueue = { ...state.outgoingQueue }
      delete newOutgoingQueue[sessionId]

      return {
        messages: newMessages,
        outgoingQueue: newOutgoingQueue,
      }
    }),

  clearRoomMessages: (sessionId, roomId) =>
    set((state) => {
      const sessionMessages = state.messages[sessionId]
      if (!sessionMessages) return state

      const nextSessionMessages = removeMessagesForRoom(sessionMessages, roomId)
      if (!nextSessionMessages) {
        return state
      }

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
      const existing = sessionMessages[message.id]
      if (existing && isSameMessage(existing, message)) {
        return state
      }

      if (isSessionBookend(message)) {
        if (hasDuplicateSessionBookend(sessionMessages, message)) {
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
      if (message.content === payload.content) return state

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
      const currentSessionMessages = state.messages[event.sessionId]
      if (!currentSessionMessages || !currentSessionMessages[payload.messageId]) {
        return state
      }

      const sessionMessages = { ...currentSessionMessages }
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

      const nextSessionMessages = removeMessagesForRoom(sessionMessages, roomId)
      if (!nextSessionMessages) {
        return state
      }

      return {
        messages: {
          ...state.messages,
          [event.sessionId]: nextSessionMessages,
        },
      }
    })
  },
})
