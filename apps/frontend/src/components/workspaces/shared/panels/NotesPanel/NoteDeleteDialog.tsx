import * as DialogPrimitive from '@radix-ui/react-dialog'

interface NoteDeleteDialogProps {
  open: boolean
  isSaving: boolean
  onOpenChange: (open: boolean) => void
  onConfirmDelete: () => Promise<void>
}

export function NoteDeleteDialog({
  open,
  isSaving,
  onOpenChange,
  onConfirmDelete,
}: NoteDeleteDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="session-modal-backdrop session-modal-backdrop--overlay" />
        <DialogPrimitive.Content
          className="session-modal session-modal--confirm-dialog session-modal--floating"
          style={{ top: '50%', zIndex: 2201 }}
        >
          <DialogPrimitive.Title className="text-base font-semibold text-ui-primary">
            Delete Note
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-2 text-sm text-ui-secondary">
            Delete this note? This action cannot be undone.
          </DialogPrimitive.Description>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
              className="rounded-ui-sm border border-ui-border px-3 py-2 text-sm text-ui-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void onConfirmDelete()}
              disabled={isSaving}
              className="rounded-ui-sm bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isSaving ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
