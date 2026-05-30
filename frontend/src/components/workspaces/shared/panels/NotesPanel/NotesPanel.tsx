import { useEffect, useMemo, useState, type SubmitEventHandler } from 'react'
import {
  NoteVisibility,
  Role,
  RoomType,
  isGreenroomSessionState,
  type NoteAttachmentEntity,
  type SessionState,
  type UUID,
} from '@shared'
import { Icon } from '@/components/ui/Icon'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import { useStore } from '@/hooks/useStore'
import type { Note } from '@/types/notes'
import type { NotesPublishTarget } from '@/types/notesPublish'
import { fetchCampaignNotesOnce } from '@/utils/notesFetch'
import { useNotesShareContext } from '@/hooks/notes/useNotesShareContext'
import { isJournalNote, parseNoteHashtags } from '../../../../../utils/notesPanel'
import { NoteCard } from './NoteCard'
import { NotesCreateForm } from './NotesCreateForm'
import { NotesListWidget } from './NotesListWidget'
import { NotesPanelToolbar, type NotesPublishFilter } from './NotesPanelToolbar'
import '@/styles/components/workspaces/shared/panels/KnowledgePanels.css'

interface NotesPanelProps {
  apiUrl: string
  token: string
  campaignId: UUID
  sessionId?: UUID | null
  currentSessionState?: SessionState | null
  compactPicker?: boolean
  user: { id: UUID; role: Role | string }
}

const JOURNAL_TAG = '_journal'

function toHandoutTags(tagsText: string): string[] {
  return parseNoteHashtags(tagsText).filter((tag) => tag.toLowerCase() !== JOURNAL_TAG)
}

export function NotesPanel({
  apiUrl,
  token,
  campaignId,
  sessionId,
  currentSessionState,
  compactPicker = false,
  user,
}: NotesPanelProps) {
  const notesByCampaign = useStore((state) => (state.notes as any)[campaignId]) as
    | Record<UUID, Note>
    | undefined
  const addNote = useStore((state) => state.addNote)
  const clearNotes = useStore((state) => state.clearNotes)
  const updateNote = useStore((state) => state.updateNote)
  const deleteNote = useStore((state) => state.deleteNote)
  const notes = useMemo(
    () =>
      Object.values(notesByCampaign || {})
        .filter((note) => !isJournalNote(note))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [notesByCampaign]
  )

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [visibility, setVisibility] = useState<NoteVisibility>(NoteVisibility.DM_ONLY)
  const [tagsText, setTagsText] = useState('')
  const [attachments, setAttachments] = useState<NoteAttachmentEntity[]>([])
  const { shareUsers, shareRooms, roomMemberIdsByRoomId } = useNotesShareContext({
    apiUrl,
    token,
    campaignId,
    sessionId,
    currentUserId: user.id,
  })
  const [allowedUsers, setAllowedUsers] = useState<UUID[]>([])
  const [isCreating, setIsCreating] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [publishFilter, setPublishFilter] = useState<NotesPublishFilter>('ALL')
  const [selectedNoteId, setSelectedNoteId] = useState<UUID | null>(null)
  const [activeHashtagFilter, setActiveHashtagFilter] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const canMutateNotes = user.role === Role.DM
  const publishRooms = useMemo(
    () =>
      shareRooms.filter((room) => {
        const memberCount = roomMemberIdsByRoomId[room.id]?.length || 0
        return memberCount > 0 && (room.type === RoomType.MAIN || room.type === RoomType.GROUP)
      }),
    [roomMemberIdsByRoomId, shareRooms]
  )

  const displayedNotes = useMemo(() => {
    const byPublishFilter =
      publishFilter === 'SHARED'
        ? notes.filter((note) => Boolean(note.publishedAt))
        : publishFilter === 'UNSHARED'
          ? notes.filter((note) => !note.publishedAt)
          : notes

    const normalizedSearchQuery = searchQuery.trim().toLowerCase()
    const bySearchQuery = normalizedSearchQuery
      ? byPublishFilter.filter((note) => {
          const searchableFields = [note.title, note.content, ...note.tags].join(' ').toLowerCase()
          return searchableFields.includes(normalizedSearchQuery)
        })
      : byPublishFilter

    if (!activeHashtagFilter) {
      return bySearchQuery
    }

    return bySearchQuery.filter((note) =>
      note.tags.some((tag) => {
        const normalized = tag.startsWith('#') ? tag : `#${tag}`
        return normalized.toLowerCase() === activeHashtagFilter.toLowerCase()
      })
    )
  }, [activeHashtagFilter, notes, publishFilter, searchQuery])

  const emptyStateMessage = searchQuery.trim()
    ? `No handouts match "${searchQuery.trim()}".`
    : activeHashtagFilter
      ? `No handouts tagged ${activeHashtagFilter}.`
      : publishFilter === 'SHARED'
        ? 'No shared handouts yet.'
        : publishFilter === 'UNSHARED'
          ? 'No unshared handouts yet.'
          : 'No handouts yet.'

  const isPublishDisabledInCurrentState =
    !currentSessionState || isGreenroomSessionState(currentSessionState)

  const handleToggleCreateForm = () => {
    if (!canMutateNotes) {
      return
    }

    if (!showCreateForm) {
      setVisibility(NoteVisibility.DM_ONLY)
      setAllowedUsers([])
      setAttachments([])
    }

    setShowCreateForm((current) => !current)
  }

  const selectedNote = useMemo(
    () => displayedNotes.find((note) => note.id === selectedNoteId) ?? displayedNotes[0] ?? null,
    [displayedNotes, selectedNoteId]
  )

  useEffect(() => {
    let cancelled = false

    const loadNotes = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const fetchedNotes = await fetchCampaignNotesOnce(apiUrl, campaignId, token)
        if (!cancelled) {
          clearNotes(campaignId)
          for (const note of fetchedNotes) {
            addNote(campaignId, note)
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load notes')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadNotes()
    return () => {
      cancelled = true
    }
  }, [addNote, apiUrl, campaignId, clearNotes, token])

  const handleCreate: SubmitEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault()
    setError(null)
    setIsCreating(true)

    try {
      const tags = toHandoutTags(tagsText)

      const res = await fetch(`${apiUrl}/api/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          campaignId,
          title,
          content,
          visibility,
          tags,
          allowedUsers: visibility === NoteVisibility.CUSTOM ? allowedUsers : [],
          attachments,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message ?? `HTTP ${res.status}`)
      }

      const data = await res.json()
      const note = data.note
      const createdNoteId = note.id as UUID
      addNote(campaignId, {
        id: createdNoteId,
        ownerId: note.authorId,
        ownerUsername: note.authorUsername,
        title: note.title,
        content: note.content,
        visibility: note.visibility,
        tags: note.tags || [],
        allowedUsers: note.allowedUsers || [],
        attachments: note.attachments || [],
        publishedAt: note.publishedAt,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      })
      setSelectedNoteId(createdNoteId)
      setShowCreateForm(false)

      setTitle('')
      setContent('')
      setTagsText('')
      setVisibility(NoteVisibility.DM_ONLY)
      setAllowedUsers([])
      setAttachments([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create note')
    } finally {
      setIsCreating(false)
    }
  }

  const handleSave = async (
    noteId: string,
    updates: Partial<
      Pick<Note, 'title' | 'content' | 'visibility' | 'tags' | 'allowedUsers' | 'attachments'>
    >
  ) => {
    const requestUpdates = {
      ...updates,
      tags:
        updates.tags !== undefined
          ? updates.tags.filter((tag) => tag.toLowerCase() !== JOURNAL_TAG)
          : undefined,
    }

    const res = await fetch(`${apiUrl}/api/notes/${noteId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        campaignId,
        ...requestUpdates,
      }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.message ?? `HTTP ${res.status}`)
    }

    const data = await res.json()
    const note = data.note
    updateNote(campaignId, note.id, {
      title: note.title,
      content: note.content,
      visibility: note.visibility,
      tags: note.tags || [],
      allowedUsers: note.allowedUsers || [],
      attachments: note.attachments || [],
      publishedAt: note.publishedAt,
      updatedAt: note.updatedAt,
    })
  }

  const handlePublish = async (noteId: string, target: NotesPublishTarget) => {
    const res = await fetch(`${apiUrl}/api/notes/${noteId}/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(target),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.message ?? `HTTP ${res.status}`)
    }
  }

  const handleDelete = async (noteId: string) => {
    const res = await fetch(`${apiUrl}/api/notes/${noteId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.message ?? `HTTP ${res.status}`)
    }

    deleteNote(campaignId, noteId as UUID)
    if (selectedNoteId === (noteId as UUID)) {
      setSelectedNoteId(null)
    }
  }

  return (
    <section
      className={`knowledge-panel knowledge-panel--compact notes-workspace${compactPicker ? ' notes-workspace--compact-picker' : ''}`}
    >
      <header className="knowledge-panel-header notes-workspace-header">
        <div className="notes-workspace-header__title-row">
          <h3 className="notes-workspace-header__title">
            <Icon name="notes" />
            Handouts
          </h3>
          {canMutateNotes ? (
            <TooltipProvider delayDuration={140}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="notes-toolbar-segment notes-toolbar-segment--icon"
                    onClick={handleToggleCreateForm}
                    aria-label={showCreateForm ? 'Hide handout creator' : 'Create handout'}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      {showCreateForm ? 'visibility_off' : 'note_add'}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {showCreateForm ? 'Hide handout creator' : 'Create handout'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
        </div>
        <p className="notes-workspace-header__subtitle">
          Draft handouts, organize references, and share player-ready notes.
        </p>
      </header>

      {error ? <p className="m-3 text-sm text-ui-error-text">{error}</p> : null}

      <NotesPanelToolbar
        publishFilter={publishFilter}
        searchQuery={searchQuery}
        activeHashtagFilter={activeHashtagFilter}
        onSetPublishFilter={setPublishFilter}
        onSetSearchQuery={setSearchQuery}
        onClearHashtagFilter={() => setActiveHashtagFilter(null)}
      />

      {canMutateNotes && showCreateForm ? (
        <NotesCreateForm
          campaignId={campaignId}
          title={title}
          content={content}
          visibility={visibility}
          allowedUsers={allowedUsers}
          attachments={attachments}
          tagsText={tagsText}
          shareUsers={shareUsers}
          shareRooms={shareRooms}
          roomMemberIdsByRoomId={roomMemberIdsByRoomId}
          isCreating={isCreating}
          onSubmit={handleCreate}
          onTitleChange={setTitle}
          onContentChange={setContent}
          onVisibilityChange={setVisibility}
          onAllowedUsersChange={setAllowedUsers}
          onAttachmentsChange={setAttachments}
          onTagsTextChange={setTagsText}
        />
      ) : null}

      <div className="notes-workspace-content workspace-panel-scroll-region">
        {isLoading ? (
          <p className="text-sm text-ui-secondary">Loading handouts...</p>
        ) : displayedNotes.length === 0 ? (
          <div className="ui-empty-panel ui-empty-panel--fill" role="status">
            <span className="material-symbols-outlined" aria-hidden="true">
              auto_awesome
            </span>
            <span>{emptyStateMessage}</span>
          </div>
        ) : (
          <div className="notes-workspace-grid">
            <NotesListWidget
              notes={displayedNotes}
              selectedNoteId={selectedNote?.id || null}
              onSelectNote={setSelectedNoteId}
              activeHashtagFilter={activeHashtagFilter}
              onTagSelect={setActiveHashtagFilter}
            />

            <section className="notes-detail-widget" aria-label="Selected note">
              {selectedNote ? (
                <NoteCard
                  key={selectedNote.id}
                  campaignId={campaignId}
                  note={selectedNote}
                  shareUsers={shareUsers}
                  shareRooms={shareRooms}
                  publishRooms={publishRooms}
                  roomMemberIdsByRoomId={roomMemberIdsByRoomId}
                  canEdit={canMutateNotes}
                  canManageShare={canMutateNotes}
                  canPublish={canMutateNotes}
                  isPublishDisabled={isPublishDisabledInCurrentState}
                  onSave={handleSave}
                  onDelete={handleDelete}
                  onPublish={handlePublish}
                />
              ) : null}
            </section>
          </div>
        )}
      </div>
    </section>
  )
}
