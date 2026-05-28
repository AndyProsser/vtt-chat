/**
 * PresenceIndicator
 *
 * Leaf component that renders the online/offline presence dot for a user.
 * Subscribes directly to `sessionPresence[sessionId][userId].state` so a
 * presence flip re-renders only this dot — never the surrounding member card,
 * list, or panel.
 *
 * Variants:
 *   - 'dot'        Small coloured dot used inside profile cards / popovers.
 *   - 'none'       Renders nothing visible; still subscribes so callers can
 *                  use this as a side-effect mount (rare; not currently needed).
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

function PresenceIndicatorImpl({
  sessionId,
  userId,
  variant = 'dot',
  className,
}: PresenceIndicatorProps) {
  const presenceState = useStore(
    (state) => state.sessionPresence[sessionId]?.[userId]?.state ?? PresenceState.OFFLINE
  )

  if (variant !== 'dot') return null

  const resolved = getResolvedPresenceState(presenceState)
  const dotState = getPresenceDotState(resolved)
  const label = PRESENCE_LABEL[dotState]
  const baseClass = 'room-selector-presence-dot'
  const composed = className ? `${baseClass} ${className}` : baseClass

  return <span className={composed} data-state={dotState} role="status" aria-label={label} />
}

export const PresenceIndicator = React.memo(PresenceIndicatorImpl)
