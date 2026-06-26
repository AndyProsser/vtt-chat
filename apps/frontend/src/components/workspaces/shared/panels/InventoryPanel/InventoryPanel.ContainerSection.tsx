/**
 * InventoryPanel.ContainerSection
 * Collapsible section that groups items inside a container.
 * The container item itself acts as the section header; its contents appear below.
 *
 * Renders the container row (with its own actions) and, when expanded,
 * all items whose containerId === container.id.
 */

import { memo, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import type { InventoryItem } from '@/types/inventory'
import type { UUID } from '@shared'
import { InventoryItemRow } from './InventoryPanel.ItemRow'

interface MoveTarget {
  label: string
  ownerType: 'party' | 'character'
  ownerId: UUID | null
  avatarUrl?: string | null
  isOnline?: boolean
}

interface ContainerSectionProps {
  container: InventoryItem
  contents: InventoryItem[]
  isReadOnly: boolean
  canRemove?: boolean
  moveActionLabel?: string
  moveTargets: MoveTarget[]
  onRemove: (itemId: UUID) => Promise<void>
  onEdit: (itemId: UUID, updates: { name?: string; quantity?: number; notes?: string | null }) => Promise<void>
  onMove: (itemId: UUID, toOwnerType: 'party' | 'character', toOwnerId: UUID | null) => Promise<void>
  onSaveNotes: (itemId: UUID, notes: string | null) => Promise<void>
  onSetContainer: (itemId: UUID, containerId: UUID | null) => Promise<void>
  /** Other containers in the same owner scope — for "put in container" actions on contents. */
  otherContainers: InventoryItem[]
}

export const ContainerSection = memo(function ContainerSection({
  container,
  contents,
  isReadOnly,
  canRemove = true,
  moveActionLabel = 'Move',
  moveTargets,
  onRemove,
  onEdit,
  onMove,
  onSaveNotes,
  onSetContainer,
  otherContainers,
}: ContainerSectionProps) {
  const [collapsed, setCollapsed] = useState(false)

  const totalWeight = contents.reduce((sum, item) => {
    return sum + (item.metadata?.weight ?? 0) * item.quantity
  }, 0)

  return (
    <li className="inventory-container-section">
      {/* Container header row */}
      <div className="inventory-container-section__header">
        <button
          type="button"
          className="inventory-container-section__toggle"
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Expand ${container.name}` : `Collapse ${container.name}`}
          onClick={() => setCollapsed((v) => !v)}
        >
          <Icon name={collapsed ? 'chevron_right' : 'south'} />
        </button>

        <span className="inventory-container-section__name">
          {container.name}
          <span className="inventory-container-section__count"> ({contents.length})</span>
        </span>

        {totalWeight > 0 && (
          <span className="inventory-container-section__weight">{totalWeight} lb</span>
        )}

        {!isReadOnly && (
          <div className="inventory-container-section__actions">
            {canRemove && (
              <button
                type="button"
                className="inventory-item-row__action-icon inventory-item-row__action-icon--danger"
                aria-label={`Remove ${container.name} and contents`}
                title="Remove container and all contents"
                onClick={() => onRemove(container.id)}
              >
                <Icon name="close" />
              </button>
            )}
            {moveTargets.length > 0 && (
              <button
                type="button"
                className="inventory-item-row__action-icon"
                aria-label={`${moveActionLabel} container`}
                title={`${moveActionLabel} container and contents`}
                onClick={() => onMove(container.id, moveTargets[0].ownerType, moveTargets[0].ownerId)}
              >
                <Icon name="move_item" />
              </button>
            )}
          </div>
        )}
      </div>

      {!collapsed && (
        <ul className="inventory-container-section__contents" aria-label={`Contents of ${container.name}`}>
          {contents.length === 0 ? (
            <li className="inventory-container-section__empty">Empty</li>
          ) : (
            contents.map((item) => (
              <InventoryItemRow
                key={item.id}
                item={item}
                isReadOnly={isReadOnly}
                canRemove={canRemove}
                moveActionLabel={moveActionLabel}
                onRemove={onRemove}
                onEdit={onEdit}
                onMove={onMove}
                onSaveNotes={onSaveNotes}
                onSetContainer={onSetContainer}
                moveTargets={moveTargets.filter(
                  (t) => !(t.ownerType === item.ownerType && t.ownerId === item.ownerId)
                )}
                availableContainers={otherContainers.filter((c) => c.id !== container.id)}
                isInsideContainer
              />
            ))
          )}
        </ul>
      )}
    </li>
  )
})
