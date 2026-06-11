import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { isGreenroomSessionState, MessageType, SessionState } from '@shared'
import type { UUID } from '@shared'
import { CHAT_HISTORY_PAGE_SIZE } from '@/constants/chatPresence.constants'
import { useStore } from '@/hooks/useStore'
import type { Message } from '@/types/chat'

function toTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsedNumeric = Number(value)
    if (Number.isFinite(parsedNumeric)) {
      return parsedNumeric
    }

    const parsedDate = Date.parse(value)
    if (Number.isFinite(parsedDate)) {
      return parsedDate
    }
  }

  return Date.now()
}

function getStartOfTodayTimestamp(): number {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
}

interface UseChatHistoryOptions {
  apiUrl: string
  token: string
  sessionId: UUID
  roomId: UUID
  campaignId?: UUID
  isGreenroomMode: boolean
  messageListRef: React.RefObject<HTMLDivElement | null>
  topSentinelRef: React.RefObject<HTMLDivElement | null>
}

export interface UseChatHistoryResult {
  isLoading: boolean
  isLoadingOlder: boolean
  hasMoreHistory: boolean
  error: string | null
  hasHiddenOlderGreenroomHistory: boolean
  revealOlderGreenroomHistory: () => void
}

/**
 * Manages chat history loading: initial page, infinite-scroll older pages,
 * greenroom today-only filtering, and scroll-position preservation after prepend.
 */
export function useChatHistory({
  apiUrl,
  token,
  sessionId,
  roomId,
  campaignId,
  isGreenroomMode,
  messageListRef,
  topSentinelRef,
}: UseChatHistoryOptions): UseChatHistoryResult {
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingOlder, setIsLoadingOlder] = useState(false)
  const [hasMoreHistory, setHasMoreHistory] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasHiddenOlderGreenroomHistory, setHasHiddenOlderGreenroomHistory] = useState(false)

  const isLoadingOlderRef = useRef(false)
  const oldestMessageTimestampRef = useRef<number | undefined>(undefined)
  const lastLoadCompletedAtRef = useRef(0)
  const prevMessageCountRef = useRef(0)
  const greenroomTodayStartRef = useRef(getStartOfTodayTimestamp())
  const lastHydratedGreenroomStateRef = useRef<string | null | undefined>(undefined)
  const pendingScrollRestoreRef = useRef<{ previousTop: number; previousHeight: number } | null>(
    null
  )

  const OBSERVER_LOAD_COOLDOWN_MS = 600

  const addMessages = useStore((state) => state.addMessages)
  const sessionRecord = useStore((state) => (state.sessions as any)[sessionId]) as
    | { dmId?: UUID; state?: SessionState }
    | undefined

  const visibleMessageCount = useStore((state) => {
    const messages = (state.messages as any)[sessionId]
    if (!messages) return 0
    const roomMessages = messages[roomId]
    return Array.isArray(roomMessages) ? roomMessages.length : 0
  })

  useEffect(() => {
    isLoadingOlderRef.current = isLoadingOlder
  }, [isLoadingOlder])

  useEffect(() => {
    const messages = (useStore.getState().messages as any)[sessionId]
    const roomMessages = messages?.[roomId]
    oldestMessageTimestampRef.current = Array.isArray(roomMessages)
      ? roomMessages[0]?.createdAt
      : undefined
  })

  useLayoutEffect(() => {
    if (isLoadingOlder || !pendingScrollRestoreRef.current || !messageListRef.current) {
      return
    }

    const { previousTop, previousHeight } = pendingScrollRestoreRef.current
    pendingScrollRestoreRef.current = null

    const nextHeight = messageListRef.current.scrollHeight
    if (previousTop > 0 && nextHeight > previousHeight) {
      messageListRef.current.scrollTop = previousTop + (nextHeight - previousHeight)
    }
  }, [isLoadingOlder, messageListRef])

  useEffect(() => {
    const prevCount = prevMessageCountRef.current
    if (visibleMessageCount < prevCount && prevCount > 0 && !isLoadingOlderRef.current) {
      setHasMoreHistory(true)
    }
    prevMessageCountRef.current = visibleMessageCount
  }, [visibleMessageCount])

  const loadHistoryPage = useCallback(
    async ({ before, older }: { before?: number; older: boolean }) => {
      if (isGreenroomMode && !campaignId) {
        setIsLoading(false)
        setIsLoadingOlder(false)
        return
      }

      if (older) {
        setIsLoadingOlder(true)
      } else {
        setIsLoading(true)
      }

      setError(null)

      try {
        const params = new URLSearchParams()
        params.set('limit', String(CHAT_HISTORY_PAGE_SIZE))
        if (!isGreenroomMode) {
          params.set('sinceLatestStart', '1')
        }
        if (isGreenroomMode && !older && before === undefined) {
          params.set('todayOnly', '1')
        }
        if (before && Number.isFinite(before)) {
          params.set('before', String(before))
        }
        const historyUrl =
          isGreenroomMode && campaignId
            ? `${apiUrl}/api/chat/campaign/${campaignId}/chat/page?${params.toString()}`
            : `${apiUrl}/api/chat/messages/${sessionId}?${params.toString()}`
        const res = await fetch(historyUrl, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.message ?? `HTTP ${res.status}`)
        }

        const data = await res.json()
        const msgs: Message[] = (data.messages ?? []).map((m: any) => ({
          id: m.id as UUID,
          sessionId: m.sessionId as UUID | undefined,
          roomId: (m.roomId as UUID | undefined) || roomId,
          authorId: m.authorId as UUID,
          authorUsername: m.authorUsername as string,
          content: m.content as string,
          type: m.type as MessageType,
          isDmOnly: m.isDmOnly as boolean,
          visibleTo: Array.isArray(m.visibleTo) ? (m.visibleTo as UUID[]) : undefined,
          targetIds: Array.isArray(m.targetIds) ? (m.targetIds as UUID[]) : undefined,
          metadata: m.metadata,
          createdAt: toTimestamp(m.createdAt),
          editedAt: m.editedAt !== undefined ? toTimestamp(m.editedAt) : undefined,
        }))

        addMessages(sessionId, msgs, { skipPrune: older })

        const hasMore = Boolean(data.pagination?.hasMore ?? data.hasMore)
        const hasEarlier = Boolean(data.pagination?.hasEarlier ?? data.hasEarlier)
        setHasHiddenOlderGreenroomHistory(
          isGreenroomMode && !older && before === undefined ? hasEarlier : false
        )
        setHasMoreHistory(hasMore)
      } catch (err: any) {
        setError(err.message ?? 'Failed to load messages')
      } finally {
        if (older) {
          lastLoadCompletedAtRef.current = Date.now()
          setIsLoadingOlder(false)
        } else {
          setIsLoading(false)
        }
      }
    },
    [addMessages, apiUrl, campaignId, isGreenroomMode, roomId, sessionId, token]
  )

  // Bootstrap: load latest page on mount / sessionId+roomId change.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadHistoryPage({ older: false })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadHistoryPage])

  // Greenroom: reload when session transitions to a greenroom state.
  useEffect(() => {
    if (!isGreenroomMode) {
      lastHydratedGreenroomStateRef.current = sessionRecord?.state
      return
    }

    if (lastHydratedGreenroomStateRef.current === undefined) {
      lastHydratedGreenroomStateRef.current = sessionRecord?.state
      return
    }

    if (lastHydratedGreenroomStateRef.current === sessionRecord?.state) {
      return
    }

    lastHydratedGreenroomStateRef.current = sessionRecord?.state

    if (!isGreenroomSessionState(sessionRecord?.state)) {
      return
    }

    prevMessageCountRef.current = 0
    void loadHistoryPage({ older: false })
  }, [isGreenroomMode, loadHistoryPage, sessionRecord?.state])

  // Infinite scroll: IntersectionObserver on the top sentinel.
  useEffect(() => {
    if (isLoading || !hasMoreHistory) {
      return
    }

    const root = messageListRef.current
    const target = topSentinelRef.current

    if (!root || !target || typeof IntersectionObserver === 'undefined') {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry?.isIntersecting || isLoadingOlderRef.current) {
          return
        }

        if (Date.now() - lastLoadCompletedAtRef.current < OBSERVER_LOAD_COOLDOWN_MS) {
          return
        }

        const before = oldestMessageTimestampRef.current
        if (!before) {
          return
        }

        isLoadingOlderRef.current = true
        pendingScrollRestoreRef.current = {
          previousTop: root.scrollTop,
          previousHeight: root.scrollHeight,
        }

        void loadHistoryPage({ before, older: true })
      },
      { root, rootMargin: '120px 0px 0px 0px', threshold: 0 }
    )

    observer.observe(target)
    return () => observer.disconnect()
  }, [hasMoreHistory, isLoading, loadHistoryPage, messageListRef, topSentinelRef])

  const revealOlderGreenroomHistory = useCallback(() => {
    if (
      !isGreenroomMode ||
      !hasHiddenOlderGreenroomHistory ||
      isLoadingOlderRef.current ||
      !messageListRef.current
    ) {
      return
    }

    const scrollContainer = messageListRef.current
    isLoadingOlderRef.current = true
    pendingScrollRestoreRef.current = {
      previousTop: scrollContainer.scrollTop,
      previousHeight: scrollContainer.scrollHeight,
    }
    setHasHiddenOlderGreenroomHistory(false)
    void loadHistoryPage({ before: greenroomTodayStartRef.current, older: true })
  }, [hasHiddenOlderGreenroomHistory, isGreenroomMode, loadHistoryPage, messageListRef])

  return {
    isLoading,
    isLoadingOlder,
    hasMoreHistory,
    error,
    hasHiddenOlderGreenroomHistory,
    revealOlderGreenroomHistory,
  }
}
