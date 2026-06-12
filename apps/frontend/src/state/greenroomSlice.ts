/**
 * Greenroom Slice (Zustand)
 * Manages campaign-scoped greenroom messages.
 * Greenroom messages are OOC-only, persistent across session boundaries,
 * and visible to all campaign members.
 * Reference: docs/architecture/CHAT-CONTRACT.md
 */

import type { StateCreator } from 'zustand'
import type { UUID, MessageType } from '@shared'
import type { EventEnvelope } from '@shared'
import {
  GREENROOM_CACHE_MAX_MESSAGES,
  GREENROOM_CACHE_RETAIN_MESSAGES,
} from '@/constants/chatPresence.constants'
import type { Message } from '@/types/chat'

function pruneGreenroomMessageCache(messages: Record<UUID, Message>): Record<UUID, Message> {
  const messageIds: UUID[] = []
  for (const messageId in messages) {
    messageIds.push(messageId as UUID)
  }

  if (messageIds.length <= GREENROOM_CACHE_MAX_MESSAGES) {
    return messages
  }

  messageIds.sort((left, right) => messages[left].createdAt - messages[right].createdAt)
  const retainStart = Math.max(0, messageIds.length - GREENROOM_CACHE_RETAIN_MESSAGES)
  const next: Record<UUID, Message> = {}

  for (let i = retainStart; i < messageIds.length; i += 1) {
    const id = messageIds[i]
    next[id] = messages[id]
  }

  return next
}

function isSameGreenroomMessage(existing: Message, next: Message): boolean {
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

export interface GreenroomSlice {
  // State
  greenroomMessages: Record<UUID, Message> // keyed by messageId
  currentCampaignId: UUID | null
  isGreenroomLoading: boolean

  // Actions
  addGreenroomMessage: (message: Message) => void
  updateGreenroomMessage: (messageId: UUID, updates: Partial<Message>) => void
  deleteGreenroomMessage: (messageId: UUID) => void
  clearGreenroomMessages: () => void
  setGreenroomCampaignId: (campaignId: UUID | null) => void

  // Event handlers
  handleGreenroomMessageSent: (event: EventEnvelope) => void
  handleGreenroomMessageEdited: (event: EventEnvelope) => void
  handleGreenroomMessageDeleted: (event: EventEnvelope) => void
}

export const createGreenroomSlice: StateCreator<GreenroomSlice> = (set) => ({
  // State
  greenroomMessages: {},
  currentCampaignId: null,
  isGreenroomLoading: false,

  // Actions
  addGreenroomMessage: (message) =>
    set((state) => {
      const existing = state.greenroomMessages[message.id]
      if (existing && isSameGreenroomMessage(existing, message)) {
        return state
      }

      return {
        greenroomMessages: pruneGreenroomMessageCache({
          ...state.greenroomMessages,
          [message.id]: message,
        }),
      }
    }),

  updateGreenroomMessage: (messageId, updates) =>
    set((state) => {
      const message = state.greenroomMessages[messageId]
      if (!message) return state

      const updateEntries = Object.entries(updates) as Array<[keyof Message, unknown]>
      if (updateEntries.length === 0) {
        return state
      }

      const hasChanges = updateEntries.some(([key, value]) => message[key] !== value)
      if (!hasChanges) return state

      return {
        greenroomMessages: {
          ...state.greenroomMessages,
          [messageId]: { ...message, ...updates },
        },
      }
    }),

  deleteGreenroomMessage: (messageId) =>
    set((state) => {
      if (!state.greenroomMessages[messageId]) {
        return state
      }

      const newMessages = { ...state.greenroomMessages }
      delete newMessages[messageId]
      return {
        greenroomMessages: newMessages,
      }
    }),

  clearGreenroomMessages: () =>
    set({
      greenroomMessages: {},
    }),

  setGreenroomCampaignId: (campaignId) =>
    set({
      currentCampaignId: campaignId,
    }),

  // Event handlers
  handleGreenroomMessageSent: (event) => {
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
      roomId: payload.roomId,
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
      const existing = state.greenroomMessages[message.id]
      if (existing && isSameGreenroomMessage(existing, message)) {
        return state
      }

      return {
        greenroomMessages: pruneGreenroomMessageCache({
          ...state.greenroomMessages,
          [message.id]: message,
        }),
      }
    })
  },

  handleGreenroomMessageEdited: (event) => {
    const payload = event.payload as { messageId: UUID; content: string }

    set((state) => {
      const message = state.greenroomMessages[payload.messageId]
      if (!message) return state
      if (message.content === payload.content) return state

      return {
        greenroomMessages: {
          ...state.greenroomMessages,
          [payload.messageId]: {
            ...message,
            content: payload.content,
            editedAt: event.timestamp,
          },
        },
      }
    })
  },

  handleGreenroomMessageDeleted: (event) => {
    const payload = event.payload as { messageId: UUID }

    set((state) => {
      if (!state.greenroomMessages[payload.messageId]) {
        return state
      }

      const newMessages = { ...state.greenroomMessages }
      delete newMessages[payload.messageId]
      return {
        greenroomMessages: newMessages,
      }
    })
  },
})
