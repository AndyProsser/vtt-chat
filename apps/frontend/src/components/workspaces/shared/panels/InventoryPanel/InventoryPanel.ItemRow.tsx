import { memo, useState, useRef, useEffect } from 'react'
import { InventoryItemCategory } from '@shared'
import type { UUID } from '@shared'
import { Icon } from '@/components/ui/Icon'
import type { InventoryItem } from '@/types/inventory'
import { InventoryItemDetailPopover } from './InventoryPanel.ItemDetailPopover'

interface MoveTarget {
  label: string
  ownerType: 'party' | 'character'
  ownerId: UUID | null
  avatarUrl?: string | null
  isOnline?: boolean
}

interface InventoryItemRowProps {
  item: InventoryItem
  isReadOnly: boolean
  /** When false, Remove is hidden (DM viewing offline player's inventory). */
  canRemove?: boolean
  /** Verb shown on the transfer action: "Move" (DM), "Take" (player←party), "Give" (player→others). */
  moveActionLabel?: string
  onRemove: (itemId: UUID) => Promise<void>
  onEdit: (
    itemId: UUID,
    updates: { name?: string; quantity?: number; notes?: string | null }
  ) => Promise<void>
  onMove: (
    itemId: UUID,
    toOwnerType: 'party' | 'character',
    toOwnerId: UUID | null
  ) => Promise<void>
  onSaveNotes: (itemId: UUID, notes: string | null) => Promise<void>
  onSetContainer: (itemId: UUID, containerId: UUID | null) => Promise<void>
  moveTargets: MoveTarget[]
  /** Other containers owned by the same owner — for "Put in container" sub-menu. */
  availableContainers?: InventoryItem[]
  /** True when item is rendered inside a ContainerSection (shows "Remove from container"). */
  isInsideContainer?: boolean
  /** Drag-and-drop: called when drag starts on this row. */
  onDragItemStart?: (itemId: UUID) => void
  /** Drag-and-drop: called when drag ends (drop or cancel). */
  onDragItemEnd?: () => void
  /** Whether this item is currently being dragged (applies dim style). */
  isDragging?: boolean
}

type RowMode = 'view' | 'edit' | 'confirm-remove' | 'move' | 'container-select'

export const InventoryItemRow = memo(function InventoryItemRow({
  item,
  isReadOnly,
  canRemove = true,
  moveActionLabel = 'Move',
  onRemove,
  onEdit,
  onMove,
  onSaveNotes,
  onSetContainer,
  moveTargets,
  availableContainers = [],
  isInsideContainer = false,
  onDragItemStart,
  onDragItemEnd,
  isDragging = false,
}: InventoryItemRowProps) {
  const [mode, setMode] = useState<RowMode>('view')
  const [editName, setEditName] = useState(item.name)
  const [editQty, setEditQty] = useState(item.quantity)
  const [editNotes, setEditNotes] = useState(item.notes ?? '')
  const [isBusy, setIsBusy] = useState(false)
  const editNameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (mode === 'view') {
      setEditName(item.name)
      setEditQty(item.quantity)
      setEditNotes(item.notes ?? '')
    }
  }, [item.name, item.quantity, item.notes, mode])

  useEffect(() => {
    if (mode === 'edit') editNameRef.current?.focus()
  }, [mode])

  async function handleRemove() {
    if (isBusy) return
    setIsBusy(true)
    try {
      await onRemove(item.id)
    } finally {
      setIsBusy(false)
      setMode('view')
    }
  }

  async function handleSaveEdit() {
    if (isBusy) return
    setIsBusy(true)
    try {
      await onEdit(item.id, {
        name: editName.trim() || item.name,
        quantity: Math.max(1, editQty),
        notes: editNotes.trim() || null,
      })
      setMode('view')
    } finally {
      setIsBusy(false)
    }
  }

  async function handleMove(target: MoveTarget) {
    if (isBusy) return
    setIsBusy(true)
    try {
      await onMove(item.id, target.ownerType, target.ownerId)
      setMode('view')
    } finally {
      setIsBusy(false)
    }
  }

  async function handleSetContainer(containerId: UUID | null) {
    if (isBusy) return
    setIsBusy(true)
    try {
      await onSetContainer(item.id, containerId)
      setMode('view')
    } finally {
      setIsBusy(false)
    }
  }

  // ─── Edit mode ────────────────────────────────────────────────────────────
  if (mode === 'edit') {
    return (
      <li className="inventory-item-row inventory-item-row--edit">
        <div className="inventory-item-row__edit-fields">
          <input
            ref={editNameRef}
            className="inventory-item-row__edit-name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            maxLength={100}
            aria-label="Item name"
          />
          <input
            className="inventory-item-row__edit-qty"
            type="number"
            min={1}
            max={9999}
            value={editQty}
            onChange={(e) => setEditQty(Math.max(1, Number(e.target.value)))}
            aria-label="Quantity"
          />
        </div>
        <input
          className="inventory-item-row__edit-notes"
          placeholder="Notes (optional)"
          value={editNotes}
          onChange={(e) => setEditNotes(e.target.value)}
          maxLength={200}
          aria-label="Item notes"
        />
        <div className="inventory-item-row__edit-actions">
          <button
            type="button"
            className="inventory-item-row__action-btn inventory-item-row__action-btn--primary"
            onClick={handleSaveEdit}
            disabled={isBusy}
          >
            Save
          </button>
          <button
            type="button"
            className="inventory-item-row__action-btn"
            onClick={() => setMode('view')}
          >
            Cancel
          </button>
        </div>
      </li>
    )
  }

  // ─── Confirm-remove mode ─────────────────────────────────────────────────
  if (mode === 'confirm-remove') {
    return (
      <li className="inventory-item-row inventory-item-row--danger">
        <span className="inventory-item-row__name">Remove {item.name}?</span>
        <div className="inventory-item-row__edit-actions">
          <button
            type="button"
            className="inventory-item-row__action-btn inventory-item-row__action-btn--danger"
            onClick={handleRemove}
            disabled={isBusy}
          >
            Remove
          </button>
          <button
            type="button"
            className="inventory-item-row__action-btn"
            onClick={() => setMode('view')}
          >
            Cancel
          </button>
        </div>
      </li>
    )
  }

  // ─── Move mode ────────────────────────────────────────────────────────────
  if (mode === 'move') {
    return (
      <li className="inventory-item-row inventory-item-row--move">
        <span className="inventory-item-row__move-title">{moveActionLabel} {item.name} to:</span>
        <div className="inventory-item-row__move-grid" role="listbox" aria-label="Move destination">
          {moveTargets.map((t) => {
            const avatarContent =
              t.ownerType === 'party' ? (
                <Icon name="party" />
              ) : t.avatarUrl ? (
                <img src={t.avatarUrl} alt="" />
              ) : (
                (t.label.trim()[0] ?? '?').toUpperCase()
              )
            return (
              <button
                key={`${t.ownerType}-${t.ownerId}`}
                type="button"
                role="option"
                aria-selected={false}
                className={[
                  'inventory-item-row__move-card',
                  t.ownerType === 'party' ? ' inventory-item-row__move-card--party' : '',
                  !t.isOnline ? 'inventory-item-row__move-card--offline' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => handleMove(t)}
                disabled={isBusy}
              >
                <span className="inventory-item-row__move-card-avatar" aria-hidden="true">
                  {avatarContent}
                </span>
                <span className="inventory-item-row__move-card-name">{t.label}</span>
              </button>
            )
          })}
        </div>
        <button
          type="button"
          className="inventory-item-row__action-btn"
          onClick={() => setMode('view')}
        >
          Cancel
        </button>
      </li>
    )
  }

  // ─── Container-select mode ───────────────────────────────────────────────
  if (mode === 'container-select') {
    return (
      <li className="inventory-item-row inventory-item-row--move">
        <span className="inventory-item-row__move-title">Put {item.name} in:</span>
        <div className="inventory-item-row__move-grid" role="listbox" aria-label="Select container">
          {availableContainers.map((c) => (
            <button
              key={c.id}
              type="button"
              role="option"
              aria-selected={false}
              className="inventory-item-row__move-card"
              onClick={() => handleSetContainer(c.id as UUID)}
              disabled={isBusy}
            >
              <span className="inventory-item-row__move-card-avatar" aria-hidden="true">
                <Icon name="inventory" />
              </span>
              <span className="inventory-item-row__move-card-name">{c.name}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="inventory-item-row__action-btn"
          onClick={() => setMode('view')}
        >
          Cancel
        </button>
      </li>
    )
  }

  // ─── View mode ────────────────────────────────────────────────────────────
  const isMagic = item.srdCategory === InventoryItemCategory.MAGIC_ITEM
  const isHomebrew = item.srdCategory === InventoryItemCategory.HOMEBREW
  const meta = item.metadata
  const isDraggable = !isReadOnly && !item.isContainer && mode === 'view'

  return (
    <li
      className={[
        'inventory-item-row',
        isMagic ? 'inventory-item-row--magic' : '',
        isHomebrew ? 'inventory-item-row--homebrew' : '',
        isDragging ? 'inventory-item-row--dragging' : '',
        isDraggable ? 'inventory-item-row--draggable' : '',
      ].filter(Boolean).join(' ')}
      draggable={isDraggable}
      onDragStart={isDraggable ? (e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', item.id)
        onDragItemStart?.(item.id as UUID)
      } : undefined}
      onDragEnd={isDraggable ? () => onDragItemEnd?.() : undefined}
    >
      <span className="inventory-item-row__qty" aria-label={`Quantity: ${item.quantity}`}>
        ×{item.quantity}
      </span>

      {/* Clicking the name/info area opens the detail popover */}
      <InventoryItemDetailPopover item={item} isReadOnly={isReadOnly} onSaveNotes={onSaveNotes}>
        <button type="button" className="inventory-item-row__info inventory-item-row__info--trigger">
          <span className="inventory-item-row__name">
            {item.name}
            {isMagic && (
              <span className="inventory-item-row__magic-badge" aria-label="Magic item">✦</span>
            )}
            {isHomebrew && (
              <span className="inventory-item-row__homebrew-badge" aria-label="Homebrew">⚗</span>
            )}
          </span>
          {(meta?.itemType || meta?.weight != null) && (
            <span className="inventory-item-row__meta">
              {[meta?.itemType, meta?.weight != null ? `${meta.weight} lb` : null]
                .filter(Boolean)
                .join(' · ')}
            </span>
          )}
          {item.notes && <span className="inventory-item-row__notes">{item.notes}</span>}
        </button>
      </InventoryItemDetailPopover>

      {meta?.costGp != null && (
        <span className="inventory-item-row__cost" aria-label={`Cost: ${meta.costGp} gp`}>
          {meta.costGp % 1 === 0 ? meta.costGp : meta.costGp.toFixed(1)} gp
        </span>
      )}

      {!isReadOnly && (
        <div className="inventory-item-row__actions">
          <button
            type="button"
            className="inventory-item-row__action-icon"
            aria-label="Edit item"
            title="Edit"
            onClick={() => setMode('edit')}
          >
            <Icon name="edit" />
          </button>

          {/* Put in container / Remove from container */}
          {!item.isContainer && (
            isInsideContainer ? (
              <button
                type="button"
                className="inventory-item-row__action-icon"
                aria-label="Remove from container"
                title="Remove from container"
                onClick={() => handleSetContainer(null)}
                disabled={isBusy}
              >
                <Icon name="subdirectory_arrow_left" />
              </button>
            ) : availableContainers.length > 0 ? (
              <button
                type="button"
                className="inventory-item-row__action-icon"
                aria-label="Put in container"
                title="Put in container"
                onClick={() => setMode('container-select')}
              >
                <Icon name="inventory" />
              </button>
            ) : null
          )}

          {moveTargets.length > 0 && (
            <button
              type="button"
              className="inventory-item-row__action-icon"
              aria-label={`${moveActionLabel} item`}
              title={moveActionLabel}
              onClick={() => setMode('move')}
            >
              <Icon name="move_item" />
            </button>
          )}
          {canRemove && (
            <button
              type="button"
              className="inventory-item-row__action-icon inventory-item-row__action-icon--danger"
              aria-label={`Remove ${item.name}`}
              title="Remove"
              onClick={() => setMode('confirm-remove')}
            >
              <Icon name="close" />
            </button>
          )}
        </div>
      )}
    </li>
  )
})
