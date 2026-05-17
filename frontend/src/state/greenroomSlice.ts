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
import type { Message } from '@/types/chat'

export interface GreenroomSlice {
  // State
  greenroomMessages: Record<UUID, Message> // keyed by messageId
  currentCampaignId: UUID | null
  isLoading: boolean

  // Actions
  addMessage: (message: Message) => void
  updateMessage: (messageId: UUID, updates: Partial<Message>) => void
  deleteMessage: (messageId: UUID) => void
  clearMessages: () => void
  setCampaignId: (campaignId: UUID | null) => void

  // Event handlers
  handleMessageSent: (event: EventEnvelope) => void
  handleMessageEdited: (event: EventEnvelope) => void
  handleMessageDeleted: (event: EventEnvelope) => void
}

export const createGreenroomSlice: StateCreator<GreenroomSlice> = (set) => ({
  // State
  greenroomMessages: {},
  currentCampaignId: null,
  isLoading: false,

  // Actions
  addMessage: (message) =>
    set((state) => ({
      greenroomMessages: {
        ...state.greenroomMessages,
        [message.id]: message,
      },
    })),

  updateMessage: (messageId, updates) =>
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

  deleteMessage: (messageId) =>
    set((state) => {
      const newMessages = { ...state.greenroomMessages }
      delete newMessages[messageId]
      return {
        greenroomMessages: newMessages,
      }
    }),

  clearMessages: () =>
    set({
      greenroomMessages: {},
    }),

  setCampaignId: (campaignId) =>
    set({
      currentCampaignId: campaignId,
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
      greenroomMessages: {
        ...state.greenroomMessages,
        [message.id]: message,
      },
    }))
  },

  handleMessageEdited: (event) => {
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

  handleMessageDeleted: (event) => {
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
