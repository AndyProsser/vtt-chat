import { useMemo, useState } from 'react'
import { NoteVisibility, type UUID } from '@shared'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import { MarkdownEditor } from '@/components/workspaces/shared/panels/MarkdownEditor'
import { useToast } from '@/hooks/useToast'
import type { NotesShareRoom, NotesShareUser } from '@/types/notesShare'
import { createNotesImageInsertActions } from '@/utils/notesImageInsertActions'
import { NoteSharePopover } from './NoteSharePopover'

interface NotesCreateFormProps {
  title: string
  content: string
  visibility: NoteVisibility
  allowedUsers: UUID[]
  tagsText: string
  shareUsers: NotesShareUser[]
  shareRooms: NotesShareRoom[]
  roomMemberIdsByRoomId: Record<UUID, UUID[]>
  isCreating: boolean
  onSubmit: React.FormEventHandler<HTMLFormElement>
  onTitleChange: (value: string) => void
  onContentChange: (value: string) => void
  onVisibilityChange: (value: NoteVisibility) => void
  onAllowedUsersChange: (users: UUID[]) => void
  onTagsTextChange: (value: string) => void
}

function deriveVisibilityLabel(visibility: NoteVisibility, allowedUsers: UUID[]): string {
  if (visibility === NoteVisibility.DM_ONLY) return 'None'
  if (visibility === NoteVisibility.PLAYERS_VISIBLE) return 'Everyone'
  if (allowedUsers.length === 0) return 'Limited (none selected)'
  return `Limited · ${allowedUsers.length} selected`
}

export function NotesCreateForm(props: NotesCreateFormProps) {
  const showToast = useToast()
  const imageInsertActions = useMemo(() => createNotesImageInsertActions(showToast), [showToast])
  const [sharePopoverOpen, setSharePopoverOpen] = useState(false)

  const visibilityLabel = deriveVisibilityLabel(props.visibility, props.allowedUsers)

  return (
    <form onSubmit={props.onSubmit} className="notes-create-form">
      <div className="notes-edit-header">
        <div className="notes-edit-title-wrap">
          <label className="notes-edit-label" htmlFor="notes-create-title">
            Handout title
          </label>
          <input
            id="notes-create-title"
            value={props.title}
            onChange={(event) => props.onTitleChange(event.target.value)}
            placeholder="Handout title"
            required
            className="notes-edit-input"
          />
        </div>
        <div className="notes-edit-icon-actions">
          <NoteSharePopover
            open={sharePopoverOpen}
            onOpenChange={setSharePopoverOpen}
            visibility={props.visibility}
            allowedUsers={props.allowedUsers}
            shareUsers={props.shareUsers}
            shareRooms={props.shareRooms}
            roomMemberIdsByRoomId={props.roomMemberIdsByRoomId}
            onSetVisibility={props.onVisibilityChange}
            onSetAllowedUsers={props.onAllowedUsersChange}
            triggerTooltip="Share"
            trigger={
              <button type="button" className="notes-edit-icon-button" aria-label="Share handout">
                <span className="material-symbols-outlined" aria-hidden="true">
                  group
                </span>
              </button>
            }
          />

          <TooltipProvider delayDuration={140}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="submit"
                  disabled={props.isCreating}
                  className="notes-edit-primary-button"
                  aria-label="Save note"
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    save
                  </span>
                  <span>{props.isCreating ? 'Saving...' : 'Save Note'}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Save Note</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <MarkdownEditor
        value={props.content}
        onChange={props.onContentChange}
        placeholder="Write note content"
        variant="full"
        insertActions={imageInsertActions}
      />

      <div className="notes-edit-meta-row">
        <div className="notes-edit-meta-col">
          <label className="notes-edit-label" htmlFor="notes-create-tags">
            Hashtags
          </label>
          <input
            id="notes-create-tags"
            value={props.tagsText}
            onChange={(event) => props.onTagsTextChange(event.target.value)}
            placeholder="#npc, #city, #clue"
            className="notes-edit-input"
          />
        </div>
        <div className="notes-edit-meta-summary">{visibilityLabel}</div>
      </div>
    </form>
  )
}
