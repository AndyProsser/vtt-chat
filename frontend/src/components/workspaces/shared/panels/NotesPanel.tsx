import { useEffect, useMemo, useState, type SubmitEventHandler } from 'react'
import { NoteVisibility, Role, RoomType, type UUID } from '@shared'
import { useStore } from '@/hooks/useStore'
import type { Note } from '@/types/notes'
import { fetchCampaignNotesOnce } from '@/utils/notesFetch'
import { NoteCard } from './NoteCard'
import { NotesCreateForm } from './NotesCreateForm'
import { NotesListWidget } from './NotesListWidget'

interface NotesPanelProps {
  apiUrl: string
  token: string
  campaignId: UUID
  sessionId?: UUID | null
  user: { id: UUID; role: Role | string }
}

interface SessionUserSummary {
  id: UUID
  username: string
  role: Role | string
}

interface SessionRoomShareOption {
  id: UUID
  name: string
  type: RoomType
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
    () => Object.values(notesByCampaign || {}).sort((a, b) => b.updatedAt - a.updatedAt),
    [notesByCampaign]
  )

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [visibility, setVisibility] = useState<NoteVisibility>(NoteVisibility.PLAYERS_VISIBLE)
  const [tagsText, setTagsText] = useState('')
  const [shareUsers, setShareUsers] = useState<SessionUserSummary[]>([])
  const [shareRooms, setShareRooms] = useState<SessionRoomShareOption[]>([])
  const [roomMemberIdsByRoomId, setRoomMemberIdsByRoomId] = useState<Record<UUID, UUID[]>>({})
  const [selectedShareUserId, setSelectedShareUserId] = useState('')
  const [selectedShareRoomId, setSelectedShareRoomId] = useState('')
  const [allowedUsers, setAllowedUsers] = useState<string[]>([])
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

  useEffect(() => {
    if (displayedNotes.length === 0) {
      setSelectedNoteId(null)
      return
    }

    const stillVisible = displayedNotes.some((note) => note.id === selectedNoteId)
    if (!stillVisible) {
      setSelectedNoteId(displayedNotes[0].id)
    }
  }, [displayedNotes, selectedNoteId])

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

  useEffect(() => {
    let cancelled = false

    const loadShareContext = async () => {
      try {
        const [partyRes, roomsRes] = await Promise.all([
          fetch(`${apiUrl}/api/campaigns/${campaignId}/party-presence`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          sessionId
            ? fetch(`${apiUrl}/api/rooms/session/${sessionId}`, {
                headers: { Authorization: `Bearer ${token}` },
              })
            : Promise.resolve(null),
        ])

        if (!partyRes.ok) {
          return
        }

        const membersData = await partyRes.json()
        const users = Array.isArray(membersData.members) ? membersData.members : []
        const playerUsers = users
          .filter(
            (candidate: { userId: UUID; username: string; role: Role | string }) =>
              candidate.userId !== user.id && candidate.role === Role.PLAYER
          )
          .map((candidate: { userId: UUID; username: string; role: Role | string }) => ({
            id: candidate.userId,
            username: candidate.username,
            role: candidate.role,
          }))

        let shareableRooms: SessionRoomShareOption[] = []
        let nextRoomMembers: Record<UUID, UUID[]> = {}

        if (roomsRes && roomsRes.ok) {
          const roomsData = await roomsRes.json()
          const rooms = Array.isArray(roomsData.rooms) ? roomsData.rooms : []
          shareableRooms = rooms.filter(
            (room: SessionRoomShareOption) =>
              room.type === RoomType.GROUP || room.type === RoomType.MAIN
          )

          const roomMemberEntries = await Promise.all(
            shareableRooms.map(async (room) => {
              try {
                const roomMembersRes = await fetch(`${apiUrl}/api/rooms/${room.id}/members`, {
                  headers: { Authorization: `Bearer ${token}` },
                })

                if (!roomMembersRes.ok) {
                  return [room.id, []] as const
                }

                const roomMembersData = await roomMembersRes.json()
                const memberIds = Array.isArray(roomMembersData.members)
                  ? roomMembersData.members.filter((memberId): memberId is UUID =>
                      playerUsers.some((player) => player.id === memberId)
                    )
                  : []

                return [room.id, memberIds] as const
              } catch {
                return [room.id, []] as const
              }
            })
          )

          nextRoomMembers = Object.fromEntries(roomMemberEntries)
        }

        if (!cancelled) {
          setShareUsers(playerUsers)
          setShareRooms(shareableRooms)
          setRoomMemberIdsByRoomId(nextRoomMembers)
        }
      } catch {
        if (!cancelled) {
          setShareUsers([])
          setShareRooms([])
          setRoomMemberIdsByRoomId({})
        }
      }
    }

    void loadShareContext()
    return () => {
      cancelled = true
    }
  }, [apiUrl, campaignId, sessionId, token, user.id])

  const addAllowedUsers = (candidateIds: string[]) => {
    const nextIds = candidateIds.map((candidateId) => candidateId.trim()).filter(Boolean)
    if (nextIds.length === 0) return

    setAllowedUsers((current) => Array.from(new Set([...current, ...nextIds])))
  }

  const handleAddSelectedUser = () => {
    const candidate = selectedShareUserId.trim()
    if (!candidate) return
    addAllowedUsers([candidate])
    setSelectedShareUserId('')
  }

  const handleAddSelectedRoom = () => {
    const roomId = selectedShareRoomId.trim() as UUID
    if (!roomId) return
    addAllowedUsers(roomMemberIdsByRoomId[roomId] || [])
    setSelectedShareRoomId('')
  }

  const removeAllowedUser = (userId: string) => {
    setAllowedUsers((current) => current.filter((id) => id !== userId))
  }

  const handleCreate: SubmitEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault()
    setError(null)
    setIsCreating(true)

    try {
      const tags = tagsText
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)

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
      setSelectedShareUserId('')
      setSelectedShareRoomId('')
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
    const res = await fetch(`${apiUrl}/api/notes/${noteId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(updates),
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
      <div className="notes-workspace-header">Notes</div>

      {error ? <p className="m-3 text-sm text-ui-error-text">{error}</p> : null}

      <div className="notes-workspace-toolbar">
        <button
          type="button"
          className="notes-toolbar-button"
          onClick={() => setShowCreateForm((current) => !current)}
        >
          {showCreateForm ? 'Hide create' : 'Create note'}
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
          tagsText={tagsText}
          shareUsers={shareUsers}
          shareRooms={shareRooms}
          selectedShareUserId={selectedShareUserId}
          selectedShareRoomId={selectedShareRoomId}
          allowedUsers={allowedUsers}
          isCreating={isCreating}
          userRole={user.role}
          onSubmit={handleCreate}
          onTitleChange={setTitle}
          onContentChange={setContent}
          onVisibilityChange={setVisibility}
          onTagsTextChange={setTagsText}
          onSelectedShareUserIdChange={setSelectedShareUserId}
          onSelectedShareRoomIdChange={setSelectedShareRoomId}
          onAddSelectedUser={handleAddSelectedUser}
          onAddSelectedRoom={handleAddSelectedRoom}
          onRemoveAllowedUser={removeAllowedUser}
        />
      ) : null}

      <div className="notes-workspace-content">
        {isLoading ? (
          <p className="text-sm text-ui-secondary">Loading notes...</p>
        ) : displayedNotes.length === 0 ? (
          <p className="text-sm text-ui-secondary">
            {showPublishedOnly ? 'No published notes yet.' : 'No notes yet.'}
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
