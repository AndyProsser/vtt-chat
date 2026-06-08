/**
 * AwayIndicator
 *
 * Leaf component that renders a static yellow ring on a member's avatar when
 * their presence state is IDLE (AWAY). Like GhostIndicator, it is always
 * visible while AWAY — independent of speaking state.
 *
 * The ring is suppressed in PRIVATE (whisper) rooms.
 */
import React from 'react'
import { PresenceState, RoomType, type UUID } from '@shared'
import { useStore } from '@/state/store'

interface AwayIndicatorProps {
  sessionId: UUID
  userId: UUID
  roomType?: RoomType
}

function AwayIndicatorImpl({ sessionId, userId, roomType }: AwayIndicatorProps) {
  const isAway = useStore(
    (state) => state.sessionPresence[sessionId]?.[userId]?.state === PresenceState.IDLE
  )

  if (roomType === RoomType.PRIVATE) return null
  if (!isAway) return null

  return <span className="avatar-glyph__away-ring" aria-label="Away" />
}

export const AwayIndicator = React.memo(AwayIndicatorImpl)
