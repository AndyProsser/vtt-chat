/**
 * DmdxInsertMenu
 *
 * Toolbar dropdown for inserting DMDX block templates.
 * Each option inserts a blank template at the cursor position in the editor.
 * The DM fills in the fields after insertion.
 */

import { useRef, useState, useCallback, useEffect } from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'

interface DmdxBlockOption {
  type: string
  label: string
  icon: string
  description: string
  template: string
}

const DMDX_BLOCK_OPTIONS: DmdxBlockOption[] = [
  {
    type: 'npc',
    label: 'NPC',
    icon: 'person',
    description: 'Non-player character card',
    template: `\`\`\`npc
name:
race:
class:
level:
alignment:
tags:
notes: >

\`\`\``,
  },
  {
    type: 'monster',
    label: 'Monster',
    icon: 'skull',
    description: 'Stat block for monsters',
    template: `\`\`\`monster
name:
size: Medium
type:
ac:
hp:
speed: 30 ft
abilities:
  str: 10
  dex: 10
  con: 10
  int: 10
  wis: 10
  cha: 10
actions:
  -
\`\`\``,
  },
  {
    type: 'encounter',
    label: 'Encounter',
    icon: 'swords',
    description: 'Combat or social encounter',
    template: `\`\`\`encounter
name:
difficulty: medium
environment:
creatures:
  -
objectives:
  -
\`\`\``,
  },
  {
    type: 'loot',
    label: 'Loot',
    icon: 'inventory_2',
    description: 'Treasure or item list',
    template: `\`\`\`loot
items:
  -
  -
\`\`\``,
  },
  {
    type: 'spell',
    label: 'Spell',
    icon: 'auto_awesome',
    description: 'Spell description card',
    template: `\`\`\`spell
name:
level:
school:
casting_time: 1 action
range:
components: V, S
duration: Instantaneous
description: >

\`\`\``,
  },
  {
    type: 'session',
    label: 'Session Log',
    icon: 'menu_book',
    description: 'Session log entry',
    template: `\`\`\`session
date:
dm:
players:
  -
summary: >

events:
  -
\`\`\``,
  },
  {
    type: 'roll',
    label: 'Roll',
    icon: 'casino',
    description: 'Dice expression',
    template: `\`\`\`roll
1d20
\`\`\``,
  },
  {
    type: 'map',
    label: 'Map',
    icon: 'map',
    description: 'Map or image reference',
    template: `\`\`\`map
title:
image: attachment://
\`\`\``,
  },
  {
    type: 'timeline',
    label: 'Timeline',
    icon: 'timeline',
    description: 'Sequence of events',
    template: `\`\`\`timeline
A --> B: First event
B --> C: Second event
\`\`\``,
  },
]

interface DmdxInsertMenuProps {
  onInsert: (template: string) => void
}

export function DmdxInsertMenu({ onInsert }: DmdxInsertMenuProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const handleSelect = useCallback(
    (template: string) => {
      onInsert(template)
      setOpen(false)
      triggerRef.current?.focus()
    },
    [onInsert]
  )

  // Close on outside click
  useEffect(() => {
    if (!open) return

    const handleOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  return (
    <div className="dmdx-insert-menu" ref={menuRef}>
      <TooltipProvider delayDuration={140}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              ref={triggerRef}
              type="button"
              className={`md-editor__tool dmdx-insert-menu__trigger ${open ? 'is-active' : ''}`}
              aria-label="Insert DMDX block"
              aria-haspopup="listbox"
              aria-expanded={open}
              onMouseDown={(e) => {
                e.preventDefault()
                setOpen((prev) => !prev)
              }}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                add_box
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Insert DMDX block</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {open ? (
        <div className="dmdx-insert-menu__dropdown" role="listbox" aria-label="DMDX block types">
          {DMDX_BLOCK_OPTIONS.map((option) => (
            <button
              key={option.type}
              type="button"
              role="option"
              aria-selected={false}
              className="dmdx-insert-menu__option"
              onMouseDown={(e) => {
                e.preventDefault()
                handleSelect(option.template)
              }}
            >
              <span
                className="material-symbols-outlined dmdx-insert-menu__option-icon"
                aria-hidden="true"
              >
                {option.icon}
              </span>
              <span className="dmdx-insert-menu__option-text">
                <span className="dmdx-insert-menu__option-label" title={option.description}>
                  {option.label}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
