/**
 * WhisperMentionPicker
 * Autocomplete dropdown for @name mentions when composing /whisper commands.
 * Appears after the user types "/whisper @<partial>" and filters by prefix.
 * Arrow keys navigate, Tab or Enter confirms, Escape dismisses.
 */

import { useEffect, useState, memo } from 'react'

interface MentionOption {
  id: string
  label: string
}

interface WhisperMentionPickerProps {
  options: MentionOption[]
  onSelect: (label: string) => void
  onDismiss: () => void
}

function WhisperMentionPickerComponent({ options, onSelect, onDismiss }: WhisperMentionPickerProps) {
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => setActiveIndex(0), [options])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, options.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault()
        if (options[activeIndex]) onSelect(options[activeIndex].label)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onDismiss()
      }
    }
    window.addEventListener('keydown', handleKey, { capture: true })
    return () => window.removeEventListener('keydown', handleKey, { capture: true })
  }, [activeIndex, options, onSelect, onDismiss])

  if (options.length === 0) return null

  return (
    <div className="chat-command-palette" role="listbox" aria-label="Whisper recipients">
      <ul className="chat-command-palette__list">
        {options.map((opt, index) => (
          <li
            key={opt.id}
            role="option"
            aria-selected={index === activeIndex}
            className={`chat-command-palette__item ${index === activeIndex ? 'chat-command-palette__item--active' : ''}`}
            onMouseEnter={() => setActiveIndex(index)}
            onMouseDown={(e) => {
              e.preventDefault()
              onSelect(opt.label)
            }}
          >
            <span className="chat-command-palette__item-slash">@{opt.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export const WhisperMentionPicker = memo(WhisperMentionPickerComponent)
