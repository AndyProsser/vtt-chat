/**
 * PresenceIndicator
 *
 * Leaf component that renders the online/offline presence dot for a user.
 * Subscribes directly to `sessionPresence[sessionId][userId].state` so a
 * presence flip re-renders only this dot — never the surrounding member card,
 * list, or panel.
 *
 * Variant:
 *   - 'dot'        Small coloured dot used inside profile cards / popovers.
 */
import React from 'react'
import { PresenceState, type UUID } from '@shared'
import { useStore } from '@/state/store'
import { getPresenceDotState, getResolvedPresenceState } from '@/utils/groupsPanel'

interface PresenceIndicatorProps {
  sessionId: UUID
  userId: UUID
  variant?: 'dot'
  className?: string
}

const PRESENCE_LABEL: Record<'online' | 'offline', string> = {
  online: 'Online',
  offline: 'Offline',
}

const GHOST_LABEL = 'Ghost mode'

function PresenceIndicatorImpl({
  sessionId,
  userId,
  variant = 'dot',
  className,
}: PresenceIndicatorProps) {
  const presenceState = useStore(
    (state) => state.sessionPresence[sessionId]?.[userId]?.state ?? PresenceState.OFFLINE
  )
  const isGhost = useStore((state) => Boolean(state.sessionPresence[sessionId]?.[userId]?.ghost))

  if (variant !== 'dot') return null

  const resolved = getResolvedPresenceState(presenceState)
  const presenceDotState = getPresenceDotState(resolved)
  const dotState: 'online' | 'offline' | 'ghost' = isGhost ? 'ghost' : presenceDotState
  const label = isGhost ? GHOST_LABEL : PRESENCE_LABEL[presenceDotState]
  const baseClass = 'room-selector-presence-dot'
  const composed = className ? `${baseClass} ${className}` : baseClass

  return (
    <span className={composed} data-state={dotState} role="status" aria-label={label}>
      <span className="room-selector-presence-dot__inner" aria-hidden="true" />
    </span>
  )
}

export const PresenceIndicator = React.memo(PresenceIndicatorImpl)
