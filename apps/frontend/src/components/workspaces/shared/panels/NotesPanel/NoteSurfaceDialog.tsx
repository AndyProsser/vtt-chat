import { useState } from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import type { UUID } from '@shared'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import type { NotesShareUser } from '@/types/notesShare'
import type { NotesSurfaceTarget } from '@/types/notesPublish'
import { Icon } from '@/components/ui/Icon'

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
    }
    await onConfirmSurface(target)
  }

  const handleOpenChange = (next: boolean) => {
    if (isSubmitting) return
    if (!next) {
      setScope('PARTY')
      setSelectedIds(new Set())
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
          <p className="notes-surface-popover__desc">Recipients see a handout in chat.</p>

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
              <Icon name="groups" className="notes-surface-popover__scope-icon" />
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
              <Icon name="person_check" className="notes-surface-popover__scope-icon" />
              <span className="notes-surface-popover__scope-label">Choose Players</span>
            </button>
          </div>

          {scope === 'SELECTED' && players.length > 0 ? (
            <div className="notes-surface-popover__players">
              {players.map((player) => {
                const isSelected = selectedIds.has(player.id)
                const characterName = player.characterName || player.username
                const playerDisplayName = player.playerName || player.username
                return (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => togglePlayer(player.id)}
                    disabled={isSubmitting}
                    className={`notes-share-popover__player${isSelected ? ' is-selected' : ''}`}
                  >
                    <span className="notes-share-popover__player-avatar" aria-hidden="true">
                      {player.avatarUrl ? (
                        <img src={player.avatarUrl} alt="" />
                      ) : (
                        playerDisplayName.slice(0, 1).toUpperCase()
                      )}
                    </span>
                    <span className="notes-share-popover__player-copy">
                      <span className="notes-share-popover__player-character">{characterName}</span>
                      <span className="notes-share-popover__player-name">{playerDisplayName}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          ) : scope === 'SELECTED' && players.length === 0 ? (
            <p className="notes-surface-popover__desc">No players in this session.</p>
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
