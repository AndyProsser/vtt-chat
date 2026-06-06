import { useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import type { UUID } from '@shared'
import type { NotesShareUser } from '@/types/notesShare'
import type { NotesSurfaceTarget } from '@/types/notesPublish'

interface NoteSurfaceDialogProps {
  open: boolean
  isSubmitting: boolean
  shareUsers: NotesShareUser[]
  onOpenChange: (open: boolean) => void
  onConfirmSurface: (target: NotesSurfaceTarget) => Promise<void>
}

/**
 * Dialog for the DM to send a note as a recipients-only handout card in chat.
 * Lets the DM choose scope (PARTY | SELECTED), pick specific players in SELECTED mode,
 * and optionally provide a manual excerpt override.
 */
export function NoteSurfaceDialog({
  open,
  isSubmitting,
  shareUsers,
  onOpenChange,
  onConfirmSurface,
}: NoteSurfaceDialogProps) {
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
      // Reset state on close
      setScope('PARTY')
      setSelectedIds(new Set())
      setShowExcerpt(false)
      setManualExcerpt('')
    }
    onOpenChange(next)
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-2200 bg-slate-900/45" />
        <DialogPrimitive.Content className="fixed left-1/2 top-[42%] z-2201 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-ui-md border border-ui-border bg-ui-surface p-4 shadow-xl">
          <DialogPrimitive.Title className="text-base font-semibold text-ui-primary">
            Send Handout to Chat
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-1 text-sm text-ui-secondary">
            Recipients see an excerpt in chat. The full handout is always visible in the Notes tab.
          </DialogPrimitive.Description>

          {/* Scope selector */}
          <div className="mt-4 flex gap-2" role="radiogroup" aria-label="Who receives this handout">
            <button
              type="button"
              role="radio"
              aria-checked={scope === 'PARTY'}
              disabled={isSubmitting}
              onClick={() => setScope('PARTY')}
              className={`flex-1 rounded-ui-sm border px-3 py-2.5 text-left text-sm transition ${
                scope === 'PARTY'
                  ? 'border-brand bg-brand/10 text-ui-primary'
                  : 'border-ui-border bg-ui-surface-subtle text-ui-secondary hover:bg-ui-surface-hover'
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-base" aria-hidden="true">
                  groups
                </span>
                <div>
                  <div className="font-medium">All Players</div>
                  <div className="text-xs opacity-75">Everyone in the session</div>
                </div>
              </div>
            </button>

            <button
              type="button"
              role="radio"
              aria-checked={scope === 'SELECTED'}
              disabled={isSubmitting}
              onClick={() => setScope('SELECTED')}
              className={`flex-1 rounded-ui-sm border px-3 py-2.5 text-left text-sm transition ${
                scope === 'SELECTED'
                  ? 'border-brand bg-brand/10 text-ui-primary'
                  : 'border-ui-border bg-ui-surface-subtle text-ui-secondary hover:bg-ui-surface-hover'
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-base" aria-hidden="true">
                  person_check
                </span>
                <div>
                  <div className="font-medium">Choose Players</div>
                  <div className="text-xs opacity-75">Select specific recipients</div>
                </div>
              </div>
            </button>
          </div>

          {/* Player picker (SELECTED scope only) */}
          {scope === 'SELECTED' && players.length > 0 ? (
            <div className="mt-3 flex max-h-44 flex-col gap-1 overflow-y-auto rounded-ui-sm border border-ui-border bg-ui-surface-subtle p-2">
              {players.map((player) => {
                const checked = selectedIds.has(player.id)
                const displayName = player.characterName || player.playerName || player.username
                return (
                  <label
                    key={player.id}
                    className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm transition ${
                      checked
                        ? 'bg-brand/10 text-ui-primary'
                        : 'text-ui-secondary hover:bg-ui-surface-hover'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isSubmitting}
                      onChange={() => togglePlayer(player.id)}
                      className="accent-brand"
                    />
                    <span className="truncate">{displayName}</span>
                    {player.status === 'OFFLINE' || player.status === 'NOT_HERE' ? (
                      <span className="ml-auto shrink-0 text-xs text-ui-secondary opacity-60">
                        offline
                      </span>
                    ) : null}
                  </label>
                )
              })}
            </div>
          ) : scope === 'SELECTED' && players.length === 0 ? (
            <p className="mt-3 text-sm text-ui-secondary">No players in this session.</p>
          ) : null}

          {/* Optional custom excerpt */}
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowExcerpt((v) => !v)}
              disabled={isSubmitting}
              className="flex items-center gap-1 text-xs text-ui-secondary hover:text-ui-primary disabled:cursor-not-allowed"
            >
              <span
                className="material-symbols-outlined text-sm"
                style={{ fontSize: '14px' }}
                aria-hidden="true"
              >
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
                className="mt-2 w-full resize-none rounded-ui-sm border border-ui-border bg-ui-surface-subtle px-2 py-1.5 text-sm text-ui-primary placeholder:text-ui-secondary focus:border-brand focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              />
            ) : null}
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
              className="rounded-ui-sm border border-ui-border px-3 py-2 text-sm text-ui-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
              className="rounded-ui-sm bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Sending…' : 'Send Handout'}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
