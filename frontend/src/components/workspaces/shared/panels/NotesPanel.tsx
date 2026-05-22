import { useEffect, useMemo, useState, type SubmitEventHandler } from 'react'
import { NoteVisibility, Role, RoomType, type UUID } from '@shared'
import { useStore } from '@/hooks/useStore'
import type { Note } from '@/types/notes'
import { fetchSessionNotesOnce } from '@/utils/notesFetch'
import { NoteCard } from './NoteCard'
import { NotesCreateForm } from './NotesCreateForm'

interface NotesPanelProps {
  apiUrl: string
  token: string
  sessionId: UUID
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

export function NotesPanel({ apiUrl, token, sessionId, user }: NotesPanelProps) {
  const notesBySession = useStore((state) => (state.notes as any)[sessionId]) as
    | Record<UUID, Note>
    | undefined
  const addNote = useStore((state) => state.addNote)
  const clearNotes = useStore((state) => state.clearNotes)
  const updateNote = useStore((state) => state.updateNote)
  const deleteNote = useStore((state) => state.deleteNote)
  const notes = useMemo(
    () => Object.values(notesBySession || {}).sort((a, b) => b.updatedAt - a.updatedAt),
    [notesBySession]
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
  const [showPublishedOnly, setShowPublishedOnly] = useState(false)

  const displayedNotes = useMemo(
    () => (showPublishedOnly ? notes.filter((note) => Boolean(note.publishedAt)) : notes),
    [notes, showPublishedOnly]
  )

  useEffect(() => {
    let cancelled = false

    const loadNotes = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const fetchedNotes = await fetchSessionNotesOnce(apiUrl, sessionId, token)
        if (!cancelled) {
          clearNotes(sessionId)
          for (const note of fetchedNotes) {
            addNote(sessionId, note)
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
  }, [addNote, apiUrl, clearNotes, sessionId, token])

  useEffect(() => {
    let cancelled = false

    const loadShareContext = async () => {
      try {
        const [membersRes, roomsRes] = await Promise.all([
          fetch(`${apiUrl}/api/session/${sessionId}/members`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${apiUrl}/api/rooms/session/${sessionId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ])

        if (!membersRes.ok) {
          return
        }

        const membersData = await membersRes.json()
        const users = Array.isArray(membersData.users) ? membersData.users : []
        const playerUsers = users.filter(
          (candidate: SessionUserSummary) =>
            candidate.id !== user.id && candidate.role === Role.PLAYER
        )

        let shareableRooms: SessionRoomShareOption[] = []
        let nextRoomMembers: Record<UUID, UUID[]> = {}

        if (roomsRes.ok) {
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
  }, [apiUrl, sessionId, token, user.id])

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
      addNote(sessionId, {
        id: note.id,
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
    updateNote(sessionId, note.id, {
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
      body: JSON.stringify({ sessionId }),
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

    deleteNote(sessionId, noteId as UUID)
  }

  return (
    <section className="overflow-hidden rounded-ui-lg border border-ui-border bg-ui-surface">
      <div className="border-b border-ui-border bg-ui-surface-subtle px-4 py-3 font-semibold text-ui-primary">
        Notes
      </div>

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

      {error ? <p className="m-3 text-sm text-ui-error-text">{error}</p> : null}

      <div className="flex items-center gap-2 border-b border-ui-border px-3 pb-3 text-sm text-ui-primary">
        <label className="inline-flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={showPublishedOnly}
            onChange={(event) => setShowPublishedOnly(event.target.checked)}
          />
          Show published only
        </label>
        <span className="text-ui-secondary">
          {showPublishedOnly ? `${displayedNotes.length} published` : `${notes.length} total`}
        </span>
      </div>

      <div className="max-h-90 overflow-y-auto p-3">
        {isLoading ? (
          <p className="text-sm text-ui-secondary">Loading notes...</p>
        ) : displayedNotes.length === 0 ? (
          <p className="text-sm text-ui-secondary">
            {showPublishedOnly ? 'No published notes yet.' : 'No notes yet.'}
          </p>
        ) : (
          displayedNotes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              shareUsers={shareUsers}
              shareRooms={shareRooms}
              roomMemberIdsByRoomId={roomMemberIdsByRoomId}
              canEdit={user.role === Role.DM || note.ownerId === user.id}
              canPublish={user.role === Role.DM || note.ownerId === user.id}
              onSave={handleSave}
              onDelete={handleDelete}
              onPublish={handlePublish}
            />
          ))
        )}
      </div>
    </section>
  )
}
