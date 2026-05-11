import * as ContextMenu from '@radix-ui/react-context-menu'
import type { ReactNode } from 'react'
import type { UUID } from '@shared'
import { PlayerContextMenuContent } from './PlayerContextMenuContent'

interface PlayerContextMenuProps {
  enabled: boolean
  canManageRooms: boolean
  memberIsMuted: boolean
  moveTargets: Array<{ id: UUID; label: string }>
  conditionTargets: string[]
  onSendPrivateMessage?: () => void
  onViewProfile?: () => void
  onMoveSelect?: (roomId: UUID) => void
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
  moveTargets,
  conditionTargets,
  onSendPrivateMessage,
  onViewProfile,
  onMoveSelect,
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
        moveTargets={moveTargets}
        conditionTargets={conditionTargets}
        onSendPrivateMessage={onSendPrivateMessage}
        onViewProfile={onViewProfile}
        onMoveSelect={onMoveSelect}
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
