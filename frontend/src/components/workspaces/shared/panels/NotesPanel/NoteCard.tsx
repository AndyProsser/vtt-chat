import { useMemo, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { NoteVisibility } from '@shared'
import type { UUID } from '@shared'
import type { Note } from '@/types/notes'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import { MarkdownEditor } from '@/components/workspaces/shared/panels/MarkdownEditor'
import { useToast } from '@/hooks/useToast'
import type { NotesShareRoom, NotesShareUser } from '@/types/notesShare'
import { createNotesImageInsertActions } from '@/utils/notesImageInsertActions'
import {
  formatNotesShareUserLabel,
  parseNoteHashtags,
  serializeNoteHashtags,
} from '../../../../../utils/notesPanel'
import { NoteShareStatusIcon } from './NoteShareStatusIcon'
import { NoteSharePopover } from './NoteSharePopover'

interface NoteCardProps {
  note: Note
  canEdit: boolean
  canManageShare: boolean
  canPublish: boolean
  shareUsers?: NotesShareUser[]
  shareRooms?: NotesShareRoom[]
  roomMemberIdsByRoomId?: Record<UUID, UUID[]>
  onSave: (
    noteId: string,
    updates: Partial<Pick<Note, 'title' | 'content' | 'visibility' | 'tags' | 'allowedUsers'>>
  ) => Promise<void>
  onDelete: (noteId: string) => Promise<void>
  onPublish: (noteId: string) => Promise<void>
}

const visibilityLabel: Record<NoteVisibility, string> = {
  [NoteVisibility.DM_ONLY]: 'DM Only',
  [NoteVisibility.PLAYERS_VISIBLE]: 'Shared',
  [NoteVisibility.CUSTOM]: 'Custom',
}

export function NoteCard({
  note,
  canEdit,
  canManageShare,
  canPublish,
  shareUsers = [],
  shareRooms = [],
  roomMemberIdsByRoomId = {},
  onSave,
  onDelete,
  onPublish,
}: NoteCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState(note.content)
  const [visibility, setVisibility] = useState<NoteVisibility>(note.visibility)
  const [tagsText, setTagsText] = useState(serializeNoteHashtags(note.tags))
  const [allowedUsers, setAllowedUsers] = useState<UUID[]>(note.allowedUsers || [])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [sharePopoverOpen, setSharePopoverOpen] = useState(false)
  const showToast = useToast()
  const imageInsertActions = useMemo(() => createNotesImageInsertActions(showToast), [showToast])

  const cancelEdit = () => {
    setTitle(note.title)
    setContent(note.content)
    setVisibility(note.visibility)
    setTagsText(serializeNoteHashtags(note.tags))
    setAllowedUsers(note.allowedUsers || [])
    setError(null)
    setSharePopoverOpen(false)
    setIsEditing(false)
  }

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    try {
      const tags = parseNoteHashtags(tagsText)

      await onSave(note.id, {
        title,
        content,
        visibility,
        tags,
        allowedUsers: visibility === NoteVisibility.CUSTOM ? allowedUsers : [],
      })
      setIsEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save note')
    } finally {
      setIsSaving(false)
    }
  }

  const handleStartShareEdit = () => {
    setTitle(note.title)
    setContent(note.content)
    setVisibility(note.visibility)
    setTagsText(serializeNoteHashtags(note.tags))
    setAllowedUsers(note.allowedUsers || [])
    setError(null)
    setIsEditing(true)
    setSharePopoverOpen(true)
  }

  const handleDelete = async () => {
    setIsSaving(true)
    setError(null)
    try {
      await onDelete(note.id)
      setShowDeleteConfirm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete note')
    } finally {
      setIsSaving(false)
    }
  }

  const handlePublish = async () => {
    setIsSaving(true)
    setError(null)
    try {
      await onPublish(note.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish note')
    } finally {
      setIsSaving(false)
    }
  }

  const setAudienceVisibility = (nextVisibility: NoteVisibility) => {
    setVisibility(nextVisibility)
    if (nextVisibility !== NoteVisibility.CUSTOM) {
      setAllowedUsers([])
    }
  }

  const toSharedWithLabel = (currentVisibility: NoteVisibility, currentAllowedUsers: UUID[]) => {
    if (currentVisibility === NoteVisibility.DM_ONLY) {
      return 'None'
    }

    if (currentVisibility === NoteVisibility.PLAYERS_VISIBLE) {
      return 'Everyone'
    }

    if (currentAllowedUsers.length === 0) {
      return 'Limited (none selected)'
    }

    return currentAllowedUsers
      .map((userId) => formatNotesShareUserLabel(userId, shareUsers))
      .join(', ')
  }

  const sharedWithLabel = toSharedWithLabel(note.visibility, note.allowedUsers || [])
  const editingSharedWithLabel = toSharedWithLabel(visibility, allowedUsers)

  const publishedLabel = note.publishedAt ? new Date(note.publishedAt).toLocaleString() : null

  return (
    <TooltipProvider delayDuration={140}>
      <article className="notes-detail-card mb-3 rounded-ui-md border border-ui-border bg-ui-surface p-3">
        {isEditing ? (
          <>
            <div className="notes-edit-header">
              <div className="notes-edit-title-wrap">
                <label className="notes-edit-label" htmlFor={`note-title-${note.id}`}>
                  Note title
                </label>
                <input
                  id={`note-title-${note.id}`}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Handout title"
                  className="notes-edit-input"
                />
              </div>
              <div className="notes-edit-icon-actions">
                <NoteSharePopover
                  open={sharePopoverOpen}
                  onOpenChange={setSharePopoverOpen}
                  visibility={visibility}
                  allowedUsers={allowedUsers}
                  shareUsers={shareUsers}
                  shareRooms={shareRooms}
                  roomMemberIdsByRoomId={roomMemberIdsByRoomId}
                  onSetVisibility={setAudienceVisibility}
                  onSetAllowedUsers={setAllowedUsers}
                  triggerTooltip="Share"
                  trigger={
                    <button
                      type="button"
                      className="notes-edit-icon-button"
                      aria-label="Share handout"
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        group
                      </span>
                    </button>
                  }
                />

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={isSaving}
                      className="notes-edit-icon-button"
                      aria-label="Save handout"
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        {isSaving ? 'hourglass_top' : 'save'}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Save Note</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      disabled={isSaving}
                      className="notes-edit-secondary-button"
                      aria-label="Cancel editing"
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        close
                      </span>
                      <span>Cancel</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Cancel</TooltipContent>
                </Tooltip>
              </div>
            </div>

            <div className="mb-2">
              <MarkdownEditor
                value={content}
                onChange={setContent}
                placeholder="Write your handout"
                variant="full"
                insertActions={imageInsertActions}
              />
            </div>

            <div className="notes-edit-meta-row">
              <div className="notes-edit-meta-col">
                <label className="notes-edit-label" htmlFor={`note-hashtags-${note.id}`}>
                  Hashtags
                </label>
                <input
                  id={`note-hashtags-${note.id}`}
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  placeholder="#npc, #city, #quest"
                  className="notes-edit-input"
                />
              </div>
              <div className="notes-edit-meta-summary notes-edit-meta-summary--status">
                <NoteShareStatusIcon visibility={visibility} allowedUsers={allowedUsers} />
              </div>
            </div>

            <p className="mb-2 text-xs text-ui-secondary">Shared with: {editingSharedWithLabel}</p>

            {error && <p className="mb-2 text-sm text-ui-error-text">{error}</p>}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h4 className="m-0 text-base font-semibold text-ui-primary">{note.title}</h4>
              <div className="flex items-center gap-1.5">
                {note.publishedAt && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[11px] leading-[1.4] text-emerald-800">
                        Published
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top">Published {publishedLabel}</TooltipContent>
                  </Tooltip>
                )}
                <span className="text-xs text-ui-secondary">
                  {visibilityLabel[note.visibility]}
                </span>
              </div>
            </div>
            <div className="my-2">
              <MarkdownEditor value={note.content} readOnly variant="full" />
            </div>
            <p className="mb-2 text-xs text-ui-secondary">by {note.ownerUsername}</p>
            <p className="mb-2 text-xs text-ui-secondary">Shared with: {sharedWithLabel}</p>
            {note.publishedAt && (
              <p className="mb-2 text-xs text-emerald-700">Published to chat: {publishedLabel}</p>
            )}
            <div className="notes-card-meta-row">
              {note.tags.length > 0 ? (
                <p className="mb-0 text-xs text-slate-600">Tags: {note.tags.join(', ')}</p>
              ) : (
                <p className="mb-0 text-xs text-slate-600">Tags: No hashtags</p>
              )}
              <NoteShareStatusIcon
                visibility={note.visibility}
                allowedUsers={note.allowedUsers || []}
              />
            </div>
            {error && <p className="mb-2 text-sm text-ui-error-text">{error}</p>}
            {canEdit && (
              <div className="notes-card-actions flex gap-2">
                {canManageShare && (
                  <button
                    type="button"
                    onClick={handleStartShareEdit}
                    className="notes-card-action rounded-ui-sm border border-ui-border px-3 py-2 text-sm text-ui-primary"
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      group
                    </span>
                    Share
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="notes-card-action rounded-ui-sm border border-ui-border px-3 py-2 text-sm text-ui-primary"
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    edit
                  </span>
                  Edit
                </button>
                {canPublish && (
                  <button
                    type="button"
                    onClick={handlePublish}
                    disabled={isSaving || !!note.publishedAt}
                    className="notes-card-action notes-card-action--primary rounded-ui-sm bg-ui-brand px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      publish
                    </span>
                    {note.publishedAt ? 'Published' : isSaving ? 'Publishing...' : 'Publish'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isSaving}
                  className="notes-card-action notes-card-action--danger rounded-ui-sm bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    delete
                  </span>
                  {isSaving ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            )}
          </>
        )}
      </article>

      <DialogPrimitive.Root
        open={showDeleteConfirm}
        onOpenChange={(open) => {
          if (!isSaving) {
            setShowDeleteConfirm(open)
          }
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-1200 bg-slate-900/45" />
          <DialogPrimitive.Content className="fixed left-1/2 top-[42%] z-1201 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-ui-md border border-ui-border bg-ui-surface p-4 shadow-xl">
            <DialogPrimitive.Title className="text-base font-semibold text-ui-primary">
              Delete Note
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-2 text-sm text-ui-secondary">
              Delete this note? This action cannot be undone.
            </DialogPrimitive.Description>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isSaving}
                className="rounded-ui-sm border border-ui-border px-3 py-2 text-sm text-ui-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isSaving}
                className="rounded-ui-sm bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {isSaving ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </TooltipProvider>
  )
}
