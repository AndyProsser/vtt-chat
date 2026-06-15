import { useState } from 'react'
import type { FormEvent } from 'react'

interface InventoryAddItemFormProps {
  onAdd: (name: string, quantity: number, notes: string) => Promise<void>
  onCancel: () => void
}

export function InventoryAddItemForm({ onAdd, onCancel }: InventoryAddItemFormProps) {
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || isSaving) return
    setIsSaving(true)
    try {
      await onAdd(name.trim(), quantity, notes.trim())
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form className="inventory-add-form" onSubmit={handleSubmit} aria-label="Add item">
      <div className="inventory-add-form__row">
        <input
          className="inventory-add-form__name"
          type="text"
          placeholder="Item name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
          maxLength={100}
          aria-label="Item name"
        />
        <input
          className="inventory-add-form__qty"
          type="number"
          min={1}
          max={9999}
          value={quantity}
          onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
          aria-label="Quantity"
        />
      </div>
      <input
        className="inventory-add-form__notes"
        type="text"
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        maxLength={200}
        aria-label="Item notes"
      />
      <div className="inventory-add-form__actions">
        <button type="submit" className="inventory-add-form__save" disabled={isSaving || !name.trim()}>
          {isSaving ? 'Adding…' : 'Add item'}
        </button>
        <button type="button" className="inventory-add-form__cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
