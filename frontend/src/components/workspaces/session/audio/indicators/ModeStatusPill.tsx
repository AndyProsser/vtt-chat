/**
 * ModeStatusPill
 *
 * Leaf component for audio mode display (LIVE / MUTED).
 * Subscribes only to combined mute state, preventing parent re-renders
 * when other non-mute bits change.
 *
 * Shows the true mute state including DM overrides.
 */

import React from 'react'
import { type UUID } from '@shared'
import { useIsUserMuted } from '@/hooks/useIsUserMuted'
import { getAudioModeLabel } from '@/constants/audioUi.constants'

interface ModeStatusPillProps {
  sessionId: UUID
  userId: UUID
}

export const ModeStatusPill = React.memo(({ sessionId, userId }: ModeStatusPillProps) => {
  const isMuted = useIsUserMuted(sessionId, userId, true)
  const modeLabel = getAudioModeLabel(isMuted)

  return (
    <span className={`session-audio-device-panel__mode-pill ${isMuted ? 'is-muted' : 'is-live'}`}>
      {modeLabel}
    </span>
  )
})

ModeStatusPill.displayName = 'ModeStatusPill'
