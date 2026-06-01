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
        <DialogPrimitive.Overlay className="fixed inset-0 z-2200 bg-slate-900/45" />
        <DialogPrimitive.Content className="fixed left-1/2 top-[42%] z-2201 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-ui-md border border-ui-border bg-ui-surface p-4 shadow-xl">
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
