/**
 * Horizontal avatar-strip picker for the DM to switch between party and
 * individual character inventories. Party is always the first slot.
 * Online players appear first; offline players appear last and are greyed.
 * Scroll arrows appear dynamically when the strip overflows.
 */

import { useRef, useState, useEffect } from 'react'
import type { UUID } from '@shared'
import { Icon } from '@/components/ui/Icon'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui'

export interface CharacterPickerMember {
  userId: UUID
  label: string
  avatarUrl: string | null
  isOnline: boolean
}

interface InventoryCharacterPickerProps {
  members: CharacterPickerMember[]
  /** null = Party is selected */
  selectedUserId: UUID | null
  onSelect: (userId: UUID | null) => void
}

export function InventoryCharacterPicker({
  members,
  selectedUserId,
  onSelect,
}: InventoryCharacterPickerProps) {
  const stripRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  function updateArrows() {
    const el = stripRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 2)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2)
  }

  useEffect(() => {
    const el = stripRef.current
    if (!el) return
    updateArrows()
    el.addEventListener('scroll', updateArrows, { passive: true })
    const ro = new ResizeObserver(updateArrows)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', updateArrows)
      ro.disconnect()
    }
  }, [members])

  function scroll(dir: 'left' | 'right') {
    stripRef.current?.scrollBy({ left: dir === 'left' ? -88 : 88, behavior: 'smooth' })
  }

  const online = members.filter((m) => m.isOnline)
  const offline = members.filter((m) => !m.isOnline)
  const sorted = [...online, ...offline]

  return (
    <div className="inventory-char-picker">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-pressed={selectedUserId === null}
            className={`inventory-char-picker__avatar inventory-char-picker__avatar--party${selectedUserId === null ? ' inventory-char-picker__avatar--selected' : ''}`}
            onClick={() => onSelect(null)}
          >
            <Icon name="party" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Party</TooltipContent>
      </Tooltip>

      <button
        type="button"
        className={`inventory-char-picker__arrow${canScrollLeft ? '' : ' inventory-char-picker__arrow--hidden'}`}
        aria-label="Scroll left"
        tabIndex={canScrollLeft ? 0 : -1}
        onClick={() => scroll('left')}
      >
        <Icon name="chevron_left" />
      </button>

      <div ref={stripRef} className="inventory-char-picker__strip">
        {sorted.map((m) => {
          const isSelected = m.userId === selectedUserId
          return (
            <Tooltip key={m.userId}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  className={[
                    'inventory-char-picker__avatar',
                    isSelected ? 'inventory-char-picker__avatar--selected' : '',
                    !m.isOnline ? 'inventory-char-picker__avatar--offline' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => onSelect(m.userId)}
                >
                  {m.avatarUrl ? (
                    <img src={m.avatarUrl} alt="" />
                  ) : (
                    (m.label.trim()[0] ?? '?').toUpperCase()
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {m.label}
                {!m.isOnline ? ' · offline' : ''}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>

      <button
        type="button"
        className={`inventory-char-picker__arrow${canScrollRight ? '' : ' inventory-char-picker__arrow--hidden'}`}
        aria-label="Scroll right"
        tabIndex={canScrollRight ? 0 : -1}
        onClick={() => scroll('right')}
      >
        <Icon name="chevron_right" />
      </button>
    </div>
  )
}
