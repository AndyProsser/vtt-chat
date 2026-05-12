import * as ContextMenu from '@radix-ui/react-context-menu'
import type { ReactNode } from 'react'
import { PlayerContextMenuContent } from './PlayerContextMenuContent'

interface PlayerContextMenuProps {
  enabled: boolean
  canManageRooms: boolean
  memberIsMuted: boolean
  conditionTargets: string[]
  onToggleMute?: (nextMuted: boolean) => void
  onClearEffects?: () => void
  onConditionSelect?: (conditionName: string) => void
  onKick?: () => void
  onBan?: () => void
  onToggleDmPrivilege?: () => void
  children: ReactNode
}

export function PlayerContextMenu({
  enabled,
  canManageRooms,
  memberIsMuted,
  conditionTargets,
  onToggleMute,
  onClearEffects,
  onConditionSelect,
  onKick,
  onBan,
  onToggleDmPrivilege,
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
        memberIsMuted={memberIsMuted}
        conditionTargets={conditionTargets}
        onToggleMute={onToggleMute}
        onClearEffects={onClearEffects}
        onConditionSelect={onConditionSelect}
        onKick={onKick}
        onBan={onBan}
        onToggleDmPrivilege={onToggleDmPrivilege}
      />
    </ContextMenu.Root>
  )
}
