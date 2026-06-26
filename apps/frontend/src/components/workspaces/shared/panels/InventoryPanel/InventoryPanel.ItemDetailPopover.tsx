/**
 * InventoryPanel.ItemDetailPopover
 * Radix Popover showing the full detail card for an inventory item.
 * Opens on click of the item name/info area (outside the action buttons).
 *
 * SRD/EXTERNAL items: shows damage, properties, description, weight, cost, notes.
 * CUSTOM items: notes only (no SRD data to show).
 *
 * See docs/subsystems/INVENTORY-SYSTEM.md §5.7
 */

import { useState, memo } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { InventoryItemSource } from '@shared'
import type { UUID } from '@shared'
import { Icon } from '@/components/ui/Icon'
import type { InventoryItem } from '@/types/inventory'

interface InventoryItemDetailPopoverProps {
  item: InventoryItem
  isReadOnly: boolean
  onSaveNotes: (itemId: UUID, notes: string | null) => Promise<void>
  children: React.ReactNode
}

export const InventoryItemDetailPopover = memo(function InventoryItemDetailPopover({
  item,
  isReadOnly,
  onSaveNotes,
  children,
}: InventoryItemDetailPopoverProps) {
  const [editNotes, setEditNotes] = useState(item.notes ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [open, setOpen] = useState(false)

  // Reset notes field when popover opens so stale edits don't persist
  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) setEditNotes(item.notes ?? '')
  }

  async function handleSave() {
    if (isSaving) return
    setIsSaving(true)
    try {
      await onSaveNotes(item.id, editNotes.trim() || null)
      setOpen(false)
    } finally {
      setIsSaving(false)
    }
  }

  const meta = item.metadata
  const hasExtended = item.source !== InventoryItemSource.CUSTOM && !!meta

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          className="inventory-item-detail-popover"
          side="left"
          align="start"
          sideOffset={8}
          collisionPadding={8}
        >
          {/* Header */}
          <div className="inventory-item-detail__header">
            <span className="inventory-item-detail__name">{item.name}</span>
            {meta?.itemType && (
              <span className="inventory-item-detail__type">
                {meta.itemType}
                {meta?.weight != null && ` · ${meta.weight} lb`}
              </span>
            )}
            <Popover.Close className="inventory-item-detail__close" aria-label="Close">
              <Icon name="close" />
            </Popover.Close>
          </div>

          {hasExtended && (
            <>
              {(meta?.itemSubtype || meta?.costGp != null) && (
                <div className="inventory-item-detail__meta-row">
                  {meta?.itemSubtype && (
                    <span className="inventory-item-detail__subtype">{meta.itemSubtype}</span>
                  )}
                  {meta?.costGp != null && (
                    <span className="inventory-item-detail__cost">
                      Cost: {meta.costGp % 1 === 0 ? meta.costGp : meta.costGp.toFixed(2)} gp
                    </span>
                  )}
                </div>
              )}

              <div className="inventory-item-detail__divider" />

              {meta?.damage && (
                <div className="inventory-item-detail__stat-row">
                  <span className="inventory-item-detail__stat-label">Damage</span>
                  <span className="inventory-item-detail__stat-value">{meta.damage}</span>
                </div>
              )}

              {meta?.properties && meta.properties.length > 0 && (
                <div className="inventory-item-detail__stat-row">
                  <span className="inventory-item-detail__stat-label">Properties</span>
                  <span className="inventory-item-detail__stat-value">
                    {meta.properties.join(', ')}
                  </span>
                </div>
              )}

              {meta?.description && (
                <>
                  <div className="inventory-item-detail__divider" />
                  <p className="inventory-item-detail__description">{meta.description}</p>
                </>
              )}

              <div className="inventory-item-detail__divider" />
            </>
          )}

          {/* Notes — always shown, always editable */}
          <div className="inventory-item-detail__notes-section">
            <label className="inventory-item-detail__notes-label" htmlFor={`notes-${item.id}`}>
              Notes
            </label>
            {isReadOnly ? (
              <p className="inventory-item-detail__notes-readonly">
                {item.notes || <em>No notes.</em>}
              </p>
            ) : (
              <>
                <textarea
                  id={`notes-${item.id}`}
                  className="inventory-item-detail__notes-input"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Add a note…"
                />
                <div className="inventory-item-detail__notes-actions">
                  <button
                    type="button"
                    className="inventory-item-detail__save-btn"
                    onClick={handleSave}
                    disabled={isSaving || editNotes.trim() === (item.notes ?? '')}
                  >
                    Save
                  </button>
                </div>
              </>
            )}
          </div>

          <Popover.Arrow className="inventory-item-detail__arrow" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
})
