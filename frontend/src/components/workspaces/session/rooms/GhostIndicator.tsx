/**
 * GhostIndicator
 *
 * Leaf component that renders the "ghost-mode" badge on a member's avatar.
 * Subscribes directly to `sessionPresence[sessionId][userId].ghost` so a
 * ghost-mode flip re-renders only this badge — never the surrounding member
 * card, member list, or panel.
 *
 * Parents may rely on CSS `:has(.avatar-ghost-badge)` to apply a ghost
 * modifier to their own element without subscribing to the ghost bit.
 */
import React from 'react'
import { type UUID } from '@shared'
import { useStore } from '@/state/store'

interface GhostIndicatorProps {
  sessionId: UUID
  userId: UUID
  className?: string
}

function GhostIndicatorImpl({ sessionId, userId, className }: GhostIndicatorProps) {
  const isGhost = useStore((state) => Boolean(state.sessionPresence[sessionId]?.[userId]?.ghost))

  if (!isGhost) return null

  const baseClass = 'avatar-ghost-badge'
  const composed = className ? `${baseClass} ${className}` : baseClass

  return (
    <span className={composed} aria-label="Ghost mode" role="img">
      <span className="material-symbols-outlined" aria-hidden="true">
        visibility_off
      </span>
    </span>
  )
}

export const GhostIndicator = React.memo(GhostIndicatorImpl)
