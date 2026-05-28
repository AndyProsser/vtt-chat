/**
 * MicMutedIndicator
 *
 * Leaf component that renders the muted-mic badge for a member.
 * Subscribes (via `useIsUserMuted`) to all bits that contribute to the
 * mute state for THIS userId:
 *   - own user mute state
 *   - DM mute override targeting this user
 *   - for the local user: device mic + PTT
 *
 * Mute flips re-render only this badge — never the surrounding member card,
 * list, or panel.
 *
 * Variants:
 *   - 'avatar'    Standard avatar overlay badge (`.avatar-muted-badge`).
 *   - 'profile'   Larger badge for profile/popover cards
 *                 (`.room-selector-profile__avatar-muted-badge`).
 */
import React from 'react'
import { type UUID } from '@shared'
import { useIsUserMuted } from '@/hooks/useIsUserMuted'

interface MicMutedIndicatorProps {
  sessionId: UUID
  userId: UUID
  isSelf?: boolean
  variant?: 'avatar' | 'profile'
  className?: string
}

const VARIANT_CLASS: Record<'avatar' | 'profile', string> = {
  avatar: 'avatar-muted-badge',
  profile: 'room-selector-profile__avatar-muted-badge',
}

function MicMutedIndicatorImpl({
  sessionId,
  userId,
  isSelf = false,
  variant = 'avatar',
  className,
}: MicMutedIndicatorProps) {
  const isMuted = useIsUserMuted(sessionId, userId, isSelf)

  if (!isMuted) return null

  const baseClass = VARIANT_CLASS[variant]
  const composed = className ? `${baseClass} ${className}` : baseClass

  return (
    <span className={composed} aria-label="Muted microphone" role="img">
      <span className="material-symbols-outlined" aria-hidden="true">
        mic_off
      </span>
    </span>
  )
}

export const MicMutedIndicator = React.memo(MicMutedIndicatorImpl)
