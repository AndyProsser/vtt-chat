import * as ContextMenu from '@radix-ui/react-context-menu'
import type { UUID } from '@shared'

interface PlayerContextMenuContentProps {
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
}

const DISTANCE_OPTIONS = ['Default', 'Nearby', 'Visible', 'Far']

export function PlayerContextMenuContent({
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
}: PlayerContextMenuContentProps) {
  return (
    <ContextMenu.Portal>
      <ContextMenu.Content className="room-context-menu" collisionPadding={8}>
        <ContextMenu.Item
          className="room-context-menu__item"
          disabled={!onSendPrivateMessage}
          onSelect={() => onSendPrivateMessage?.()}
        >
          Send Private Message
        </ContextMenu.Item>
        <ContextMenu.Item
          className="room-context-menu__item"
          disabled={!onViewProfile}
          onSelect={() => onViewProfile?.()}
        >
          View Profile
        </ContextMenu.Item>

        {canManageRooms ? (
          <>
            <ContextMenu.Separator className="room-context-menu__separator" />

            <ContextMenu.Sub>
              <ContextMenu.SubTrigger className="room-context-menu__item">
                Move
                <span aria-hidden>›</span>
              </ContextMenu.SubTrigger>
              <ContextMenu.Portal>
                <ContextMenu.SubContent className="room-context-menu room-context-menu--sub">
                  {moveTargets.length ? (
                    moveTargets.map((room) => (
                      <ContextMenu.Item
                        key={room.id}
                        className="room-context-menu__item"
                        onSelect={() => onMoveSelect?.(room.id)}
                      >
                        {room.label}
                      </ContextMenu.Item>
                    ))
                  ) : (
                    <ContextMenu.Item className="room-context-menu__item" disabled>
                      No eligible groups
                    </ContextMenu.Item>
                  )}
                </ContextMenu.SubContent>
              </ContextMenu.Portal>
            </ContextMenu.Sub>

            <ContextMenu.Item
              className="room-context-menu__item"
              disabled={!onToggleMute}
              onSelect={() => onToggleMute?.(!memberIsMuted)}
            >
              {memberIsMuted ? 'Unmute' : 'Mute'}
            </ContextMenu.Item>

            <ContextMenu.Item
              className="room-context-menu__item"
              disabled={!onClearEffects}
              onSelect={() => onClearEffects?.()}
            >
              Clear Effects
            </ContextMenu.Item>

            <ContextMenu.Sub>
              <ContextMenu.SubTrigger className="room-context-menu__item">
                Distance
                <span aria-hidden>›</span>
              </ContextMenu.SubTrigger>
              <ContextMenu.Portal>
                <ContextMenu.SubContent className="room-context-menu room-context-menu--sub">
                  {DISTANCE_OPTIONS.map((distanceOption) => (
                    <ContextMenu.Item
                      key={distanceOption}
                      className="room-context-menu__item"
                      disabled
                    >
                      {distanceOption}
                    </ContextMenu.Item>
                  ))}
                </ContextMenu.SubContent>
              </ContextMenu.Portal>
            </ContextMenu.Sub>

            <ContextMenu.Sub>
              <ContextMenu.SubTrigger className="room-context-menu__item">
                Condition
                <span aria-hidden>›</span>
              </ContextMenu.SubTrigger>
              <ContextMenu.Portal>
                <ContextMenu.SubContent className="room-context-menu room-context-menu--sub">
                  {conditionTargets.map((conditionName) => (
                    <ContextMenu.Item
                      key={conditionName}
                      className="room-context-menu__item"
                      disabled={!onConditionSelect}
                      onSelect={() => onConditionSelect?.(conditionName)}
                    >
                      {conditionName}
                    </ContextMenu.Item>
                  ))}
                </ContextMenu.SubContent>
              </ContextMenu.Portal>
            </ContextMenu.Sub>

            <ContextMenu.Item
              className="room-context-menu__item"
              disabled={!onKick}
              onSelect={onKick}
            >
              Kick
            </ContextMenu.Item>
            <ContextMenu.Item
              className="room-context-menu__item"
              disabled={!onBan}
              onSelect={onBan}
            >
              Ban
            </ContextMenu.Item>

            <ContextMenu.Separator className="room-context-menu__separator" />
            <ContextMenu.Item
              className="room-context-menu__item"
              disabled={!onToggleDmPrivilege}
              onSelect={onToggleDmPrivilege}
            >
              Grant/Revoke DM Priv.
            </ContextMenu.Item>
          </>
        ) : null}
      </ContextMenu.Content>
    </ContextMenu.Portal>
  )
}
