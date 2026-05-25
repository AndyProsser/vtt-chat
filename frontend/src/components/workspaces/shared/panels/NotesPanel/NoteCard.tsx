import { useEffect, useMemo, useState } from 'react'
import { NoteVisibility } from '@shared'
import type { UUID } from '@shared'
import type { Note } from '@/types/notes'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import { MarkdownEditor } from '@/components/workspaces/shared/panels/MarkdownEditor'
import { useToast } from '@/hooks/useToast'
import type { NotesShareRoom, NotesShareUser } from '@/types/notesShare'
import { createNotesImageInsertActions } from '@/utils/notesImageInsertActions'
import {
  getNoteShareStatus,
  parseNoteHashtags,
  serializeNoteHashtags,
} from '../../../../../utils/notesPanel'
import { NoteDeleteDialog } from './NoteDeleteDialog'
import { NoteSharePopover } from './NoteSharePopover'
import { areStringArraysEqual, areUuidArraysEqual } from './noteCard.utils'

interface NoteCardProps {
  note: Note
  canEdit: boolean
  canManageShare: boolean
  canPublish: boolean
  isPublishDisabled: boolean
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

export function NoteCard({
  note,
  canEdit,
  canManageShare,
  canPublish,
  isPublishDisabled,
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
  const [hasPublishedThisSession, setHasPublishedThisSession] = useState(Boolean(note.publishedAt))
  const showToast = useToast()
  const imageInsertActions = useMemo(() => createNotesImageInsertActions(showToast), [showToast])

  const syncDraftFromNote = () => {
    setTitle(note.title)
    setContent(note.content)
    setVisibility(note.visibility)
    setTagsText(serializeNoteHashtags(note.tags))
    setAllowedUsers(note.allowedUsers || [])
  }

  useEffect(() => {
    if (!isEditing && !sharePopoverOpen && !isSaving) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      syncDraftFromNote()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- syncDraftFromNote is not memoised; adding it would cause an infinite re-render loop
  }, [
    isEditing,
    isSaving,
    note.allowedUsers,
    note.content,
    note.tags,
    note.title,
    note.visibility,
    sharePopoverOpen,
  ])

  useEffect(() => {
    if (note.publishedAt) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHasPublishedThisSession(true)
    }
  }, [note.publishedAt])

  const saveDraftTags = useMemo(() => parseNoteHashtags(tagsText), [tagsText])
  const normalizedAllowedUsers = visibility === NoteVisibility.CUSTOM ? allowedUsers : []
  const hasDraftChanges =
    title !== note.title ||
    content !== note.content ||
    visibility !== note.visibility ||
    !areStringArraysEqual(saveDraftTags, note.tags) ||
    !areUuidArraysEqual(normalizedAllowedUsers, note.allowedUsers || [])

  const shareStatus = getNoteShareStatus(visibility, normalizedAllowedUsers)
  const persistDraft = async (exitEditAfterSave: boolean) => {
    if (!canEdit) {
      return
    }

    if (!hasDraftChanges) {
      if (exitEditAfterSave) {
        setIsEditing(false)
      }
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      await onSave(note.id, {
        title,
        content,
        visibility,
        tags: saveDraftTags,
        allowedUsers: normalizedAllowedUsers,
      })

      if (exitEditAfterSave) {
        setIsEditing(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save note')
    } finally {
      setIsSaving(false)
    }
  }

  const handleEditSaveToggle = async () => {
    if (isEditing) {
      await persistDraft(true)
      return
    }

    syncDraftFromNote()
    setError(null)
    setIsEditing(true)
  }

  const handleShareOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      if (!isEditing) {
        syncDraftFromNote()
      }
      setSharePopoverOpen(true)
      return
    }

    setSharePopoverOpen(false)
    if (hasDraftChanges && canEdit) {
      void persistDraft(false)
    }
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
    if (isPublishDisabled) {
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      await onPublish(note.id)
      setHasPublishedThisSession(true)
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

  return (
    <TooltipProvider delayDuration={140}>
      <article className="notes-detail-card rounded-ui-md border border-ui-border bg-ui-surface p-3">
        <div className="notes-note-header">
          <div className="notes-note-header__title-wrap">
            {isEditing ? (
              <input
                id={`note-title-${note.id}`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Handout title"
                className="notes-edit-input notes-note-header__title-input"
              />
            ) : (
              <h4 className="notes-note-header__title">{note.title}</h4>
            )}
            <p className="notes-note-header__meta">by {note.ownerUsername}</p>
          </div>

          <div className="notes-note-header__actions">
            {canManageShare ? (
              <NoteSharePopover
                open={sharePopoverOpen}
                onOpenChange={handleShareOpenChange}
                visibility={visibility}
                allowedUsers={normalizedAllowedUsers}
                shareUsers={shareUsers}
                shareRooms={shareRooms}
                roomMemberIdsByRoomId={roomMemberIdsByRoomId}
                onSetVisibility={setAudienceVisibility}
                onSetAllowedUsers={setAllowedUsers}
                triggerTooltip={shareStatus.tooltip}
                trigger={
                  <button
                    type="button"
                    className={`notes-note-header-action notes-note-header-action--tone-${shareStatus.tone}`}
                    disabled={isSaving || !canEdit}
                    aria-label="Share handout"
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      {shareStatus.icon}
                    </span>
                  </button>
                }
              />
            ) : null}

            {canEdit ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => void handleEditSaveToggle()}
                    disabled={isSaving}
                    className={`notes-note-header-action${hasDraftChanges ? ' notes-note-header-action--dirty' : ''}`}
                    aria-label={isEditing ? 'Save handout' : 'Edit handout'}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      {isSaving ? 'hourglass_top' : isEditing ? 'save' : 'edit'}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {isEditing
                    ? hasDraftChanges
                      ? 'Save changes'
                      : 'Finish editing'
                    : 'Edit handout'}
                </TooltipContent>
              </Tooltip>
            ) : null}

            {canPublish ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handlePublish}
                    disabled={isSaving || isPublishDisabled}
                    className={`notes-note-header-action notes-note-header-action--publish${hasPublishedThisSession ? ' is-published' : ''}`}
                    aria-label="Publish handout to chat"
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      publish
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {isPublishDisabled
                    ? 'Publish is unavailable in greenroom'
                    : hasPublishedThisSession
                      ? 'Published this session (click to publish again)'
                      : 'Publish to chat'}
                </TooltipContent>
              </Tooltip>
            ) : null}

            {canEdit && isEditing ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={isSaving}
                    className="notes-note-header-action notes-note-header-action--delete"
                    aria-label="Delete handout"
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      delete
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Delete handout</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        </div>

        {isEditing ? (
          <div className="notes-note-body">
            <MarkdownEditor
              value={content}
              onChange={setContent}
              placeholder="Write your handout"
              variant="full"
              insertActions={imageInsertActions}
            />
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
            </div>
          </div>
        ) : (
          <div className="notes-note-body">
            <MarkdownEditor value={note.content} readOnly variant="full" />
          </div>
        )}

        <div className="notes-card-meta-row">
          {saveDraftTags.length > 0 ? (
            <p className="mb-0 text-xs text-slate-600">Tags: {saveDraftTags.join(', ')}</p>
          ) : (
            <p className="mb-0 text-xs text-slate-600">Tags: No hashtags</p>
          )}
        </div>

        {error && <p className="mb-1 mt-2 text-sm text-ui-error-text">{error}</p>}
      </article>

      <NoteDeleteDialog
        open={showDeleteConfirm}
        isSaving={isSaving}
        onOpenChange={(open) => {
          if (!isSaving) {
            setShowDeleteConfirm(open)
          }
        }}
        onConfirmDelete={handleDelete}
      />
    </TooltipProvider>
  )
}
