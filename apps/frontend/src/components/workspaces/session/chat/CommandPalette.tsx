/**
 * CommandPalette
 * Inline autocomplete list that appears when the user types "/" in the chat input.
 * Keyboard-navigable: ArrowUp/ArrowDown to move, Enter to complete, Escape to dismiss.
 */

import { useEffect, useRef, useState, memo } from 'react'
import type { ChatCommandDefinition } from '@shared'

interface CommandPaletteProps {
  commands: ChatCommandDefinition[]
  onSelect: (command: ChatCommandDefinition) => void
  onDismiss: () => void
  /** When true (all commands shown, just "/" typed), hides description text to keep the list compact. */
  compact?: boolean
}

function CommandPaletteComponent({ commands, onSelect, onDismiss, compact }: CommandPaletteProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  // Reset selection when the command list changes (user keeps typing)
  useEffect(() => {
    setActiveIndex(0)
  }, [commands])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, commands.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        if (commands[activeIndex]) onSelect(commands[activeIndex])
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onDismiss()
      }
    }
    window.addEventListener('keydown', handleKey, { capture: true })
    return () => window.removeEventListener('keydown', handleKey, { capture: true })
  }, [activeIndex, commands, onSelect, onDismiss])

  if (commands.length === 0) return null

  return (
    <div className="chat-command-palette" role="listbox" aria-label="Available commands">
      <ul ref={listRef} className="chat-command-palette__list">
        {commands.map((cmd, index) => (
          <li
            key={cmd.name}
            role="option"
            aria-selected={index === activeIndex}
            className={`chat-command-palette__item ${index === activeIndex ? 'chat-command-palette__item--active' : ''} ${compact ? 'chat-command-palette__item--compact' : ''}`}
            onMouseEnter={() => setActiveIndex(index)}
            onMouseDown={(e) => {
              e.preventDefault()
              onSelect(cmd)
            }}
          >
            <span className="chat-command-palette__item-slash">{cmd.slash}</span>
            <span className="chat-command-palette__item-syntax">
              {cmd.syntax.slice(cmd.slash.length).trim()}
            </span>
            {!compact && (
              <span className="chat-command-palette__item-description">{cmd.description}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export const CommandPalette = memo(CommandPaletteComponent)
