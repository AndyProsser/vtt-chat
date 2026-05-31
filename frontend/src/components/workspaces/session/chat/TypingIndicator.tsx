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
import type { SessionPresence } from '@/types/room'

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
const EMPTY_SESSION_PRESENCE: Record<UUID, SessionPresence> = {}

export function TypingIndicator({ sessionId, roomId, currentUserId }: TypingIndicatorProps) {
  const typingIndicators = useStore(
    (state) => state.presenceTypingBySession[sessionId] ?? EMPTY_TYPING_INDICATORS
  )
  const sessionPresence = useStore(
    (state) => state.sessionPresence[sessionId] ?? EMPTY_SESSION_PRESENCE
  )
  const sessionDmId = useStore((state) => state.sessions[sessionId]?.dmId ?? null)

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

  const { active, summary, elsewhereSummary } = useMemo(() => {
    const inRoomNames: string[] = []
    const elsewhereNames: string[] = []
    let inRoomCount = 0
    let elsewhereCount = 0
    const isDmViewer = sessionDmId === currentUserId

    for (const indicator of typingIndicators) {
      if (indicator.until <= typingClock) continue
      if (indicator.userId === currentUserId) continue

      const participant = sessionPresence[indicator.userId]
      const eventRoomId = indicator.roomId
      const resolvedPresenceRoomId = participant?.privateRoomId || participant?.primaryRoomId
      const isCurrentRoomTyping = eventRoomId
        ? eventRoomId === roomId
        : resolvedPresenceRoomId === roomId

      const displayName =
        participant?.characterName?.trim() || participant?.playerName?.trim() || indicator.username

      if (isCurrentRoomTyping) {
        inRoomNames.push(displayName)
        inRoomCount += 1
        continue
      }

      if (isDmViewer) {
        elsewhereNames.push(displayName)
        elsewhereCount += 1
      }
    }

    const summaryText =
      inRoomCount === 0
        ? ''
        : inRoomCount === 1
          ? `${inRoomNames[0]} is typing`
          : `${inRoomNames[0]} +${inRoomCount - 1} are typing`

    const elsewhereText =
      elsewhereCount === 0
        ? ''
        : elsewhereCount === 1
          ? `${elsewhereNames[0]} is typing elsewhere`
          : `${elsewhereNames[0]} +${elsewhereCount - 1} typing elsewhere`

    return {
      active: inRoomCount > 0 || elsewhereCount > 0,
      summary: summaryText,
      elsewhereSummary: elsewhereText,
    }
  }, [typingIndicators, typingClock, currentUserId, roomId, sessionDmId, sessionPresence])

  return (
    <div className="session-chat-window__typing-slot" aria-live="polite">
      <div
        className={`session-chat-window__typing-overlay ${active ? 'session-chat-window__typing-overlay--active' : ''}`}
        aria-hidden={!active}
      >
        <span className="session-chat-window__typing-text">
          {active ? summary || elsewhereSummary : ''}
          {summary && elsewhereSummary ? ' • ' : ''}
          {summary && elsewhereSummary ? (
            <span className="session-chat-window__typing-text--elsewhere">{elsewhereSummary}</span>
          ) : null}
        </span>
        <span className="session-chat-window__typing-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </div>
    </div>
  )
}
