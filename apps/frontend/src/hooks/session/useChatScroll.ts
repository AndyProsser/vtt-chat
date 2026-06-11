import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

const AUTO_FOLLOW_BOTTOM_THRESHOLD_PX = 48
const AUTO_FOLLOW_SMOOTH_SETTLE_MS = 480

function isNearBottom(
  scrollContainer: HTMLDivElement,
  thresholdPx = AUTO_FOLLOW_BOTTOM_THRESHOLD_PX
) {
  const distanceFromBottom =
    scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight
  return distanceFromBottom <= thresholdPx
}

interface UseChatScrollOptions {
  messageListRef: React.RefObject<HTMLDivElement | null>
  /** Key that identifies the latest visible message — changes trigger auto-follow logic. */
  latestVisibleMessageKey: string | undefined
  /** True while initial load is in progress — suppresses scroll effects. */
  isLoading: boolean
  /** Composite key (sessionId:roomId) used to detect room switches. */
  contextKey: string
  onPendingNewMessageCountChange?: (count: number) => void
}

export interface UseChatScrollResult {
  isUserPinnedToBottom: boolean
  isAutoFollowInProgress: boolean
  pendingNewMessageCount: number
  scrollToLatest: (behavior?: ScrollBehavior) => void
  clearPendingNewMessageCount: () => void
  handleListScroll: () => void
  handleListWheel: (event: React.WheelEvent<HTMLDivElement>) => void
  scheduleSettledBottomSnap: () => void
}

/**
 * Manages chat scroll state: auto-follow on new messages, pinned-to-bottom
 * tracking, multi-frame bottom snapping while virtual rows settle, and
 * resize-triggered re-snapping.
 */
export function useChatScroll({
  messageListRef,
  latestVisibleMessageKey,
  isLoading,
  contextKey,
  onPendingNewMessageCountChange,
}: UseChatScrollOptions): UseChatScrollResult {
  const [isUserPinnedToBottom, setIsUserPinnedToBottom] = useState(true)
  const [isAutoFollowInProgress, setIsAutoFollowInProgress] = useState(false)
  const [pendingNewMessageCount, setPendingNewMessageCount] = useState(0)

  const autoFollowResetTimeoutRef = useRef<number | null>(null)
  const bottomSnapRafRef = useRef<number | null>(null)
  const bottomSnapTimerRef = useRef<number | null>(null)
  const initialScrollContextRef = useRef<string | null>(null)
  const lastSeenLatestMessageKeyRef = useRef<string | undefined>(undefined)

  useEffect(
    () => () => {
      if (autoFollowResetTimeoutRef.current) {
        window.clearTimeout(autoFollowResetTimeoutRef.current)
        autoFollowResetTimeoutRef.current = null
      }
      if (bottomSnapRafRef.current) {
        window.cancelAnimationFrame(bottomSnapRafRef.current)
        bottomSnapRafRef.current = null
      }
      if (bottomSnapTimerRef.current) {
        window.clearTimeout(bottomSnapTimerRef.current)
        bottomSnapTimerRef.current = null
      }
    },
    []
  )

  const scrollToLatest = useCallback(
    (behavior: ScrollBehavior = 'auto') => {
      const scrollContainer = messageListRef.current
      if (!scrollContainer) return

      if (typeof scrollContainer.scrollTo !== 'function') {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
        return
      }

      scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior })
    },
    [messageListRef]
  )

  const clearPendingNewMessageCount = useCallback(() => {
    setPendingNewMessageCount((count) => (count === 0 ? count : 0))
  }, [])

  const scheduleSettledBottomSnap = useCallback(() => {
    if (bottomSnapRafRef.current) {
      window.cancelAnimationFrame(bottomSnapRafRef.current)
      bottomSnapRafRef.current = null
    }
    if (bottomSnapTimerRef.current) {
      window.clearTimeout(bottomSnapTimerRef.current)
      bottomSnapTimerRef.current = null
    }

    const MAX_SETTLE_FRAMES = 24
    const REQUIRED_STABLE_FRAMES = 3
    let frameCount = 0
    let stableFrameCount = 0
    let previousHeight = -1

    const tick = () => {
      const scrollContainer = messageListRef.current
      if (!scrollContainer) {
        bottomSnapRafRef.current = null
        return
      }

      scrollToLatest('auto')

      const nextHeight = scrollContainer.scrollHeight
      if (nextHeight === previousHeight) {
        stableFrameCount += 1
      } else {
        stableFrameCount = 0
        previousHeight = nextHeight
      }

      frameCount += 1
      if (stableFrameCount >= REQUIRED_STABLE_FRAMES || frameCount >= MAX_SETTLE_FRAMES) {
        bottomSnapRafRef.current = null
        return
      }

      bottomSnapRafRef.current = window.requestAnimationFrame(tick)
    }

    // Hard cap: ensures no lingering loop on edge-case layout churn.
    bottomSnapTimerRef.current = window.setTimeout(() => {
      if (bottomSnapRafRef.current) {
        window.cancelAnimationFrame(bottomSnapRafRef.current)
        bottomSnapRafRef.current = null
      }
      scrollToLatest('auto')
      bottomSnapTimerRef.current = null
    }, 700)

    bottomSnapRafRef.current = window.requestAnimationFrame(tick)
  }, [messageListRef, scrollToLatest])

  const handleListScroll = useCallback(() => {
    const scrollContainer = messageListRef.current
    if (!scrollContainer) return

    const nearBottom = isNearBottom(scrollContainer)
    setIsUserPinnedToBottom(nearBottom)

    if (nearBottom) {
      if (isAutoFollowInProgress) {
        setIsAutoFollowInProgress(false)
        if (autoFollowResetTimeoutRef.current) {
          window.clearTimeout(autoFollowResetTimeoutRef.current)
          autoFollowResetTimeoutRef.current = null
        }
      }
      clearPendingNewMessageCount()
    } else if (isAutoFollowInProgress) {
      setIsAutoFollowInProgress(false)
      if (autoFollowResetTimeoutRef.current) {
        window.clearTimeout(autoFollowResetTimeoutRef.current)
        autoFollowResetTimeoutRef.current = null
      }
    }
  }, [clearPendingNewMessageCount, isAutoFollowInProgress, messageListRef])

  // Greenroom wheel: trigger older-history reveal on upward scroll at top.
  // The actual revealOlderGreenroomHistory is called by the consumer; this
  // hook only exposes handleListWheel as a pass-through.
  const handleListWheel = useCallback((_event: React.WheelEvent<HTMLDivElement>) => {
    // No-op here — ChatWindow wires up greenroom-specific wheel logic.
  }, [])

  // After initial hydrate (or room/session switch), pin viewport to newest message.
  useEffect(() => {
    if (isLoading || !latestVisibleMessageKey) return

    if (initialScrollContextRef.current === contextKey) return

    scheduleSettledBottomSnap()
    setIsUserPinnedToBottom(true)
    initialScrollContextRef.current = contextKey
    clearPendingNewMessageCount()
    lastSeenLatestMessageKeyRef.current = latestVisibleMessageKey
  }, [
    clearPendingNewMessageCount,
    contextKey,
    isLoading,
    latestVisibleMessageKey,
    scheduleSettledBottomSnap,
  ])

  // Resize: re-snap when the scroll container changes dimensions.
  useEffect(() => {
    const node = messageListRef.current
    if (!node || typeof ResizeObserver === 'undefined') return

    let prevWidth = node.clientWidth
    let prevHeight = node.clientHeight

    const observer = new ResizeObserver(() => {
      if (!messageListRef.current) return

      const nextWidth = messageListRef.current.clientWidth
      const nextHeight = messageListRef.current.clientHeight
      const sizeChanged = nextWidth !== prevWidth || nextHeight !== prevHeight

      if (!sizeChanged) return

      prevWidth = nextWidth
      prevHeight = nextHeight

      const shouldStick =
        isAutoFollowInProgress ||
        isUserPinnedToBottom ||
        isNearBottom(messageListRef.current, AUTO_FOLLOW_BOTTOM_THRESHOLD_PX)

      if (shouldStick) scheduleSettledBottomSnap()
    })

    observer.observe(node)
    return () => observer.disconnect()
  }, [isAutoFollowInProgress, isUserPinnedToBottom, messageListRef, scheduleSettledBottomSnap])

  // Auto-follow new messages when pinned to bottom; show badge otherwise.
  useLayoutEffect(() => {
    if (!latestVisibleMessageKey) return

    const lastSeen = lastSeenLatestMessageKeyRef.current
    const isNewLatest = latestVisibleMessageKey !== lastSeen

    if (!isNewLatest) return

    const scrollContainer = messageListRef.current
    const shouldAutoFollow =
      isAutoFollowInProgress ||
      isUserPinnedToBottom ||
      (scrollContainer ? isNearBottom(scrollContainer) : false)

    if (shouldAutoFollow) {
      setIsAutoFollowInProgress(true)
      if (autoFollowResetTimeoutRef.current) {
        window.clearTimeout(autoFollowResetTimeoutRef.current)
      }
      autoFollowResetTimeoutRef.current = window.setTimeout(() => {
        setIsAutoFollowInProgress(false)
        autoFollowResetTimeoutRef.current = null
      }, AUTO_FOLLOW_SMOOTH_SETTLE_MS)

      scheduleSettledBottomSnap()
      setIsUserPinnedToBottom(true)
      clearPendingNewMessageCount()
      lastSeenLatestMessageKeyRef.current = latestVisibleMessageKey
      return
    }

    window.requestAnimationFrame(() => {
      setPendingNewMessageCount((count) => count + 1)
    })
  }, [
    clearPendingNewMessageCount,
    isAutoFollowInProgress,
    isUserPinnedToBottom,
    latestVisibleMessageKey,
    messageListRef,
    scheduleSettledBottomSnap,
  ])

  useEffect(() => {
    onPendingNewMessageCountChange?.(pendingNewMessageCount)
  }, [onPendingNewMessageCountChange, pendingNewMessageCount])

  useEffect(() => {
    if (isUserPinnedToBottom) {
      window.requestAnimationFrame(() => clearPendingNewMessageCount())
    }
  }, [clearPendingNewMessageCount, isUserPinnedToBottom])

  return {
    isUserPinnedToBottom,
    isAutoFollowInProgress,
    pendingNewMessageCount,
    scrollToLatest,
    clearPendingNewMessageCount,
    handleListScroll,
    handleListWheel,
    scheduleSettledBottomSnap,
  }
}
