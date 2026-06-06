/**
 * DistanceBadge
 *
 * Leaf component that renders a colour-coded badge on the top-left of an avatar
 * when the DM has applied a distance modifier to this user.
 *
 * Colours convey proximity:
 *   Nearby  → emerald  (close, only slightly attenuated)
 *   Visible → gold     (across the room)
 *   Far     → orange   (shouting distance)
 *   Default → no badge (normal conversational range)
 *
 * Subscribes directly to the dmOverrides store slice for the target userId.
 */
import React from 'react'
import type { UUID } from '@shared'
import { findDistancePreset } from '@shared'
import { useStore } from '@/state/store'
import { getUserDMOverride } from '@/utils/audioOverrides'

interface DistanceBadgeProps {
  userId: UUID
}

const DISTANCE_COLOURS: Record<string, string> = {
  Nearby: '#34d399',
  Visible: '#facc15',
  Far: '#fb923c',
}

function DistanceBadgeImpl({ userId }: DistanceBadgeProps) {
  const override = useStore((state) => getUserDMOverride(state.dmOverrides, userId, 'DISTANCE'))

  if (!override) return null

  const presetName = override.parameters?.presetName as string | undefined
  const preset = presetName ? findDistancePreset(presetName) : undefined

  // Default distance = no badge
  if (!preset || preset.name === 'Default') return null

  const colour = DISTANCE_COLOURS[preset.name] ?? '#94a3b8'

  return (
    <span
      className="avatar-distance-badge"
      aria-label={`Distance: ${preset.label}`}
      role="img"
      style={{ color: colour }}
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        {preset.icon}
      </span>
    </span>
  )
}

export const DistanceBadge = React.memo(DistanceBadgeImpl)
