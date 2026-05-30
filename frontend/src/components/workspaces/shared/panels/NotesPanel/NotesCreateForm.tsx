import { useMemo, useState } from 'react'
import { NoteVisibility, type NoteAttachmentEntity, type UUID } from '@shared'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import { MarkdownEditor } from '@/components/workspaces/shared/panels/MarkdownEditor'
import { useToast } from '@/hooks/useToast'
import type { NotesShareRoom, NotesShareUser } from '@/types/notesShare'
import { createNotesImageInsertActions } from '@/utils/notesImageInsertActions'
import { NoteAttachmentsField } from './NoteAttachmentsField'
import { NoteShareStatusIcon } from './NoteShareStatusIcon'
import { NoteSharePopover } from './NoteSharePopover'

interface NotesCreateFormProps {
  campaignId: UUID
  title: string
  content: string
  visibility: NoteVisibility
  allowedUsers: UUID[]
  attachments: NoteAttachmentEntity[]
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
  onAttachmentsChange: (attachments: NoteAttachmentEntity[]) => void
  onTagsTextChange: (value: string) => void
}

export function NotesCreateForm(props: NotesCreateFormProps) {
  const showToast = useToast()
  const imageInsertActions = useMemo(() => createNotesImageInsertActions(showToast), [showToast])
  const [sharePopoverOpen, setSharePopoverOpen] = useState(false)

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
                  className="notes-edit-icon-button"
                  aria-label="Save note"
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    {props.isCreating ? 'hourglass_top' : 'save'}
                  </span>
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

      <NoteAttachmentsField
        campaignId={props.campaignId}
        attachments={props.attachments}
        onChange={props.onAttachmentsChange}
        showToast={showToast}
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
        <div className="notes-edit-meta-summary notes-edit-meta-summary--status">
          <NoteShareStatusIcon visibility={props.visibility} allowedUsers={props.allowedUsers} />
        </div>
      </div>
    </form>
  )
}
