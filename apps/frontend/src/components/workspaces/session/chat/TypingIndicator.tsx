/**
 * TypingIndicator
 *
 * Leaf component that owns the entire "who is typing" UI. Two room-scoped
 * Zustand subscriptions replace the previous session-wide one:
 *
 *   inRoomIndicators   — typing users in this specific room (everyone sees this)
 *   elsewhereIndicators — typing users in other rooms (DM viewer only; always
 *                         EMPTY_TYPING_INDICATORS for non-DM users so their
 *                         subscription never fires on cross-room events)
 *
 * useShallow on each selector means a typing event in room B does not trigger
 * a re-render of a TypingIndicator mounted in room A — the filtered subset is
 * shallowly equal so Zustand skips the re-render entirely.
 *
 * Typing events flip at keystroke frequency; isolating that bit here means
 * typing flips never force the surrounding ChatWindow / MessageList /
 * MessageInput to re-render.
 */
import { memo, useEffect, useMemo, useState } from 'react'
import type { UUID } from '@shared'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '@/hooks/useStore'
import type { TypingIndicator as TypingIndicatorData } from '@/types/chat'
import type { SessionPresence } from '@/types/room'

interface TypingIndicatorProps {
  sessionId: UUID
  roomId: UUID
  currentUserId: UUID
}

const EMPTY_TYPING_INDICATORS: TypingIndicatorData[] = []
const EMPTY_SESSION_PRESENCE: Record<UUID, SessionPresence> = {}

export const TypingIndicator = memo(function TypingIndicator({
  sessionId,
  roomId,
  currentUserId,
}: TypingIndicatorProps) {
  // Scoped to this room only. useShallow prevents re-renders when typing changes
  // in other rooms — those indicators are filtered out before the comparison runs.
  const inRoomIndicators = useStore(
    useShallow((state) =>
      (state.presenceTypingBySession[sessionId] ?? EMPTY_TYPING_INDICATORS).filter(
        (t) => !t.roomId || t.roomId === roomId
      )
    )
  )

  // DM-only: indicators for users typing in OTHER rooms.
  // For non-DM users this always returns EMPTY_TYPING_INDICATORS (same stable
  // reference), so useShallow short-circuits and the subscription never fires.
  const elsewhereIndicators = useStore(
    useShallow((state) => {
      const dmId = state.sessions[sessionId]?.dmId ?? null
      if (dmId !== currentUserId) return EMPTY_TYPING_INDICATORS
      return (state.presenceTypingBySession[sessionId] ?? EMPTY_TYPING_INDICATORS).filter(
        (t) => Boolean(t.roomId) && t.roomId !== roomId
      )
    })
  )

  const sessionPresence = useStore(
    (state) => state.sessionPresence[sessionId] ?? EMPTY_SESSION_PRESENCE
  )

  // Local clock advances only when an indicator is about to expire — never on
  // every keystroke. The parent never sees these ticks.
  const [typingClock, setTypingClock] = useState(() => Date.now())

  useEffect(() => {
    let nextExpiryAt: number | null = null

    for (const indicator of inRoomIndicators) {
      if (indicator.until <= typingClock) continue
      if (nextExpiryAt === null || indicator.until < nextExpiryAt) nextExpiryAt = indicator.until
    }
    for (const indicator of elsewhereIndicators) {
      if (indicator.until <= typingClock) continue
      if (nextExpiryAt === null || indicator.until < nextExpiryAt) nextExpiryAt = indicator.until
    }

    if (!nextExpiryAt) return

    const delay = Math.max(0, nextExpiryAt - Date.now() + 12)
    const timeoutId = window.setTimeout(() => {
      setTypingClock(Date.now())
    }, delay)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [inRoomIndicators, elsewhereIndicators, typingClock])

  const { active, summary, elsewhereSummary } = useMemo(() => {
    const inRoomNames: string[] = []
    let inRoomCount = 0

    for (const indicator of inRoomIndicators) {
      if (indicator.until <= typingClock) continue
      if (indicator.userId === currentUserId) continue

      const participant = sessionPresence[indicator.userId]
      const displayName =
        participant?.characterName?.trim() || participant?.playerName?.trim() || indicator.username

      inRoomNames.push(displayName)
      inRoomCount += 1
    }

    const elsewhereNames: string[] = []
    let elsewhereCount = 0

    for (const indicator of elsewhereIndicators) {
      if (indicator.until <= typingClock) continue

      const participant = sessionPresence[indicator.userId]
      const displayName =
        participant?.characterName?.trim() || participant?.playerName?.trim() || indicator.username

      elsewhereNames.push(displayName)
      elsewhereCount += 1
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
  }, [inRoomIndicators, elsewhereIndicators, typingClock, currentUserId, sessionPresence])

  const typingOverlayClassName = [
    'session-chat-window__typing-overlay',
    active ? 'session-chat-window__typing-overlay--active' : '',
    !summary && elsewhereSummary ? 'session-chat-window__typing-overlay--elsewhere-only' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="session-chat-window__typing-slot" aria-live="polite">
      <div className={typingOverlayClassName} aria-hidden={!active}>
        <span className="session-chat-window__typing-text">
          {summary ? (
            <span className="session-chat-window__typing-text--local">{summary}</span>
          ) : null}
          {summary && elsewhereSummary ? (
            <span className="session-chat-window__typing-separator" aria-hidden="true">
              {' '}
              •{' '}
            </span>
          ) : null}
          {elsewhereSummary ? (
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
})
