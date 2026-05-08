import { useEffect, useMemo } from 'react'
import type { UUID } from '@shared'

const RADIAL_SAFE_MARGIN_PX = 12
const RADIAL_ROOT_DIAMETER_PX = 148
const RADIAL_PANEL_WIDTH_PX = 208
const RADIAL_PANEL_MAX_HEIGHT_PX = 288

interface RadialMenuProps {
  x: number
  y: number
  mode: 'root' | 'move' | 'condition'
  moveTargets: Array<{ id: UUID; label: string }>
  conditionTargets: string[]
  currentMuted: boolean
  onMove: () => void
  onCondition: () => void
  onMute: () => void
  onClose: () => void
  onMoveSelect: (roomId: UUID) => void
  onConditionSelect: (conditionName: string) => void
  onBack: () => void
}

export function RadialMenu({
  x,
  y,
  mode,
  moveTargets,
  conditionTargets,
  currentMuted,
  onMove,
  onCondition,
  onMute,
  onClose,
  onMoveSelect,
  onConditionSelect,
  onBack,
}: RadialMenuProps) {
  const rootItems = useMemo(
    () => [
      { key: 'move', label: 'Move', onClick: onMove },
      { key: 'condition', label: 'Condition', onClick: onCondition },
      { key: 'mute', label: currentMuted ? 'Unmute' : 'Mute', onClick: onMute },
      { key: 'close', label: 'Close', onClick: onClose },
    ],
    [currentMuted, onClose, onCondition, onMove, onMute]
  )

  const clampedPosition = useMemo(() => {
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 720

    const menuWidth = mode === 'root' ? RADIAL_ROOT_DIAMETER_PX : RADIAL_PANEL_WIDTH_PX
    const menuHeight =
      mode === 'root'
        ? RADIAL_ROOT_DIAMETER_PX
        : Math.min(RADIAL_PANEL_MAX_HEIGHT_PX, Math.floor(viewportHeight * 0.55))

    const halfWidth = menuWidth / 2
    const halfHeight = menuHeight / 2

    const minX = halfWidth + RADIAL_SAFE_MARGIN_PX
    const maxX = viewportWidth - halfWidth - RADIAL_SAFE_MARGIN_PX
    const minY = halfHeight + RADIAL_SAFE_MARGIN_PX
    const maxY = viewportHeight - halfHeight - RADIAL_SAFE_MARGIN_PX

    return {
      left: Math.min(Math.max(x, minX), maxX),
      top: Math.min(Math.max(y, minY), maxY),
    }
  }, [mode, x, y])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  return (
    <>
      <button
        type="button"
        className="room-radial-backdrop"
        aria-label="Close player actions menu"
        onClick={onClose}
      />

      <div
        className="room-radial-menu"
        style={clampedPosition}
        role="menu"
        aria-label="Player actions"
      >
        {mode === 'root' ? (
          <div className="room-radial-wheel">
            {rootItems.map((item) => (
              <button
                key={item.key}
                type="button"
                className="room-radial-item"
                role="menuitem"
                onClick={item.onClick}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}

        {mode === 'move' ? (
          <div className="room-radial-panel">
            <div className="room-radial-panel__header">
              <strong>Move To</strong>
              <button type="button" onClick={onBack}>
                Back
              </button>
            </div>
            <div className="room-radial-panel__list">
              {moveTargets.length === 0 ? (
                <p>No other groups available.</p>
              ) : (
                moveTargets.map((target) => (
                  <button key={target.id} type="button" onClick={() => onMoveSelect(target.id)}>
                    {target.label}
                  </button>
                ))
              )}
            </div>
          </div>
        ) : null}

        {mode === 'condition' ? (
          <div className="room-radial-panel">
            <div className="room-radial-panel__header">
              <strong>Condition</strong>
              <button type="button" onClick={onBack}>
                Back
              </button>
            </div>
            <div className="room-radial-panel__list">
              {conditionTargets.map((conditionName) => (
                <button
                  key={conditionName}
                  type="button"
                  onClick={() => onConditionSelect(conditionName)}
                >
                  {conditionName}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </>
  )
}
