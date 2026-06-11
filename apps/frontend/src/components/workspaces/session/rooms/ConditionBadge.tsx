/**
 * ConditionBadge
 *
 * Leaf component that renders a small badge on the bottom-left of an avatar
 * when the DM has applied a condition override to this user.
 *
 * Each condition has its own icon (mic_off for Silenced, water for Underwater,
 * etc.). Only the first/only condition is displayed — one badge slot.
 *
 * Subscribes directly to the dmOverrides store slice for the target userId,
 * so condition changes re-render only this badge.
 */
import React from 'react'
import type { UUID } from '@shared'
import { findConditionPreset } from '@shared'
import { useStore } from '@/state/store'
import { getUserDMOverride } from '@/utils/audioOverrides'

interface ConditionBadgeProps {
  userId: UUID
}

function ConditionBadgeImpl({ userId }: ConditionBadgeProps) {
  const override = useStore((state) => getUserDMOverride(state.dmOverrides, userId, 'CONDITION'))

  if (!override) return null

  const conditionName =
    (override.parameters?.conditionName as string | undefined) ??
    (override.parameters?.presetName as string | undefined)

  const preset = conditionName ? findConditionPreset(conditionName) : undefined
  const icon = preset?.icon ?? 'psychology'
  const label = preset?.label ?? conditionName ?? 'Condition'

  return (
    <span className="avatar-condition-badge" aria-label={label} role="img">
      <span className="material-symbols-outlined" aria-hidden="true">
        {icon}
      </span>
    </span>
  )
}

export const ConditionBadge = React.memo(ConditionBadgeImpl)
