import { useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'

interface DeleteCampaignSectionProps {
  campaignName: string
  isDeleting: boolean
  onDelete: () => void
}

/**
 * Danger-zone section rendered at the bottom of the Campaign Settings panel.
 * A first click opens a warning dialog; a second typed-confirmation step is
 * required before the destructive action fires.
 *
 * In DEV the backend performs a hard delete; in PROD a soft delete is used
 * so an admin can restore the campaign if needed.
 */
export function DeleteCampaignSection({
  campaignName,
  isDeleting,
  onDelete,
}: DeleteCampaignSectionProps) {
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  const requiredPhrase = campaignName.trim() || 'DELETE'
  const confirmed = confirmText.trim() === requiredPhrase

  function handleOpenChange(next: boolean) {
    if (!next) {
      setConfirmText('')
    }
    setOpen(next)
  }

  function handleConfirm() {
    if (!confirmed || isDeleting) return
    setOpen(false)
    setConfirmText('')
    onDelete()
  }

  return (
    <section className="csp-danger-zone" aria-label="Danger zone">
      <div className="csp-danger-zone-header">
        <span className="material-symbols-outlined csp-danger-zone-icon" aria-hidden="true">
          warning
        </span>
        <h5 className="csp-danger-zone-title">Danger Zone</h5>
      </div>

      <p className="csp-danger-zone-body">
        Deleting this campaign is <strong>permanent</strong>. All sessions, chat history,
        characters, and member data will be removed. This cannot be undone by you.
        {import.meta.env.PROD && (
          <> An admin can restore a deleted campaign within a limited window.</>
        )}
      </p>

      <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
        <DialogPrimitive.Trigger asChild>
          <button type="button" className="csp-danger-zone-trigger" disabled={isDeleting}>
            {isDeleting ? 'Deleting…' : 'Delete campaign'}
          </button>
        </DialogPrimitive.Trigger>

        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="session-modal-backdrop session-modal-backdrop--overlay" />
          <DialogPrimitive.Content className="session-modal session-modal--confirm-dialog session-modal--floating csp-delete-dialog csp-delete-dialog--anchored">
            <DialogPrimitive.Title className="csp-delete-dialog-title">
              <span className="material-symbols-outlined" aria-hidden="true">
                delete_forever
              </span>
              Delete &ldquo;{campaignName}&rdquo;?
            </DialogPrimitive.Title>

            <DialogPrimitive.Description className="csp-delete-dialog-desc">
              This will permanently delete the campaign and all associated data — sessions,
              messages, characters, and member records.
              {import.meta.env.PROD ? (
                <>
                  {' '}
                  A soft-delete tombstone will be created; contact an admin within 30 days to
                  restore.
                </>
              ) : (
                <>
                  {' '}
                  In this dev environment the deletion is{' '}
                  <strong>immediate and irreversible</strong>.
                </>
              )}
            </DialogPrimitive.Description>

            <div className="csp-delete-dialog-confirm-block">
              <label className="csp-delete-dialog-confirm-label" htmlFor="delete-confirm-input">
                Type <strong>{requiredPhrase}</strong> to confirm:
              </label>
              <input
                id="delete-confirm-input"
                className="session-input csp-delete-dialog-confirm-input"
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder={requiredPhrase}
                disabled={isDeleting}
              />
            </div>

            <div className="csp-delete-dialog-actions">
              <DialogPrimitive.Close asChild>
                <button type="button" className="csp-delete-dialog-cancel" disabled={isDeleting}>
                  Cancel
                </button>
              </DialogPrimitive.Close>
              <button
                type="button"
                className="csp-delete-dialog-confirm"
                disabled={!confirmed || isDeleting}
                onClick={handleConfirm}
              >
                {isDeleting ? 'Deleting…' : 'Yes, delete campaign'}
              </button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </section>
  )
}
