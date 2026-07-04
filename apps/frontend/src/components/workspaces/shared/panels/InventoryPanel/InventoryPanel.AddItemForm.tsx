import { useState, useRef, useEffect, useCallback } from 'react'
import type { FormEvent } from 'react'
import { InventoryItemCategory } from '@shared'

interface SrdResult {
  index: string
  name: string
  category: InventoryItemCategory
}

interface InventoryAddItemFormProps {
  onAdd: (
    name: string,
    quantity: number,
    notes: string,
    srdCategory: InventoryItemCategory,
    srdKey?: string
  ) => Promise<void>
  onCancel: () => void
  apiUrl: string
  authToken: string
  ruleset?: '2014' | '2024'
}

const CATEGORY_LABELS: Record<InventoryItemCategory, string> = {
  [InventoryItemCategory.EQUIPMENT]: 'Equipment',
  [InventoryItemCategory.MAGIC_ITEM]: 'Magic',
  [InventoryItemCategory.HOMEBREW]: 'Homebrew',
}

export function InventoryAddItemForm({
  onAdd,
  onCancel,
  apiUrl,
  authToken,
  ruleset = '2024',
}: InventoryAddItemFormProps) {
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [category, setCategory] = useState<InventoryItemCategory>(InventoryItemCategory.EQUIPMENT)
  const [selectedSrdKey, setSelectedSrdKey] = useState<string | undefined>(undefined)
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
          const headers = { Authorization: `Bearer ${authToken}` }
          const qs = `q=${encodeURIComponent(query)}&ruleset=${ruleset}`
          const [equipRes, magicRes] = await Promise.allSettled([
            fetch(`${apiUrl}/api/srd/items?${qs}`, { headers }),
            fetch(`${apiUrl}/api/srd/magic-items?${qs}`, { headers }),
          ])

          const equipItems: SrdResult[] =
            equipRes.status === 'fulfilled' && equipRes.value.ok
              ? (
                  (await equipRes.value.json()) as { results: { index: string; name: string }[] }
                ).results.map((r) => ({ ...r, category: InventoryItemCategory.EQUIPMENT }))
              : []

          const magicItems: SrdResult[] =
            magicRes.status === 'fulfilled' && magicRes.value.ok
              ? (
                  (await magicRes.value.json()) as { results: { index: string; name: string }[] }
                ).results.map((r) => ({ ...r, category: InventoryItemCategory.MAGIC_ITEM }))
              : []

          const combined = [...magicItems, ...equipItems]
          setSuggestions(combined)
          setShowSuggestions(combined.length > 0)
        } catch {
          // Fail silently — SRD search is a nice-to-have
        }
      }, 280)
    },
    [apiUrl, authToken, ruleset]
  )

  function handleNameChange(value: string) {
    setName(value)
    setSelectedSrdKey(undefined)
    searchSrd(value)
  }

  function selectSuggestion(item: SrdResult) {
    setName(item.name)
    setCategory(item.category)
    setSelectedSrdKey(item.index)
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
      await onAdd(name.trim(), quantity, notes.trim(), category, selectedSrdKey)
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
                  key={`${item.category}:${item.index}`}
                  role="option"
                  aria-selected={name === item.name && selectedSrdKey === item.index}
                  className="inventory-add-form__suggestion"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    selectSuggestion(item)
                  }}
                >
                  <span className="inventory-add-form__suggestion-name">{item.name}</span>
                  {item.category === InventoryItemCategory.MAGIC_ITEM && (
                    <span className="inventory-add-form__suggestion-tag inventory-add-form__suggestion-tag--magic">
                      Magic
                    </span>
                  )}
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

      {/* Category chips — auto-set by SRD pick; editable for custom items */}
      <div className="inventory-add-form__category-row" role="group" aria-label="Item category">
        {(Object.values(InventoryItemCategory) as InventoryItemCategory[]).map((cat) => (
          <button
            key={cat}
            type="button"
            className={`inventory-add-form__category-chip${category === cat ? ' inventory-add-form__category-chip--active' : ''}`}
            data-category={cat}
            aria-pressed={category === cat}
            onClick={() => setCategory(cat)}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
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
        <button
          type="submit"
          className="inventory-add-form__save"
          disabled={isSaving || !name.trim()}
        >
          {isSaving ? 'Adding…' : 'Add item'}
        </button>
        <button type="button" className="inventory-add-form__cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
