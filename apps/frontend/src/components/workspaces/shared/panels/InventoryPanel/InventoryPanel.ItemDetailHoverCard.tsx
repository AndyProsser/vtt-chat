/**
 * InventoryPanel.ItemDetailHoverCard
 * Read-only detail card for an inventory item, shown on hover of the item row.
 *
 * Mirrors the PLAYER profile hover-card behaviour: it appears anchored beside
 * the hovered row and vanishes the moment the pointer moves onto it, so it is
 * purely informational and never steals interaction from the row.
 *
 * All values are sourced from DDB/SRD and are NOT editable here — the inventory
 * system complements those tools rather than replacing them. The only editable
 * field (notes) is changed via the row's Edit action, not in this card.
 *
 * SRD/EXTERNAL items: name, type, weight, cost, damage, properties (as pills),
 * description, notes. CUSTOM items: name + notes only.
 *
 * See docs/subsystems/INVENTORY-SYSTEM.md §5.7
 */

import { memo, useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { InventoryItemSource } from '@shared'
import type { InventoryItem } from '@/types/inventory'

interface InventoryItemDetailHoverCardProps {
  item: InventoryItem
  children: React.ReactNode
}

interface AnchorRect {
  top: number
  bottom: number
  left: number
  right: number
}

const CARD_WIDTH = 300
const EDGE_PADDING = 8
const CARD_GAP = 8
/** Approximate card height used only to decide above/below placement. */
const ESTIMATED_CARD_HEIGHT = 220
/** Small grace period on leave so a flick past the row edge doesn't flicker. */
const CLOSE_DELAY_MS = 90

/**
 * Computes a fixed-position style for the card. It drops DOWN from the row,
 * left-aligned to the hovered info area (i.e. just right of the quantity value),
 * and clamps to the viewport — flipping upward only when there's no room below.
 */
function computeCardStyle(anchor: AnchorRect): React.CSSProperties {
  // Left-align under the info area; clamp so the card never runs off-screen.
  const left = Math.max(
    EDGE_PADDING,
    Math.min(anchor.left, window.innerWidth - CARD_WIDTH - EDGE_PADDING)
  )

  const fitsBelow =
    anchor.bottom + CARD_GAP + ESTIMATED_CARD_HEIGHT <= window.innerHeight - EDGE_PADDING
  const top = fitsBelow
    ? anchor.bottom + CARD_GAP
    : Math.max(EDGE_PADDING, anchor.top - ESTIMATED_CARD_HEIGHT - CARD_GAP)

  return {
    position: 'fixed',
    zIndex: 1200,
    width: CARD_WIDTH,
    left,
    top,
  }
}

export const InventoryItemDetailHoverCard = memo(function InventoryItemDetailHoverCard({
  item,
  children,
}: InventoryItemDetailHoverCardProps) {
  const [anchor, setAnchor] = useState<AnchorRect | null>(null)
  const closeTimerRef = useRef<number | null>(null)

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const close = useCallback(() => {
    clearCloseTimer()
    setAnchor(null)
  }, [clearCloseTimer])

  const handleAnchorEnter = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      clearCloseTimer()
      const rect = event.currentTarget.getBoundingClientRect()
      setAnchor({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right })
    },
    [clearCloseTimer]
  )

  const handleAnchorLeave = useCallback(() => {
    clearCloseTimer()
    closeTimerRef.current = window.setTimeout(() => {
      setAnchor(null)
      closeTimerRef.current = null
    }, CLOSE_DELAY_MS)
  }, [clearCloseTimer])

  const meta = item.metadata
  const hasExtended = item.source !== InventoryItemSource.CUSTOM && !!meta

  // Single-line summary: "Type (Subtype) · weight · cost".
  // "Other Gear" is a generic DDB bucket — show the meaningful subtype instead.
  const typeLabel = (() => {
    if (!meta?.itemType) return meta?.itemSubtype ?? null
    if (meta.itemType === 'Other Gear') return meta.itemSubtype ?? meta.itemType
    return meta.itemSubtype ? `${meta.itemType} (${meta.itemSubtype})` : meta.itemType
  })()
  const summary = [
    typeLabel,
    meta?.weight != null ? `${meta.weight} lb` : null,
    meta?.costGp != null
      ? `${meta.costGp % 1 === 0 ? meta.costGp : meta.costGp.toFixed(2)} gp`
      : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      <span
        className="inventory-item-detail-anchor"
        onMouseEnter={handleAnchorEnter}
        onMouseLeave={handleAnchorLeave}
      >
        {children}
      </span>

      {anchor &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="inventory-item-detail-card"
            style={computeCardStyle(anchor)}
            // Vanish the instant the pointer reaches the card — read-only, like player cards.
            onMouseEnter={close}
          >
            {/* Header */}
            <div className="inventory-item-detail__header">
              <span className="inventory-item-detail__name">{item.name}</span>
              {summary && <span className="inventory-item-detail__type">{summary}</span>}
            </div>

            {hasExtended && (
              <>
                {(meta?.damage || (meta?.properties && meta.properties.length > 0)) && (
                  <div className="inventory-item-detail__divider" />
                )}

                {meta?.damage && (
                  <div className="inventory-item-detail__stat-row">
                    <span className="inventory-item-detail__stat-label">Damage</span>
                    <span className="inventory-item-detail__stat-value">{meta.damage}</span>
                  </div>
                )}

                {meta?.properties && meta.properties.length > 0 && (
                  <div className="inventory-item-detail__pills" aria-label="Properties">
                    {meta.properties.map((prop) => (
                      <span key={prop} className="inventory-item-detail__pill">
                        {prop}
                      </span>
                    ))}
                  </div>
                )}

                {meta?.description && (
                  <>
                    <div className="inventory-item-detail__divider" />
                    <p className="inventory-item-detail__description">{meta.description}</p>
                  </>
                )}
              </>
            )}

            {/* Notes — read-only here; edited via the row's Edit action */}
            <div className="inventory-item-detail__divider" />
            <div className="inventory-item-detail__notes-section">
              <span className="inventory-item-detail__notes-label">Notes</span>
              <p className="inventory-item-detail__notes-readonly">
                {item.notes || <em>No notes.</em>}
              </p>
            </div>
          </div>,
          document.body
        )}
    </>
  )
})
