/**
 * TypingIndicator
 *
 * Leaf component that owns the entire "who is typing" UI. It subscribes
 * directly to `presenceTypingBySession[sessionId]` and `sessionPresence[sessionId]`
 * via primitive Zustand selectors (Object.is equality). Typing events flip at
 * keystroke frequency; isolating that bit here means typing flips never force
 * the surrounding ChatWindow / MessageList / MessageInput to re-render.
 *
 * Renders nothing when no one (other than the current user, in the same room)
 * is currently typing.
 */
import { useEffect, useMemo, useState } from 'react'
import type { UUID } from '@shared'
import { useStore } from '@/hooks/useStore'

interface TypingIndicatorProps {
  sessionId: UUID
  roomId: UUID
  currentUserId: UUID
}

const EMPTY_TYPING_INDICATORS: Array<{
  userId: UUID
  username: string
  roomId?: UUID
  until: number
}> = []

export function TypingIndicator({ sessionId, roomId, currentUserId }: TypingIndicatorProps) {
  const typingIndicators = useStore(
    (state) => state.presenceTypingBySession[sessionId] ?? EMPTY_TYPING_INDICATORS
  )

  // Local clock advances only when an indicator is about to expire — never on
  // every keystroke. The parent never sees these ticks.
  const [typingClock, setTypingClock] = useState(() => Date.now())

  useEffect(() => {
    let nextExpiryAt: number | null = null
    for (const indicator of typingIndicators) {
      if (indicator.until <= typingClock) continue
      if (nextExpiryAt === null || indicator.until < nextExpiryAt) {
        nextExpiryAt = indicator.until
      }
    }

    if (!nextExpiryAt) return

    const delay = Math.max(0, nextExpiryAt - Date.now() + 12)
    const timeoutId = window.setTimeout(() => {
      setTypingClock(Date.now())
    }, delay)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [typingIndicators, typingClock])

  const { active, summary } = useMemo(() => {
    const names: string[] = []
    let activeCount = 0

    for (const indicator of typingIndicators) {
      if (indicator.until <= typingClock) continue
      if (indicator.userId === currentUserId) continue
      if (indicator.roomId && indicator.roomId !== roomId) continue

      names.push(indicator.username)
      activeCount += 1
    }

    const summaryText =
      activeCount === 0
        ? ''
        : activeCount === 1
          ? `${names[0]} is typing`
          : `${names[0]} +${activeCount - 1} are typing`

    return { active: activeCount > 0, summary: summaryText }
  }, [typingIndicators, typingClock, currentUserId, roomId])

  return (
    <div className="session-chat-window__typing-slot" aria-live="polite">
      <div
        className={`session-chat-window__typing-overlay ${active ? 'session-chat-window__typing-overlay--active' : ''}`}
        aria-hidden={!active}
      >
        <span className="session-chat-window__typing-text">{active ? summary : ''}</span>
        <span className="session-chat-window__typing-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </div>
    </div>
  )
}
