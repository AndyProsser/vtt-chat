import * as DialogPrimitive from '@radix-ui/react-dialog'
import type { UUID } from '@shared'
import { RoomType } from '@shared'
import type { NotesPublishRoom, NotesPublishTarget } from '@/types/notesPublish'

interface NotePublishDialogProps {
  open: boolean
  isSubmitting: boolean
  rooms: NotesPublishRoom[]
  roomMemberIdsByRoomId: Record<UUID, UUID[]>
  onOpenChange: (open: boolean) => void
  onConfirmPublish: (target: NotesPublishTarget) => Promise<void>
}

export function NotePublishDialog(props: NotePublishDialogProps) {
  return (
    <DialogPrimitive.Root open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-2200 bg-slate-900/45" />
        <DialogPrimitive.Content className="fixed left-1/2 top-[42%] z-2201 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-ui-md border border-ui-border bg-ui-surface p-4 shadow-xl">
          <DialogPrimitive.Title className="text-base font-semibold text-ui-primary">
            Post Handout To Chat
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-2 text-sm text-ui-secondary">
            Choose a room. Posting will also update handout sharing to match the players currently
            in that room.
          </DialogPrimitive.Description>

          <div className="mt-4 flex flex-col gap-2">
            {props.rooms.map((room) => {
              const memberCount = props.roomMemberIdsByRoomId[room.id]?.length || 0
              const roomLabel = room.type === RoomType.MAIN ? 'Main' : 'Group'

              return (
                <button
                  key={room.id}
                  type="button"
                  disabled={props.isSubmitting}
                  onClick={() => void props.onConfirmPublish({ audience: 'ROOM', roomId: room.id })}
                  className="rounded-ui-sm border border-ui-border bg-ui-surface-subtle px-3 py-3 text-left text-sm text-ui-primary transition hover:bg-ui-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{room.name}</span>
                    <span className="text-xs uppercase tracking-[0.08em] text-ui-secondary">
                      {roomLabel}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-ui-secondary">
                    Share with {memberCount} player{memberCount === 1 ? '' : 's'} in this room.
                  </div>
                </button>
              )
            })}
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => props.onOpenChange(false)}
              disabled={props.isSubmitting}
              className="rounded-ui-sm border border-ui-border px-3 py-2 text-sm text-ui-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
