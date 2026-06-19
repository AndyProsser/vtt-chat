import { useEffect, useMemo, useState } from 'react'
import { NoteVisibility } from '@shared'
import type { NoteAttachmentEntity, UUID } from '@shared'
import type { Note } from '@/types/notes'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import { MarkdownEditor } from '@/components/workspaces/shared/panels/MarkdownEditor'
import { useToast } from '@/hooks/useToast'
import type { NotesShareRoom, NotesShareUser } from '@/types/notesShare'
import type { NotesSurfaceTarget } from '@/types/notesPublish'
import { createNotesImageInsertActions } from '@/utils/notesImageInsertActions'
import { getNoteShareStatus, parseNoteHashtags, serializeNoteHashtags } from '@/utils/notesPanel'
import { openNotePopout } from '@/utils/route-view'
import { HashtagAutocompleteInput } from './HashtagAutocompleteInput'
import { NoteAttachmentsGallery } from './NoteAttachmentsGallery'
import { NoteDeleteDialog } from './NoteDeleteDialog'
import { NoteSurfaceDialog } from './NoteSurfaceDialog'
import { NoteSharePopover } from './NoteSharePopover'
import { areStringArraysEqual, areUuidArraysEqual } from './noteCard.utils'
import { Icon } from '@/components/ui/Icon'

const EMPTY_UUIDS: UUID[] = []
const EMPTY_ATTACHMENTS: NoteAttachmentEntity[] = []

function areAttachmentsEqual(a: NoteAttachmentEntity[], b: NoteAttachmentEntity[]): boolean {
  if (a === b) {
    return true
  }
  if (a.length !== b.length) {
    return false
  }

  for (let index = 0; index < a.length; index += 1) {
    const left = a[index]
    const right = b[index]
    if (
      left.id !== right.id ||
      left.name !== right.name ||
      left.mime !== right.mime ||
      left.uri !== right.uri
    ) {
      return false
    }
  }

  return true
}

interface NoteCardProps {
  note: Note
  apiUrl?: string
  token?: string
  canEdit: boolean
  canManageShare: boolean
  canPublish: boolean
  isPublishDisabled: boolean
  isSharingDisabled: boolean
  shareUsers?: NotesShareUser[]
  shareRooms?: NotesShareRoom[]
  roomMemberIdsByRoomId?: Record<UUID, UUID[]>
  onSave: (
    noteId: string,
    updates: Partial<
      Pick<Note, 'title' | 'content' | 'visibility' | 'tags' | 'allowedUsers' | 'attachments'>
    >
  ) => Promise<void>
  onDelete: (noteId: string) => Promise<void>
  onSurface: (noteId: string, target: NotesSurfaceTarget) => Promise<void>
}

export function NoteCard({
  note,
  apiUrl,
  token,
  canEdit,
  canManageShare,
  canPublish,
  isPublishDisabled,
  isSharingDisabled,
  shareUsers = [],
  shareRooms = [],
  roomMemberIdsByRoomId = {},
  onSave,
  onDelete,
  onSurface,
}: NoteCardProps) {
  const noteAllowedUsers = note.allowedUsers ?? EMPTY_UUIDS
  const noteAttachments = note.attachments ?? EMPTY_ATTACHMENTS
  const noteTagsText = useMemo(() => serializeNoteHashtags(note.tags), [note.tags])

  const [isEditing, setIsEditing] = useState(false)
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState(note.content)
  const [visibility, setVisibility] = useState<NoteVisibility>(note.visibility)
  const [tagsText, setTagsText] = useState(noteTagsText)
  const [allowedUsers, setAllowedUsers] = useState<UUID[]>(noteAllowedUsers)
  const [attachments, setAttachments] = useState<NoteAttachmentEntity[]>(noteAttachments)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [surfaceError, setSurfaceError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [sharePopoverOpen, setSharePopoverOpen] = useState(false)
  const [surfaceDialogOpen, setSurfaceDialogOpen] = useState(false)
  const [hasPublishedThisSession, setHasPublishedThisSession] = useState(Boolean(note.publishedAt))
  const showToast = useToast()
  const imageInsertActions = useMemo(() => createNotesImageInsertActions(showToast), [showToast])

  const syncDraftFromNote = () => {
    setTitle((current) => (current === note.title ? current : note.title))
    setContent((current) => (current === note.content ? current : note.content))
    setVisibility((current) => (current === note.visibility ? current : note.visibility))
    setTagsText((current) => (current === noteTagsText ? current : noteTagsText))
    setAllowedUsers((current) =>
      areUuidArraysEqual(current, noteAllowedUsers) ? current : [...noteAllowedUsers]
    )
    setAttachments((current) =>
      areAttachmentsEqual(current, noteAttachments) ? current : [...noteAttachments]
    )
  }

  useEffect(() => {
    if (!isEditing && !sharePopoverOpen && !isSaving) {
      syncDraftFromNote()
    }
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- syncDraftFromNote is not memoised; adding it would cause an infinite re-render loop
  }, [
    isEditing,
    isSaving,
    note.allowedUsers,
    noteAttachments,
    note.content,
    note.tags,
    note.title,
    noteAllowedUsers,
    noteTagsText,
    note.visibility,
    sharePopoverOpen,
  ])

  useEffect(() => {
    if (note.publishedAt) {
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
    !areUuidArraysEqual(normalizedAllowedUsers, noteAllowedUsers) ||
    !areAttachmentsEqual(attachments, noteAttachments)

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
        attachments,
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

  const handleConfirmSurface = async (target: NotesSurfaceTarget) => {
    if (isPublishDisabled) {
      return
    }

    setIsSaving(true)
    setSurfaceError(null)
    try {
      await onSurface(note.id, target)
      setHasPublishedThisSession(true)
      setSurfaceDialogOpen(false)
    } catch (err) {
      setSurfaceError(err instanceof Error ? err.message : 'Failed to send handout')
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
      <article className="notes-detail-card rounded-ui-md border border-ui-border bg-ui-surface p-2">
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
            {apiUrl && token ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => openNotePopout(note.id, token, apiUrl)}
                    className="notes-note-header-action"
                    aria-label="Pop out note"
                  >
                    <Icon name="open_in_new" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Open in separate window</TooltipContent>
              </Tooltip>
            ) : null}

            {canPublish && !isEditing ? (
              <NoteSurfaceDialog
                open={surfaceDialogOpen}
                isSubmitting={isSaving}
                shareUsers={shareUsers}
                error={surfaceError}
                trigger={
                  <button
                    type="button"
                    disabled={isSaving || isPublishDisabled}
                    className={`notes-note-header-action notes-note-header-action--publish${hasPublishedThisSession ? ' is-published' : ''}`}
                    aria-label="Publish handout to chat"
                  >
                    <Icon name="publish" />
                  </button>
                }
                triggerTooltip={
                  isPublishDisabled
                    ? 'Unavailable in greenroom'
                    : hasPublishedThisSession
                      ? 'Sent this session (click to send again)'
                      : 'Send handout to chat'
                }
                onOpenChange={(open) => {
                  setSurfaceDialogOpen(open)
                  if (!open) setSurfaceError(null)
                }}
                onConfirmSurface={handleConfirmSurface}
              />
            ) : null}

            {canManageShare && !isEditing ? (
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
                    disabled={isSaving || isSharingDisabled || !canEdit}
                    aria-label="Share handout"
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      {shareStatus.icon}
                    </span>
                  </button>
                }
              />
            ) : null}

            {isEditing ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={isSaving}
                    className="notes-note-header-action notes-note-header-action--delete"
                    aria-label="Delete handout"
                  >
                    <Icon name="delete" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Delete handout</TooltipContent>
              </Tooltip>
            ) : null}

            {canEdit ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => void handleEditSaveToggle()}
                    disabled={isSaving}
                    className={`notes-note-header-action${isEditing && hasDraftChanges ? ' notes-note-header-action--dirty' : ''}`}
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
                <HashtagAutocompleteInput
                  id={`note-hashtags-${note.id}`}
                  value={tagsText}
                  onChange={setTagsText}
                  campaignId={note.campaignId}
                  placeholder="#npc, #city, #quest"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="notes-note-body">
            <MarkdownEditor
              key={`${note.id}:${note.updatedAt}:${note.content.length}`}
              value={note.content}
              readOnly
              variant="full"
            />
            <NoteAttachmentsGallery attachments={note.attachments} />
            <div className="knowledge-panel-chip-row">
              {saveDraftTags.map((tag) => (
                <span key={tag} className="knowledge-panel-chip muted">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

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
