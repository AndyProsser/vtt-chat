import { useEffect, useMemo, useState } from 'react'
import { NoteVisibility } from '@shared'
import type { Role, RoomType, UUID } from '@shared'
import { useStore } from '../../hooks/useStore'
import type { Message } from '@/types/chat'
import type { Note } from '@/types/notes'
import type { SessionPresence } from '@/types/room'
import '../../styles/components/session/KnowledgePanels.css'

interface SearchPanelProps {
  apiUrl: string
  token: string
  sessionId: UUID
  role: Role
  rooms: Array<{ id: UUID; name: string; type: RoomType }>
  participants: SessionPresence[]
  onSelectRoom?: (roomId: UUID) => void
  onOpenNotesWorkspace?: () => void
  onOpenChatWorkspace?: () => void
}

type SearchResultKind = 'room' | 'participant' | 'message' | 'note'

interface SearchResult {
  id: string
  kind: SearchResultKind
  title: string
  subtitle: string
  excerpt?: string
  roomId?: UUID
  searchText: string
}

const EMPTY_MESSAGES: Record<UUID, Message> = {}
const EMPTY_NOTES: Record<UUID, Note> = {}

const NOTE_VISIBILITY_LABEL: Record<NoteVisibility, string> = {
  [NoteVisibility.DM_ONLY]: 'DM only',
  [NoteVisibility.PLAYERS_VISIBLE]: 'Shared',
  [NoteVisibility.CUSTOM]: 'Custom',
}

function createMessageResult(message: Message): SearchResult {
  return {
    id: `message:${message.id}`,
    kind: 'message',
    title: message.authorUsername,
    subtitle: `${message.type}${message.isDmOnly ? ' • DM only' : ''}`,
    excerpt: message.content,
    searchText: `${message.authorUsername} ${message.type} ${message.content}`.toLowerCase(),
  }
}

function createNoteResult(note: Note): SearchResult {
  return {
    id: `note:${note.id}`,
    kind: 'note',
    title: note.title,
    subtitle: `${note.ownerUsername} • ${NOTE_VISIBILITY_LABEL[note.visibility]}`,
    excerpt: note.content,
    searchText:
      `${note.title} ${note.content} ${note.ownerUsername} ${note.tags.join(' ')}`.toLowerCase(),
  }
}

function createRoomResult(room: { id: UUID; name: string; type: RoomType }): SearchResult {
  return {
    id: `room:${room.id}`,
    kind: 'room',
    title: room.name,
    subtitle: `Room • ${room.type}`,
    roomId: room.id,
    searchText: `${room.name} ${room.type}`.toLowerCase(),
  }
}

function createParticipantResult(participant: SessionPresence): SearchResult {
  return {
    id: `participant:${participant.userId}`,
    kind: 'participant',
    title: participant.username,
    subtitle: `Participant • ${participant.state}`,
    roomId: participant.primaryRoomId,
    searchText: `${participant.username} ${participant.state}`.toLowerCase(),
  }
}

function resultKindLabel(kind: SearchResultKind): string {
  switch (kind) {
    case 'room':
      return 'Room'
    case 'participant':
      return 'Participant'
    case 'message':
      return 'Chat'
    case 'note':
      return 'Note'
    default:
      return kind
  }
}

export function SearchPanel({
  apiUrl,
  token,
  sessionId,
  role,
  rooms,
  participants,
  onSelectRoom,
  onOpenNotesWorkspace,
  onOpenChatWorkspace,
}: SearchPanelProps) {
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null)

  const sessionMessages = useStore((state) => state.messages[sessionId] ?? EMPTY_MESSAGES)
  const sessionNotes = useStore((state) => state.notes[sessionId] ?? EMPTY_NOTES)
  const addMessage = useStore((state) => state.addMessage)
  const addNote = useStore((state) => state.addNote)

  const messages = useMemo(
    () => Object.values(sessionMessages).sort((left, right) => right.createdAt - left.createdAt),
    [sessionMessages]
  )
  const notes = useMemo(
    () => Object.values(sessionNotes).sort((left, right) => right.updatedAt - left.updatedAt),
    [sessionNotes]
  )

  useEffect(() => {
    let cancelled = false

    const hydrateSearchSources = async () => {
      setIsLoading(true)
      setError(null)

      const [messageResult, noteResult] = await Promise.allSettled([
        fetch(`${apiUrl}/api/chat/messages/${sessionId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${apiUrl}/api/notes/${sessionId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])

      const failures: string[] = []

      if (messageResult.status === 'fulfilled') {
        if (messageResult.value.ok) {
          const data = await messageResult.value.json()
          const fetchedMessages: Message[] = (data.messages || []).map((message: any) => ({
            id: message.id,
            authorId: message.authorId,
            authorUsername: message.authorUsername,
            content: message.content,
            type: message.type,
            isDmOnly: message.isDmOnly,
            createdAt: message.createdAt,
            editedAt: message.editedAt,
          }))

          if (!cancelled) {
            for (const message of fetchedMessages) {
              addMessage(sessionId, message)
            }
          }
        } else {
          failures.push('chat history')
        }
      } else {
        failures.push('chat history')
      }

      if (noteResult.status === 'fulfilled') {
        if (noteResult.value.ok) {
          const data = await noteResult.value.json()
          const fetchedNotes: Note[] = (data.notes || []).map((note: any) => ({
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
          }))

          if (!cancelled) {
            for (const note of fetchedNotes) {
              addNote(sessionId, note)
            }
          }
        } else {
          failures.push('notes')
        }
      } else {
        failures.push('notes')
      }

      if (!cancelled) {
        setError(failures.length ? `Unable to refresh ${failures.join(' and ')}.` : null)
        setIsLoading(false)
      }
    }

    void hydrateSearchSources()

    return () => {
      cancelled = true
    }
  }, [addMessage, addNote, apiUrl, sessionId, token])

  const normalizedQuery = query.trim().toLowerCase()
  const resultCountSummary = `${rooms.length} rooms • ${participants.length} participants • ${messages.length} messages • ${notes.length} notes`

  const results = useMemo(() => {
    if (!normalizedQuery) {
      return []
    }

    const candidateResults = [
      ...rooms.map(createRoomResult),
      ...participants.map(createParticipantResult),
      ...messages.map(createMessageResult),
      ...notes.map(createNoteResult),
    ]

    return candidateResults
      .filter((result) => result.searchText.includes(normalizedQuery))
      .slice(0, 24)
  }, [messages, normalizedQuery, notes, participants, rooms])

  useEffect(() => {
    if (!results.length) {
      setSelectedResultId(null)
      return
    }

    setSelectedResultId((previousId) => {
      if (previousId && results.some((result) => result.id === previousId)) {
        return previousId
      }

      return results[0].id
    })
  }, [results])

  const selectedResult = useMemo(
    () => results.find((result) => result.id === selectedResultId) ?? null,
    [results, selectedResultId]
  )

  return (
    <section className="knowledge-panel" data-testid="search-panel">
      <header className="knowledge-panel-header">
        <div>
          <p className="knowledge-panel-eyebrow">Knowledge</p>
          <h3 className="knowledge-panel-title">Search</h3>
        </div>
        <span className="knowledge-panel-badge">{role === 'DM' ? 'Live index' : 'Read only'}</span>
      </header>

      <p className="knowledge-panel-copy">
        Search across current session rooms, participants, chat, and visible notes.
      </p>

      <label className="knowledge-panel-search">
        <span className="knowledge-panel-search-label">Query</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search notes, chat, rooms, or players"
          disabled={isLoading}
        />
      </label>

      <p className="knowledge-panel-meta">{isLoading ? 'Waiting for data…' : resultCountSummary}</p>

      {error ? <p className="knowledge-panel-error">{error}</p> : null}

      {!normalizedQuery ? (
        <div className="knowledge-panel-empty">
          <p>Start typing to search this session.</p>
        </div>
      ) : results.length === 0 ? (
        <div className="knowledge-panel-empty">
          <p>No results</p>
        </div>
      ) : (
        <div className="knowledge-panel-drilldown" aria-label="Search results and preview">
          <div className="knowledge-panel-results" role="list" aria-label="Search results">
            {results.map((result) => (
              <article
                key={result.id}
                className={`knowledge-panel-card ${selectedResultId === result.id ? 'selected' : ''}`}
                role="listitem"
              >
                <div className="knowledge-panel-card-header">
                  <div>
                    <p className="knowledge-panel-card-title">{result.title}</p>
                    <p className="knowledge-panel-card-subtitle">{result.subtitle}</p>
                  </div>
                  <span className="knowledge-panel-chip">{resultKindLabel(result.kind)}</span>
                </div>
                {result.excerpt ? (
                  <p className="knowledge-panel-card-body">{result.excerpt}</p>
                ) : null}
                <button
                  type="button"
                  className="knowledge-panel-action"
                  onClick={() => setSelectedResultId(result.id)}
                >
                  Inspect result
                </button>
              </article>
            ))}
          </div>

          <aside className="knowledge-panel-preview" data-testid="search-drilldown-panel">
            {selectedResult ? (
              <>
                <div className="knowledge-panel-card-header">
                  <div>
                    <p className="knowledge-panel-card-title">{selectedResult.title}</p>
                    <p className="knowledge-panel-card-subtitle">{selectedResult.subtitle}</p>
                  </div>
                  <span className="knowledge-panel-chip">
                    {resultKindLabel(selectedResult.kind)}
                  </span>
                </div>

                <p className="knowledge-panel-preview-label">Context preview</p>
                <p className="knowledge-panel-card-body">
                  {selectedResult.excerpt || 'No additional preview content.'}
                </p>

                <div className="knowledge-panel-action-row" aria-label="Search result actions">
                  {selectedResult.roomId && onSelectRoom ? (
                    <button
                      type="button"
                      className="knowledge-panel-action"
                      onClick={() => onSelectRoom(selectedResult.roomId as UUID)}
                    >
                      Jump to room
                    </button>
                  ) : null}

                  {selectedResult.kind === 'note' && onOpenNotesWorkspace ? (
                    <button
                      type="button"
                      className="knowledge-panel-action"
                      onClick={onOpenNotesWorkspace}
                    >
                      Open Notes workspace
                    </button>
                  ) : null}

                  {selectedResult.kind === 'message' && onOpenChatWorkspace ? (
                    <button
                      type="button"
                      className="knowledge-panel-action"
                      onClick={onOpenChatWorkspace}
                    >
                      Open Chat workspace
                    </button>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="knowledge-panel-empty">
                <p>Select a result to inspect details.</p>
              </div>
            )}
          </aside>
        </div>
      )}
    </section>
  )
}
