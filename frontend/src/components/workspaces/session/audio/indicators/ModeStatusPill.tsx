/**
 * ModeStatusPill
 *
 * Leaf component for audio mode display (LIVE / MUTED).
 * Subscribes only to device.enabled and combined mute state, preventing
 * parent re-renders when other non-mute bits change.
 *
 * Shows MUTED when the user has not yet gone live (device.enabled = false),
 * so the pill matches the mic icon state rather than stale server mute data.
 */

import React from 'react'
import { type UUID } from '@shared'
import { useIsUserMuted } from '@/hooks/useIsUserMuted'
import { useStore } from '@/state/store'
import { getAudioModeLabel } from '@/constants/audioUi.constants'

interface ModeStatusPillProps {
  sessionId: UUID
  userId: UUID
}

export const ModeStatusPill = React.memo(({ sessionId, userId }: ModeStatusPillProps) => {
  // Before going live, device.enabled is false — the user is not transmitting
  // and should always appear as muted regardless of server-side mute state.
  const isDeviceEnabled = useStore((state) => state.device.enabled)
  const isMuted = useIsUserMuted(sessionId, userId, true)

  const effectivelyMuted = !isDeviceEnabled || isMuted
  const modeLabel = getAudioModeLabel(effectivelyMuted)

  return (
    <span
      className={`session-audio-device-panel__mode-pill ${effectivelyMuted ? 'is-muted' : 'is-live'}`}
    >
      {modeLabel}
    </span>
  )
})

ModeStatusPill.displayName = 'ModeStatusPill'
