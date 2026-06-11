import { useCallback, useMemo, useRef, useState } from 'react'
import type { UUID } from '@shared'
import { useStore } from '@/hooks/useStore'

interface HashtagAutocompleteInputProps {
  value: string
  onChange: (value: string) => void
  /** Campaign ID used to derive tag history for autocomplete. If absent, autocomplete is disabled. */
  campaignId?: UUID | null
  id?: string
  placeholder?: string
  className?: string
}

const MAX_SUGGESTIONS = 8

/** Extracts the `#word` token that the cursor is currently inside, if any. */
function getActiveToken(
  value: string,
  cursorPos: number
): { token: string; start: number; end: number } | null {
  let start = cursorPos
  let end = cursorPos

  while (start > 0 && !/[\s,]/.test(value[start - 1])) {
    start--
  }
  while (end < value.length && !/[\s,]/.test(value[end])) {
    end++
  }

  const token = value.slice(start, end)
  return token.startsWith('#') ? { token, start, end } : null
}

/** Derives all unique hashtags from campaign notes in the local Zustand store. */
function useCampaignTags(campaignId?: UUID | null): string[] {
  const notesByCampaign = useStore((state) =>
    campaignId
      ? (state.notes as Record<string, Record<string, { tags?: string[] }>>)[campaignId]
      : undefined
  )

  return useMemo(() => {
    const set = new Set<string>()
    for (const note of Object.values(notesByCampaign ?? {})) {
      for (const tag of note.tags ?? []) {
        const normalized = tag.startsWith('#') ? tag.toLowerCase() : `#${tag.toLowerCase()}`
        if (normalized.length > 1) {
          set.add(normalized)
        }
      }
    }
    return [...set].sort()
  }, [notesByCampaign])
}

/**
 * A hashtag input field with inline autocomplete from campaign tag history.
 * Derives suggestions from already-loaded notes in the Zustand store (no extra API call).
 * Keyboard: ArrowDown/Up to navigate, Enter/Tab to confirm, Escape to dismiss.
 */
export function HashtagAutocompleteInput({
  value,
  onChange,
  campaignId,
  id,
  placeholder,
  className = 'notes-edit-input',
}: HashtagAutocompleteInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [cursorPos, setCursorPos] = useState(value.length)
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const allTags = useCampaignTags(campaignId)

  const activeToken = useMemo(() => getActiveToken(value, cursorPos), [value, cursorPos])

  const suggestions = useMemo(() => {
    if (!activeToken || !campaignId) return []
    const partial = activeToken.token.toLowerCase()
    return allTags
      .filter((tag) => tag.startsWith(partial) && tag !== partial)
      .slice(0, MAX_SUGGESTIONS)
  }, [activeToken, allTags, campaignId])

  const applySuggestion = useCallback(
    (suggestion: string) => {
      if (!activeToken) return
      const { start, end } = activeToken
      const newValue = value.slice(0, start) + suggestion + value.slice(end)
      onChange(newValue)
      setIsOpen(false)
      setActiveIndex(-1)
      requestAnimationFrame(() => {
        if (inputRef.current) {
          const newPos = start + suggestion.length
          inputRef.current.setSelectionRange(newPos, newPos)
          inputRef.current.focus()
        }
      })
    },
    [activeToken, onChange, value]
  )

  const trackCursor = (e: React.SyntheticEvent<HTMLInputElement>) => {
    setCursorPos(e.currentTarget.selectionStart ?? e.currentTarget.value.length)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value)
    setCursorPos(e.target.selectionStart ?? e.target.value.length)
    setIsOpen(true)
    setActiveIndex(-1)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      applySuggestion(suggestions[activeIndex])
    } else if (e.key === 'Tab') {
      e.preventDefault()
      applySuggestion(suggestions[activeIndex >= 0 ? activeIndex : 0])
    } else if (e.key === 'Escape') {
      setIsOpen(false)
      setActiveIndex(-1)
    }
  }

  const showDropdown = isOpen && suggestions.length > 0

  return (
    <div className="hashtag-ac">
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onClick={trackCursor}
        onSelect={trackCursor}
        onBlur={() => {
          // Small delay lets mousedown on a suggestion fire first
          setTimeout(() => setIsOpen(false), 130)
        }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
        spellCheck={false}
      />
      {showDropdown ? (
        <ul className="hashtag-ac__dropdown" role="listbox" aria-label="Tag suggestions">
          {suggestions.map((tag, i) => (
            <li
              key={tag}
              role="option"
              aria-selected={i === activeIndex}
              className={`hashtag-ac__option${i === activeIndex ? ' hashtag-ac__option--active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault() // prevent onBlur before click registers
                applySuggestion(tag)
              }}
            >
              <span className="hashtag-ac__option-tag">{tag}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
