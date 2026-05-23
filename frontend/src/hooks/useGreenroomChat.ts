/**
 * useGreenroomChat Hook
 * Fetches and manages campaign-level greenroom messages.
 * Messages are campaign-scoped and persist across session boundaries.
 */

import { useEffect, useCallback } from 'react'
import { useStore } from '@/state/store'
import { logger } from '@/utils/logger'
import { toGreenroomStoreMessage, type GreenroomApiMessage } from '@/utils/greenroomChat'
import type { UUID } from '@shared'

interface GreenroomChatOptions {
  campaignId?: UUID | null
  limit?: number
  enabled?: boolean
}

export function useGreenroomChat(options: GreenroomChatOptions = {}) {
  const { campaignId, limit = 20, enabled = true } = options

  const greenroomMessages = useStore((state) => state.greenroomMessages)
  const currentCampaignId = useStore((state) => state.currentCampaignId)
  const setGreenroomCampaignId = useStore((state) => state.setGreenroomCampaignId)
  const addGreenroomMessage = useStore((state) => state.addGreenroomMessage)
  const clearGreenroomMessages = useStore((state) => state.clearGreenroomMessages)

  const activeCampaignId = campaignId || currentCampaignId

  const fetchGreenroomMessages = useCallback(async () => {
    if (!enabled || !activeCampaignId) {
      return
    }

    try {
      const response = await fetch(`/api/chat/campaign/${activeCampaignId}/chat`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('authToken')}`,
        },
      })

      if (!response.ok) {
        logger.error('useGreenroomChat', 'Failed to fetch greenroom messages', {
          status: response.status,
          campaignId: activeCampaignId,
        })
        return
      }

      const { messages } = await response.json()

      // Populate greenroom messages in store
      messages.forEach((msg: GreenroomApiMessage) => {
        addGreenroomMessage(toGreenroomStoreMessage(msg))
      })

      logger.debug('useGreenroomChat', 'Loaded greenroom messages', {
        count: messages.length,
        campaignId: activeCampaignId,
      })
    } catch (error) {
      logger.error('useGreenroomChat', 'Error fetching greenroom messages', {
        error,
        campaignId: activeCampaignId,
      })
    }
  }, [activeCampaignId, enabled, addGreenroomMessage])

  const fetchGreenroomMessagesPage = useCallback(
    async (before?: number) => {
      if (!enabled || !activeCampaignId) {
        return { messages: [], hasMore: false }
      }

      try {
        const params = new URLSearchParams()
        if (before) params.append('before', String(before))
        params.append('limit', String(limit))

        const response = await fetch(`/api/chat/campaign/${activeCampaignId}/chat/page?${params}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('authToken')}`,
          },
        })

        if (!response.ok) {
          logger.error('useGreenroomChat', 'Failed to fetch greenroom messages page', {
            status: response.status,
            campaignId: activeCampaignId,
          })
          return { messages: [], hasMore: false }
        }

        const result = await response.json()

        // Populate messages in store
        result.messages.forEach((msg: GreenroomApiMessage) => {
          addGreenroomMessage(toGreenroomStoreMessage(msg))
        })

        return {
          messages: result.messages,
          hasMore: result.hasMore,
          nextBefore: result.nextBefore,
        }
      } catch (error) {
        logger.error('useGreenroomChat', 'Error fetching greenroom messages page', {
          error,
          campaignId: activeCampaignId,
        })
        return { messages: [], hasMore: false }
      }
    },
    [activeCampaignId, limit, enabled, addGreenroomMessage]
  )

  const sendGreenroomMessage = useCallback(
    async (content: string) => {
      if (!activeCampaignId) {
        logger.error('useGreenroomChat', 'Cannot send greenroom message: no active campaign')
        return null
      }

      try {
        const response = await fetch(`/api/chat/campaign/${activeCampaignId}/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('authToken')}`,
          },
          body: JSON.stringify({ content }),
        })

        if (!response.ok) {
          logger.error('useGreenroomChat', 'Failed to send greenroom message', {
            status: response.status,
            campaignId: activeCampaignId,
          })
          return null
        }

        const message = await response.json()
        addGreenroomMessage(toGreenroomStoreMessage(message as GreenroomApiMessage))

        return message
      } catch (error) {
        logger.error('useGreenroomChat', 'Error sending greenroom message', {
          error,
          campaignId: activeCampaignId,
        })
        return null
      }
    },
    [activeCampaignId, addGreenroomMessage]
  )

  // Update campaign ID in store when it changes
  useEffect(() => {
    if (campaignId) {
      setGreenroomCampaignId(campaignId)
    }
  }, [campaignId, setGreenroomCampaignId])

  useEffect(() => {
    if (!enabled || !activeCampaignId) {
      clearGreenroomMessages()
    }
  }, [activeCampaignId, clearGreenroomMessages, enabled])

  // Fetch messages when campaign changes
  useEffect(() => {
    if (enabled && activeCampaignId) {
      fetchGreenroomMessages()
    }
  }, [activeCampaignId, enabled, fetchGreenroomMessages])

  return {
    messages: greenroomMessages,
    isLoading: false,
    fetchMessages: fetchGreenroomMessages,
    fetchMessagesPage: fetchGreenroomMessagesPage,
    sendMessage: sendGreenroomMessage,
  }
}
