import { memo } from 'react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import type { UUID } from '@shared'
import { useIsUserMuted } from '@/hooks/useIsUserMuted'

interface PlayerContextMenuContentProps {
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
  /**
   * DM remote audio adjustment: GAIN or FILTER override.
   * parameters=null means remove the override; non-null means apply.
   */
  onAudioAdjust?: (
    overrideType: 'GAIN' | 'FILTER',
    parameters: Record<string, unknown> | null
  ) => void
  canTakeOver?: boolean
  isTakeoverActive?: boolean
  onTakeOver?: () => void
  onKick?: () => void
  onBan?: () => void
}

interface MuteContextMenuItemProps {
  sessionId: UUID
  userId: UUID
  isSelf: boolean
  onToggleMute?: (nextMuted: boolean) => void
}

const MuteContextMenuItem = memo(function MuteContextMenuItem({
  sessionId,
  userId,
  isSelf,
  onToggleMute,
}: MuteContextMenuItemProps) {
  const memberIsMuted = useIsUserMuted(sessionId, userId, isSelf)

  return (
    <ContextMenu.Item
      className="room-context-menu__item"
      disabled={!onToggleMute}
      onSelect={() => onToggleMute?.(!memberIsMuted)}
    >
      {memberIsMuted ? 'Unmute' : 'Mute'}
    </ContextMenu.Item>
  )
})

export function PlayerContextMenuContent({
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
            <MuteContextMenuItem
              sessionId={sessionId}
              userId={userId}
              isSelf={isSelf}
              onToggleMute={onToggleMute}
            />

            {!isGreenroom ? (
              <>
                <ContextMenu.Sub>
                  <ContextMenu.SubTrigger className="room-context-menu__item">
                    Adjust Audio
                    <span aria-hidden>›</span>
                  </ContextMenu.SubTrigger>
                  <ContextMenu.Portal>
                    <ContextMenu.SubContent className="room-context-menu room-context-menu--sub">
                      <ContextMenu.Item
                        className="room-context-menu__item"
                        disabled={!onAudioAdjust}
                        onSelect={() => onAudioAdjust?.('GAIN', { factor: 1.5 })}
                      >
                        Boost Mic
                      </ContextMenu.Item>
                      <ContextMenu.Item
                        className="room-context-menu__item"
                        disabled={!onAudioAdjust}
                        onSelect={() => onAudioAdjust?.('GAIN', null)}
                      >
                        Normal Mic
                      </ContextMenu.Item>
                      <ContextMenu.Item
                        className="room-context-menu__item"
                        disabled={!onAudioAdjust}
                        onSelect={() => onAudioAdjust?.('GAIN', { factor: 0.5 })}
                      >
                        Lower Mic
                      </ContextMenu.Item>
                      <ContextMenu.Separator className="room-context-menu__separator" />
                      <ContextMenu.Item
                        className="room-context-menu__item"
                        disabled={!onAudioAdjust}
                        onSelect={() => onAudioAdjust?.('FILTER', { enabled: true })}
                      >
                        Enable Noise Filter
                      </ContextMenu.Item>
                      <ContextMenu.Item
                        className="room-context-menu__item"
                        disabled={!onAudioAdjust}
                        onSelect={() => onAudioAdjust?.('FILTER', null)}
                      >
                        Disable Noise Filter
                      </ContextMenu.Item>
                    </ContextMenu.SubContent>
                  </ContextMenu.Portal>
                </ContextMenu.Sub>

                <ContextMenu.Separator className="room-context-menu__separator" />

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

            <ContextMenu.Separator className="room-context-menu__separator" />

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
