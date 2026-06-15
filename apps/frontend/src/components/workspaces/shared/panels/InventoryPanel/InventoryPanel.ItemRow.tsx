import { memo, useState } from 'react'
import type { UUID } from '@shared'
import { Icon } from '@/components/ui/Icon'
import type { InventoryItem } from '@/types/inventory'

interface InventoryItemRowProps {
  item: InventoryItem
  isReadOnly: boolean
  onRemove: (itemId: UUID) => Promise<void>
  apiUrl: string
  authToken: string
  campaignId: UUID
  sessionId: UUID
}

export const InventoryItemRow = memo(function InventoryItemRow({
  item,
  isReadOnly,
  onRemove,
}: InventoryItemRowProps) {
  const [isRemoving, setIsRemoving] = useState(false)

  async function handleRemove() {
    if (isRemoving) return
    setIsRemoving(true)
    try {
      await onRemove(item.id)
    } finally {
      setIsRemoving(false)
    }
  }

  return (
    <li className="inventory-item-row">
      <span className="inventory-item-row__qty" aria-label={`Quantity: ${item.quantity}`}>
        ×{item.quantity}
      </span>
      <span className="inventory-item-row__name">{item.name}</span>
      {item.notes && (
        <span className="inventory-item-row__notes" title={item.notes}>
          {item.notes}
        </span>
      )}
      {!isReadOnly && (
        <button
          type="button"
          className="inventory-item-row__remove"
          aria-label={`Remove ${item.name}`}
          disabled={isRemoving}
          onClick={handleRemove}
        >
          <Icon name="close" />
        </button>
      )}
    </li>
  )
})
