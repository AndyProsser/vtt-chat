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
  const entries = Object.entries(messages) as Array<[UUID, Message]>
  if (entries.length <= GREENROOM_CACHE_MAX_MESSAGES) {
    return messages
  }

  entries.sort((left, right) => left[1].createdAt - right[1].createdAt)
  return Object.fromEntries(
    entries.slice(Math.max(0, entries.length - GREENROOM_CACHE_RETAIN_MESSAGES))
  ) as Record<UUID, Message>
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
    set((state) => ({
      greenroomMessages: pruneGreenroomMessageCache({
        ...state.greenroomMessages,
        [message.id]: message,
      }),
    })),

  updateGreenroomMessage: (messageId, updates) =>
    set((state) => {
      const message = state.greenroomMessages[messageId]
      if (!message) return state

      return {
        greenroomMessages: {
          ...state.greenroomMessages,
          [messageId]: { ...message, ...updates },
        },
      }
    }),

  deleteGreenroomMessage: (messageId) =>
    set((state) => {
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

    set((state) => ({
      greenroomMessages: pruneGreenroomMessageCache({
        ...state.greenroomMessages,
        [message.id]: message,
      }),
    }))
  },

  handleGreenroomMessageEdited: (event) => {
    const payload = event.payload as { messageId: UUID; content: string }

    set((state) => {
      const message = state.greenroomMessages[payload.messageId]
      if (!message) return state

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
      const newMessages = { ...state.greenroomMessages }
      delete newMessages[payload.messageId]
      return {
        greenroomMessages: newMessages,
      }
    })
  },
})
