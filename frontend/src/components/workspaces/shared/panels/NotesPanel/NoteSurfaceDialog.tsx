import { useState } from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import type { UUID } from '@shared'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import type { NotesShareUser } from '@/types/notesShare'
import type { NotesSurfaceTarget } from '@/types/notesPublish'

interface NoteSurfacePopoverProps {
  open: boolean
  isSubmitting: boolean
  shareUsers: NotesShareUser[]
  error?: string | null
  trigger: React.ReactNode
  triggerTooltip: string
  onOpenChange: (open: boolean) => void
  onConfirmSurface: (target: NotesSurfaceTarget) => Promise<void>
}

/**
 * Popover for the DM to send a note as a recipients-only handout card in chat.
 * Anchored below the publish button. Lets the DM choose scope (PARTY | SELECTED),
 * pick specific players in SELECTED mode, and optionally provide a manual excerpt.
 */
export function NoteSurfaceDialog({
  open,
  isSubmitting,
  shareUsers,
  error,
  trigger,
  triggerTooltip,
  onOpenChange,
  onConfirmSurface,
}: NoteSurfacePopoverProps) {
  const [scope, setScope] = useState<'PARTY' | 'SELECTED'>('PARTY')
  const [selectedIds, setSelectedIds] = useState<Set<UUID>>(new Set())
  const [showExcerpt, setShowExcerpt] = useState(false)
  const [manualExcerpt, setManualExcerpt] = useState('')

  const players = shareUsers.filter((u) => u.role === 'PLAYER' || u.role === 'player')

  const togglePlayer = (userId: UUID) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) {
        next.delete(userId)
      } else {
        next.add(userId)
      }
      return next
    })
  }

  const canSubmit =
    !isSubmitting && (scope === 'PARTY' || (scope === 'SELECTED' && selectedIds.size > 0))

  const handleSubmit = async () => {
    if (!canSubmit) return
    const target: NotesSurfaceTarget = {
      scope,
      selectedUserIds: scope === 'SELECTED' ? Array.from(selectedIds) : undefined,
      manualExcerpt: manualExcerpt.trim() || undefined,
    }
    await onConfirmSurface(target)
  }

  const handleOpenChange = (next: boolean) => {
    if (isSubmitting) return
    if (!next) {
      setScope('PARTY')
      setSelectedIds(new Set())
      setShowExcerpt(false)
      setManualExcerpt('')
    }
    onOpenChange(next)
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <TooltipProvider delayDuration={140}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
          </TooltipTrigger>
          <TooltipContent side="top">{triggerTooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="bottom"
          align="end"
          sideOffset={8}
          className="notes-surface-popover"
        >
          <p className="notes-surface-popover__title">Send Handout to Chat</p>
          <p className="notes-surface-popover__desc">
            Recipients see an excerpt in chat. The full handout is always visible in the Notes tab.
          </p>

          <div
            className="notes-surface-popover__scopes"
            role="radiogroup"
            aria-label="Who receives this handout"
          >
            <button
              type="button"
              role="radio"
              aria-checked={scope === 'PARTY'}
              disabled={isSubmitting}
              onClick={() => setScope('PARTY')}
              className={`notes-surface-popover__scope${scope === 'PARTY' ? ' is-selected' : ''}`}
            >
              <span
                className="material-symbols-outlined notes-surface-popover__scope-icon"
                aria-hidden="true"
              >
                groups
              </span>
              <span className="notes-surface-popover__scope-label">All Players</span>
            </button>

            <button
              type="button"
              role="radio"
              aria-checked={scope === 'SELECTED'}
              disabled={isSubmitting}
              onClick={() => setScope('SELECTED')}
              className={`notes-surface-popover__scope${scope === 'SELECTED' ? ' is-selected' : ''}`}
            >
              <span
                className="material-symbols-outlined notes-surface-popover__scope-icon"
                aria-hidden="true"
              >
                person_check
              </span>
              <span className="notes-surface-popover__scope-label">Choose Players</span>
            </button>
          </div>

          {scope === 'SELECTED' && players.length > 0 ? (
            <div className="notes-surface-popover__players">
              {players.map((player) => {
                const checked = selectedIds.has(player.id)
                const displayName = player.characterName || player.playerName || player.username
                return (
                  <label
                    key={player.id}
                    className={`notes-surface-popover__player${checked ? ' is-selected' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isSubmitting}
                      onChange={() => togglePlayer(player.id)}
                      className="accent-brand"
                    />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {displayName}
                    </span>
                    {player.status === 'OFFLINE' || player.status === 'NOT_HERE' ? (
                      <span className="notes-surface-popover__player-offline">offline</span>
                    ) : null}
                  </label>
                )
              })}
            </div>
          ) : scope === 'SELECTED' && players.length === 0 ? (
            <p className="notes-surface-popover__desc">No players in this session.</p>
          ) : null}

          <button
            type="button"
            onClick={() => setShowExcerpt((v) => !v)}
            disabled={isSubmitting}
            className="notes-surface-popover__excerpt-toggle"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {showExcerpt ? 'expand_less' : 'expand_more'}
            </span>
            {showExcerpt ? 'Hide custom excerpt' : 'Add custom excerpt (optional)'}
          </button>
          {showExcerpt ? (
            <textarea
              value={manualExcerpt}
              onChange={(e) => setManualExcerpt(e.target.value)}
              disabled={isSubmitting}
              maxLength={220}
              rows={3}
              placeholder="Leave blank to auto-generate from note content…"
              className="notes-surface-popover__excerpt"
            />
          ) : null}

          {error ? (
            <p className="notes-surface-popover__error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="notes-surface-popover__actions">
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
              className="notes-surface-popover__cancel"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
              className="notes-surface-popover__submit"
            >
              {isSubmitting ? 'Sending…' : 'Send Handout'}
            </button>
          </div>

          <PopoverPrimitive.Arrow className="notes-surface-popover__arrow" />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
