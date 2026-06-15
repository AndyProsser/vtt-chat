import { memo, useState, useRef, useEffect } from 'react'
import type { UUID } from '@shared'
import { Icon } from '@/components/ui/Icon'
import type { InventoryItem } from '@/types/inventory'

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
  moveTargets: MoveTarget[]
}

type RowMode = 'view' | 'edit' | 'confirm-remove' | 'move'

export const InventoryItemRow = memo(function InventoryItemRow({
  item,
  isReadOnly,
  canRemove = true,
  moveActionLabel = 'Move',
  onRemove,
  onEdit,
  onMove,
  moveTargets,
}: InventoryItemRowProps) {
  const [mode, setMode] = useState<RowMode>('view')
  const [editName, setEditName] = useState(item.name)
  const [editQty, setEditQty] = useState(item.quantity)
  const [editNotes, setEditNotes] = useState(item.notes ?? '')
  const [isBusy, setIsBusy] = useState(false)
  const editNameRef = useRef<HTMLInputElement>(null)

  // Keep edit state in sync if item changes externally
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

  return (
    <li className="inventory-item-row">
      <span className="inventory-item-row__qty" aria-label={`Quantity: ${item.quantity}`}>
        ×{item.quantity}
      </span>
      <div className="inventory-item-row__info">
        <span className="inventory-item-row__name">{item.name}</span>
        {item.notes && <span className="inventory-item-row__notes">{item.notes}</span>}
      </div>
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
