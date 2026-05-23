import { useEffect, useMemo, useState, type SubmitEventHandler } from 'react'
import { NoteVisibility, Role, type UUID } from '@shared'
import { Icon } from '@/components/ui/Icon'
import { useStore } from '@/hooks/useStore'
import type { Note } from '@/types/notes'
import { fetchCampaignNotesOnce } from '@/utils/notesFetch'
import { useNotesShareContext } from '@/hooks/notes/useNotesShareContext'
import { NoteCard } from './NoteCard'
import { NotesCreateForm } from './NotesCreateForm'
import { NotesListWidget } from './NotesListWidget'
import '@/styles/components/workspaces/shared/panels/KnowledgePanels.css'

interface NotesPanelProps {
  apiUrl: string
  token: string
  campaignId: UUID
  sessionId?: UUID | null
  user: { id: UUID; role: Role | string }
}

const JOURNAL_TAG = '_journal'

function isJournalNote(note: Note): boolean {
  const normalizedTitle = note.title.trim().toLowerCase()
  return (
    (note.tags || []).includes(JOURNAL_TAG) ||
    normalizedTitle === 'session journal' ||
    normalizedTitle.startsWith('journal - ')
  )
}

function toHandoutTags(tagsText: string): string[] {
  return tagsText
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag) => tag.toLowerCase() !== JOURNAL_TAG)
}

export function NotesPanel({ apiUrl, token, campaignId, sessionId, user }: NotesPanelProps) {
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
  const [visibility, setVisibility] = useState<NoteVisibility>(NoteVisibility.PLAYERS_VISIBLE)
  const [tagsText, setTagsText] = useState('')
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
  const [showPublishedOnly, setShowPublishedOnly] = useState(false)
  const [selectedNoteId, setSelectedNoteId] = useState<UUID | null>(null)

  const displayedNotes = useMemo(
    () => (showPublishedOnly ? notes.filter((note) => Boolean(note.publishedAt)) : notes),
    [notes, showPublishedOnly]
  )

  const selectedNote = useMemo(
    () => displayedNotes.find((note) => note.id === selectedNoteId) ?? displayedNotes[0] ?? null,
    [displayedNotes, selectedNoteId]
  )

  const getSharedWithLabel = (note: Note): string => {
    if (note.visibility === NoteVisibility.DM_ONLY) {
      return 'DM only'
    }

    if (note.visibility === NoteVisibility.PLAYERS_VISIBLE) {
      return 'All players'
    }

    const names = (note.allowedUsers || []).map(
      (userId) => shareUsers.find((candidate) => candidate.id === userId)?.username || userId
    )

    if (names.length === 0) {
      return 'Custom list'
    }

    return names.join(', ')
  }

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
          sessionId,
          title,
          content,
          visibility,
          tags,
          allowedUsers: visibility === NoteVisibility.CUSTOM ? allowedUsers : [],
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
        publishedAt: note.publishedAt,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      })
      setSelectedNoteId(createdNoteId)
      setShowCreateForm(false)

      setTitle('')
      setContent('')
      setTagsText('')
      setVisibility(NoteVisibility.PLAYERS_VISIBLE)
      setAllowedUsers([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create note')
    } finally {
      setIsCreating(false)
    }
  }

  const handleSave = async (
    noteId: string,
    updates: Partial<Pick<Note, 'title' | 'content' | 'visibility' | 'tags' | 'allowedUsers'>>
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
      body: JSON.stringify(requestUpdates),
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
      publishedAt: note.publishedAt,
      updatedAt: note.updatedAt,
    })
  }

  const handlePublish = async (noteId: string) => {
    const res = await fetch(`${apiUrl}/api/notes/${noteId}/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
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
    <section className="notes-workspace">
      <header className="notes-workspace-header">
        <h3 className="notes-workspace-header__title">
          <Icon name="notes" />
          Handouts
        </h3>
        <p className="notes-workspace-header__subtitle">
          Draft handouts, organize references, and share player-ready notes.
        </p>
      </header>

      {error ? <p className="m-3 text-sm text-ui-error-text">{error}</p> : null}

      <div className="notes-workspace-toolbar">
        <button
          type="button"
          className="notes-toolbar-button"
          onClick={() => setShowCreateForm((current) => !current)}
        >
          {showCreateForm ? 'Hide create' : 'Create handout'}
        </button>

        <label className="notes-toolbar-toggle">
          <input
            type="checkbox"
            checked={showPublishedOnly}
            onChange={(event) => setShowPublishedOnly(event.target.checked)}
          />
          Show published only
        </label>

        <span className="notes-toolbar-count">
          {showPublishedOnly ? `${displayedNotes.length} published` : `${notes.length} total`}
        </span>
      </div>

      {showCreateForm ? (
        <NotesCreateForm
          title={title}
          content={content}
          visibility={visibility}
          allowedUsers={allowedUsers}
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
          onTagsTextChange={setTagsText}
        />
      ) : null}

      <div className="notes-workspace-content">
        {isLoading ? (
          <p className="text-sm text-ui-secondary">Loading handouts...</p>
        ) : displayedNotes.length === 0 ? (
          <p className="text-sm text-ui-secondary">
            {showPublishedOnly
              ? 'No published handouts yet.'
              : 'No handouts yet. Session journals are shown in the Journal tab.'}
          </p>
        ) : (
          <div className="notes-workspace-grid">
            <NotesListWidget
              notes={displayedNotes}
              selectedNoteId={selectedNote?.id || null}
              onSelectNote={setSelectedNoteId}
              getSharedWithLabel={getSharedWithLabel}
            />

            <section className="notes-detail-widget" aria-label="Selected note">
              {selectedNote ? (
                <NoteCard
                  key={selectedNote.id}
                  note={selectedNote}
                  shareUsers={shareUsers}
                  shareRooms={shareRooms}
                  roomMemberIdsByRoomId={roomMemberIdsByRoomId}
                  canEdit={user.role === Role.DM || selectedNote.ownerId === user.id}
                  canPublish={user.role === Role.DM || selectedNote.ownerId === user.id}
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
