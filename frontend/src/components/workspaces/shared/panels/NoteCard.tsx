import { useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { NoteVisibility } from '@shared'
import type { UUID, Role, RoomType } from '@shared'
import type { Note } from '@/types/notes'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import { MarkdownEditor } from '@/components/workspaces/shared/panels/MarkdownEditor'

interface NoteCardProps {
  note: Note
  canEdit: boolean
  canPublish: boolean
  shareUsers?: Array<{ id: UUID; username: string; role: Role | string }>
  shareRooms?: Array<{ id: UUID; name: string; type: RoomType }>
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
  const [tagsText, setTagsText] = useState(note.tags.join(', '))
  const [selectedShareUserId, setSelectedShareUserId] = useState('')
  const [selectedShareRoomId, setSelectedShareRoomId] = useState('')
  const [allowedUsers, setAllowedUsers] = useState<string[]>(note.allowedUsers || [])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const cancelEdit = () => {
    setTitle(note.title)
    setContent(note.content)
    setVisibility(note.visibility)
    setTagsText(note.tags.join(', '))
    setAllowedUsers(note.allowedUsers || [])
    setSelectedShareUserId('')
    setSelectedShareRoomId('')
    setError(null)
    setIsEditing(false)
  }

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    try {
      const tags = tagsText
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)

      await onSave(note.id, {
        title,
        content,
        visibility,
        tags,
        allowedUsers: visibility === NoteVisibility.CUSTOM ? (allowedUsers as any) : [],
      })
      setIsEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save note')
    } finally {
      setIsSaving(false)
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

  const addAllowedUsers = (candidateIds: string[]) => {
    const nextIds = candidateIds.map((candidateId) => candidateId.trim()).filter(Boolean)
    if (nextIds.length === 0) return

    setAllowedUsers((current) => Array.from(new Set([...current, ...nextIds])))
  }

  const addAllowedUser = (candidate: string) => {
    addAllowedUsers([candidate])
  }

  const handleAddSelectedUser = () => {
    const candidate = selectedShareUserId.trim()
    if (!candidate) return
    addAllowedUser(candidate)
    setSelectedShareUserId('')
  }

  const handleAddSelectedRoom = () => {
    const roomId = selectedShareRoomId.trim() as UUID
    if (!roomId) return
    addAllowedUsers(roomMemberIdsByRoomId[roomId] || [])
    setSelectedShareRoomId('')
  }

  const removeAllowedUser = (userId: string) => {
    setAllowedUsers((prev) => prev.filter((id) => id !== userId))
  }

  const sharedWithLabel =
    note.visibility === NoteVisibility.DM_ONLY
      ? 'DM only'
      : note.visibility === NoteVisibility.PLAYERS_VISIBLE
        ? 'All players'
        : note.allowedUsers && note.allowedUsers.length > 0
          ? note.allowedUsers
              .map(
                (userId) =>
                  shareUsers.find((candidate) => candidate.id === userId)?.username || userId
              )
              .join(', ')
          : 'Custom list (none selected)'

  const publishedLabel = note.publishedAt ? new Date(note.publishedAt).toLocaleString() : null

  return (
    <TooltipProvider delayDuration={140}>
      <article className="notes-detail-card mb-3 rounded-ui-md border border-ui-border bg-ui-surface p-3">
        {isEditing ? (
          <>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Note title"
              className="mb-2 w-full rounded-ui-sm border border-ui-border-soft bg-ui-surface px-3 py-2 text-sm text-ui-primary"
            />
            <div className="mb-2">
              <MarkdownEditor
                value={content}
                onChange={setContent}
                placeholder="Write your note"
                variant="full"
              />
            </div>
            <div className="mb-2 flex gap-2">
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as NoteVisibility)}
                className="flex-1 rounded-ui-sm border border-ui-border-soft bg-ui-surface px-3 py-2 text-sm text-ui-primary"
              >
                <option value={NoteVisibility.PLAYERS_VISIBLE}>Shared</option>
                <option value={NoteVisibility.CUSTOM}>Custom</option>
                <option value={NoteVisibility.DM_ONLY}>DM Only</option>
              </select>
              <input
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                placeholder="tag1, tag2"
                className="flex-2 rounded-ui-sm border border-ui-border-soft bg-ui-surface px-3 py-2 text-sm text-ui-primary"
              />
            </div>
            {visibility === NoteVisibility.CUSTOM && (
              <div className="mb-2">
                <div className="mb-1.5 flex gap-2">
                  <select
                    value={selectedShareUserId}
                    onChange={(e) => setSelectedShareUserId(e.target.value)}
                    className="flex-1 rounded-ui-sm border border-ui-border-soft bg-ui-surface px-3 py-2 text-sm text-ui-primary"
                  >
                    <option value="">Share with player</option>
                    {shareUsers.map((shareUser) => (
                      <option key={shareUser.id} value={shareUser.id}>
                        {shareUser.username}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAddSelectedUser}
                    disabled={!selectedShareUserId}
                    className="rounded-ui-sm border border-ui-border px-3 py-2 text-sm text-ui-primary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Add
                  </button>
                </div>
                <div className="mb-1.5 flex gap-2">
                  <select
                    value={selectedShareRoomId}
                    onChange={(e) => setSelectedShareRoomId(e.target.value)}
                    className="flex-1 rounded-ui-sm border border-ui-border-soft bg-ui-surface px-3 py-2 text-sm text-ui-primary"
                  >
                    <option value="">Share with everyone in group</option>
                    {shareRooms.map((shareRoom) => (
                      <option key={shareRoom.id} value={shareRoom.id}>
                        {shareRoom.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAddSelectedRoom}
                    disabled={!selectedShareRoomId}
                    className="rounded-ui-sm border border-ui-border px-3 py-2 text-sm text-ui-primary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Add group
                  </button>
                </div>
                {shareRooms.length === 0 ? (
                  <p className="mb-1.5 text-xs text-ui-secondary">
                    No shareable groups are available in the current campaign context yet.
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-1.5">
                  {allowedUsers.map((userId) => (
                    <Tooltip key={userId}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => removeAllowedUser(userId)}
                          className="rounded-full border border-ui-border-soft bg-ui-surface-subtle px-2 py-1 text-xs text-ui-secondary"
                        >
                          {shareUsers.find((u) => u.id === userId)?.username || userId} x
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Click to remove</TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </div>
            )}
            {error && <p className="mb-2 text-sm text-ui-error-text">{error}</p>}
            <div className="notes-card-actions flex gap-2">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="notes-card-action notes-card-action--primary rounded-ui-sm bg-ui-brand px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={cancelEdit}
                disabled={isSaving}
                className="notes-card-action rounded-ui-sm border border-ui-border px-3 py-2 text-sm text-ui-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
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
            {note.tags.length > 0 && (
              <p className="mb-2 text-xs text-slate-600">Tags: {note.tags.join(', ')}</p>
            )}
            {error && <p className="mb-2 text-sm text-ui-error-text">{error}</p>}
            {canEdit && (
              <div className="notes-card-actions flex gap-2">
                <button
                  onClick={() => setIsEditing(true)}
                  className="notes-card-action rounded-ui-sm border border-ui-border px-3 py-2 text-sm text-ui-primary"
                >
                  Edit
                </button>
                {canPublish && (
                  <button
                    onClick={handlePublish}
                    disabled={isSaving || !!note.publishedAt}
                    className="notes-card-action notes-card-action--primary rounded-ui-sm bg-ui-brand px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {note.publishedAt ? 'Published' : isSaving ? 'Publishing...' : 'Publish'}
                  </button>
                )}
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isSaving}
                  className="notes-card-action notes-card-action--danger rounded-ui-sm bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                >
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
