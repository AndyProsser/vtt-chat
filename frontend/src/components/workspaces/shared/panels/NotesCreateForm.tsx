import { useMemo } from 'react'
import { NoteVisibility, Role, RoomType, type UUID } from '@shared'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import { MarkdownEditor } from '@/components/workspaces/shared/panels/MarkdownEditor'
import { useToast } from '@/hooks/useToast'
import { createNotesImageInsertActions } from '@/utils/notesImageInsertActions'

interface ShareUserOption {
  id: UUID
  username: string
  role: Role | string
}

interface ShareRoomOption {
  id: UUID
  name: string
  type: RoomType
}

interface NotesCreateFormProps {
  title: string
  content: string
  visibility: NoteVisibility
  tagsText: string
  shareUsers: ShareUserOption[]
  shareRooms: ShareRoomOption[]
  selectedShareUserId: string
  selectedShareRoomId: string
  allowedUsers: string[]
  isCreating: boolean
  userRole: Role | string
  onSubmit: React.FormEventHandler<HTMLFormElement>
  onTitleChange: (value: string) => void
  onContentChange: (value: string) => void
  onVisibilityChange: (value: NoteVisibility) => void
  onTagsTextChange: (value: string) => void
  onSelectedShareUserIdChange: (value: string) => void
  onSelectedShareRoomIdChange: (value: string) => void
  onAddSelectedUser: () => void
  onAddSelectedRoom: () => void
  onRemoveAllowedUser: (userId: string) => void
}

export function NotesCreateForm(props: NotesCreateFormProps) {
  const showToast = useToast()
  const imageInsertActions = useMemo(() => createNotesImageInsertActions(showToast), [showToast])

  return (
    <form onSubmit={props.onSubmit} className="space-y-2 border-b border-ui-border p-3">
      <label className="notes-edit-label" htmlFor="notes-create-title">
        Note title
      </label>
      <input
        id="notes-create-title"
        value={props.title}
        onChange={(event) => props.onTitleChange(event.target.value)}
        placeholder="Handout title"
        required
        className="notes-edit-input"
      />

      <MarkdownEditor
        value={props.content}
        onChange={props.onContentChange}
        placeholder="Write note content"
        variant="full"
        insertActions={imageInsertActions}
      />

      <div className="notes-edit-meta-row">
        <div className="notes-edit-meta-col">
          <label className="notes-edit-label" htmlFor="notes-create-visibility">
            Visibility
          </label>
          <select
            id="notes-create-visibility"
            value={props.visibility}
            onChange={(event) => props.onVisibilityChange(event.target.value as NoteVisibility)}
            className="notes-edit-input"
          >
            <option value={NoteVisibility.PLAYERS_VISIBLE}>Shared</option>
            <option value={NoteVisibility.CUSTOM}>Limited</option>
            {props.userRole === Role.DM ? (
              <option value={NoteVisibility.DM_ONLY}>None</option>
            ) : null}
          </select>
        </div>
        <div className="notes-edit-meta-col">
          <label className="notes-edit-label" htmlFor="notes-create-tags">
            Hashtags
          </label>
          <input
            id="notes-create-tags"
            value={props.tagsText}
            onChange={(event) => props.onTagsTextChange(event.target.value)}
            placeholder="npc, city, clue"
            className="notes-edit-input"
          />
        </div>
      </div>

      {props.visibility === NoteVisibility.CUSTOM ? (
        <div className="mb-2 space-y-1.5">
          <div className="flex gap-2">
            <select
              value={props.selectedShareUserId}
              onChange={(event) => props.onSelectedShareUserIdChange(event.target.value)}
              className="flex-1 rounded-ui-sm border border-ui-border-soft bg-ui-surface px-3 py-2 text-sm text-ui-primary"
            >
              <option value="">Share with player</option>
              {props.shareUsers.map((shareUser) => (
                <option key={shareUser.id} value={shareUser.id}>
                  {shareUser.username}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={props.onAddSelectedUser}
              disabled={!props.selectedShareUserId}
              className="rounded-ui-sm border border-ui-border px-3 py-2 text-sm text-ui-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              Add player
            </button>
          </div>

          <div className="flex gap-2">
            <select
              value={props.selectedShareRoomId}
              onChange={(event) => props.onSelectedShareRoomIdChange(event.target.value)}
              className="flex-1 rounded-ui-sm border border-ui-border-soft bg-ui-surface px-3 py-2 text-sm text-ui-primary"
            >
              <option value="">Share with everyone in group</option>
              {props.shareRooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={props.onAddSelectedRoom}
              disabled={!props.selectedShareRoomId}
              className="rounded-ui-sm border border-ui-border px-3 py-2 text-sm text-ui-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              Add group
            </button>
          </div>

          {props.shareUsers.length === 0 ? (
            <p className="m-0 text-xs text-ui-secondary">
              No players are available to share with yet.
            </p>
          ) : null}
          {props.shareRooms.length === 0 ? (
            <p className="m-0 text-xs text-ui-secondary">
              No shareable groups are available in the current campaign context yet.
            </p>
          ) : null}

          <TooltipProvider delayDuration={140}>
            <div className="flex flex-wrap gap-1.5">
              {props.allowedUsers.map((userId) => (
                <Tooltip key={userId}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => props.onRemoveAllowedUser(userId)}
                      className="rounded-full border border-ui-border-soft bg-ui-surface-subtle px-2 py-1 text-xs text-ui-secondary"
                    >
                      {props.shareUsers.find((candidate) => candidate.id === userId)?.username ||
                        userId}{' '}
                      x
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Click to remove</TooltipContent>
                </Tooltip>
              ))}
            </div>
          </TooltipProvider>
        </div>
      ) : null}

      <button type="submit" disabled={props.isCreating} className="notes-toolbar-button">
        {props.isCreating ? 'Creating...' : 'Create handout'}
      </button>
    </form>
  )
}
