import * as ContextMenu from '@radix-ui/react-context-menu'
import type { ReactNode } from 'react'
import { PlayerContextMenuContent } from './PlayerContextMenuContent'

interface PlayerContextMenuProps {
  enabled: boolean
  canManageRooms: boolean
  isGreenroom?: boolean
  memberIsMuted: boolean
  distanceTargets: string[]
  conditionTargets: string[]
  onDistanceSelect?: (distanceName: string) => void
  onToggleMute?: (nextMuted: boolean) => void
  onClearEffects?: () => void
  onConditionSelect?: (conditionName: string) => void
  onKick?: () => void
  onBan?: () => void
  children: ReactNode
}

export function PlayerContextMenu({
  enabled,
  canManageRooms,
  isGreenroom = false,
  memberIsMuted,
  distanceTargets,
  conditionTargets,
  onDistanceSelect,
  onToggleMute,
  onClearEffects,
  onConditionSelect,
  onKick,
  onBan,
  children,
}: PlayerContextMenuProps) {
  if (!enabled) {
    return <>{children}</>
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <PlayerContextMenuContent
        canManageRooms={canManageRooms}
        isGreenroom={isGreenroom}
        memberIsMuted={memberIsMuted}
        distanceTargets={distanceTargets}
        conditionTargets={conditionTargets}
        onDistanceSelect={onDistanceSelect}
        onToggleMute={onToggleMute}
        onClearEffects={onClearEffects}
        onConditionSelect={onConditionSelect}
        onKick={onKick}
        onBan={onBan}
      />
    </ContextMenu.Root>
  )
}
