import * as ContextMenu from '@radix-ui/react-context-menu'

interface PlayerContextMenuContentProps {
  canManageRooms: boolean
  isGreenroom?: boolean
  memberIsMuted: boolean
  distanceTargets: string[]
  conditionTargets: string[]
  onDistanceSelect?: (distanceName: string) => void
  onToggleMute?: (nextMuted: boolean) => void
  onClearEffects?: () => void
  onConditionSelect?: (conditionName: string) => void
  canTakeOver?: boolean
  isTakeoverActive?: boolean
  onTakeOver?: () => void
  onKick?: () => void
  onBan?: () => void
}

export function PlayerContextMenuContent({
  canManageRooms,
  isGreenroom = false,
  memberIsMuted,
  distanceTargets,
  conditionTargets,
  onDistanceSelect,
  onToggleMute,
  onClearEffects,
  onConditionSelect,
  canTakeOver = false,
  isTakeoverActive = false,
  onTakeOver,
  onKick,
  onBan,
}: PlayerContextMenuContentProps) {
  return (
    <ContextMenu.Portal>
      <ContextMenu.Content className="room-context-menu" collisionPadding={8}>
        {canTakeOver ? (
          <>
            <ContextMenu.Item
              className="room-context-menu__item"
              disabled={!onTakeOver || isTakeoverActive}
              onSelect={() => onTakeOver?.()}
            >
              {isTakeoverActive ? 'Take Over Player (Active)' : 'Take Over Player'}
            </ContextMenu.Item>
            {canManageRooms ? (
              <ContextMenu.Separator className="room-context-menu__separator" />
            ) : null}
          </>
        ) : null}

        {canManageRooms ? (
          <>
            <ContextMenu.Item
              className="room-context-menu__item"
              disabled={!onToggleMute}
              onSelect={() => onToggleMute?.(!memberIsMuted)}
            >
              {memberIsMuted ? 'Unmute' : 'Mute'}
            </ContextMenu.Item>

            {!isGreenroom ? (
              <>
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
                      {distanceTargets.map((distanceOption) => (
                        <ContextMenu.Item
                          key={distanceOption}
                          className="room-context-menu__item"
                          disabled={!onDistanceSelect}
                          onSelect={() => onDistanceSelect?.(distanceOption)}
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
              </>
            ) : null}

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
          </>
        ) : null}
      </ContextMenu.Content>
    </ContextMenu.Portal>
  )
}
