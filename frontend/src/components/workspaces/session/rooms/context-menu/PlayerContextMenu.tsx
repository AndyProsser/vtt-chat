import * as ContextMenu from '@radix-ui/react-context-menu'
import type { UUID } from '@shared'
import type { ReactNode } from 'react'
import { PlayerContextMenuContent } from './PlayerContextMenuContent'

interface PlayerContextMenuProps {
  enabled: boolean
  canManageRooms: boolean
  isGreenroom?: boolean
  sessionId: UUID
  userId: UUID
  isSelf: boolean
  distanceTargets: string[]
  conditionTargets: string[]
  onDistanceSelect?: (distanceName: string) => void
  onToggleMute?: (nextMuted: boolean) => void
  onClearEffects?: () => void
  onConditionSelect?: (conditionName: string) => void
  onAudioAdjust?: (
    overrideType: 'GAIN' | 'FILTER',
    parameters: Record<string, unknown> | null
  ) => void
  canTakeOver?: boolean
  isTakeoverActive?: boolean
  onTakeOver?: () => void
  onKick?: () => void
  onBan?: () => void
  children: ReactNode
}

export function PlayerContextMenu({
  enabled,
  canManageRooms,
  isGreenroom = false,
  sessionId,
  userId,
  isSelf,
  distanceTargets,
  conditionTargets,
  onDistanceSelect,
  onToggleMute,
  onClearEffects,
  onConditionSelect,
  onAudioAdjust,
  canTakeOver = false,
  isTakeoverActive = false,
  onTakeOver,
  onKick,
  onBan,
  children,
}: PlayerContextMenuProps) {
  if (!enabled || (!canManageRooms && !canTakeOver)) {
    return <>{children}</>
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <PlayerContextMenuContent
        canManageRooms={canManageRooms}
        isGreenroom={isGreenroom}
        sessionId={sessionId}
        userId={userId}
        isSelf={isSelf}
        distanceTargets={distanceTargets}
        conditionTargets={conditionTargets}
        onDistanceSelect={onDistanceSelect}
        onToggleMute={onToggleMute}
        onClearEffects={onClearEffects}
        onConditionSelect={onConditionSelect}
        onAudioAdjust={onAudioAdjust}
        canTakeOver={canTakeOver}
        isTakeoverActive={isTakeoverActive}
        onTakeOver={onTakeOver}
        onKick={onKick}
        onBan={onBan}
      />
    </ContextMenu.Root>
  )
}
