import { useState, useRef, useEffect, useCallback } from 'react'
import type { FormEvent } from 'react'

interface SrdResult {
  index: string
  name: string
}

interface InventoryAddItemFormProps {
  onAdd: (name: string, quantity: number, notes: string, isSrd: boolean) => Promise<void>
  onCancel: () => void
  apiUrl: string
  authToken: string
}

export function InventoryAddItemForm({ onAdd, onCancel, apiUrl, authToken }: InventoryAddItemFormProps) {
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isSrd, setIsSrd] = useState(false)
  const [suggestions, setSuggestions] = useState<SrdResult[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const searchSrd = useCallback(
    (query: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (query.trim().length < 2) {
        setSuggestions([])
        setShowSuggestions(false)
        return
      }
      debounceRef.current = setTimeout(async () => {
        try {
          const res = await fetch(
            `${apiUrl}/api/srd/items?q=${encodeURIComponent(query)}`,
            { headers: { Authorization: `Bearer ${authToken}` } }
          )
          if (!res.ok) return
          const data = (await res.json()) as { results: SrdResult[] }
          setSuggestions(data.results)
          setShowSuggestions(data.results.length > 0)
        } catch {
          // Fail silently — SRD search is a nice-to-have
        }
      }, 280)
    },
    [apiUrl, authToken]
  )

  function handleNameChange(value: string) {
    setName(value)
    setIsSrd(false)
    searchSrd(value)
  }

  function selectSuggestion(item: SrdResult) {
    setName(item.name)
    setIsSrd(true)
    setSuggestions([])
    setShowSuggestions(false)
  }

  // Dismiss dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || isSaving) return
    setIsSaving(true)
    try {
      await onAdd(name.trim(), quantity, notes.trim(), isSrd)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form className="inventory-add-form" onSubmit={handleSubmit} aria-label="Add item">
      <div className="inventory-add-form__row" ref={containerRef}>
        <div className="inventory-add-form__name-wrap">
          <input
            className="inventory-add-form__name"
            type="text"
            placeholder="Item name"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            required
            autoFocus
            maxLength={100}
            aria-label="Item name"
            aria-autocomplete="list"
            aria-expanded={showSuggestions}
          />
          {showSuggestions && (
            <ul className="inventory-add-form__suggestions" role="listbox">
              {suggestions.map((item) => (
                <li
                  key={item.index}
                  role="option"
                  aria-selected={name === item.name}
                  className="inventory-add-form__suggestion"
                  onMouseDown={(e) => { e.preventDefault(); selectSuggestion(item) }}
                >
                  {item.name}
                </li>
              ))}
            </ul>
          )}
        </div>
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
