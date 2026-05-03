import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MessageType, NoteVisibility, PresenceState, Role, RoomType } from '@shared'
import type { UUID } from '@shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HistoryPanel } from '../../components/session/HistoryPanel'
import { JournalPanel } from '../../components/session/JournalPanel'
import { NotesRailPanel } from '../../components/session/NotesRailPanel'
import { SearchPanel } from '../../components/session/SearchPanel'
import { useStore } from '../../state/store'

const asUuid = (value: string) => value as UUID

const SESSION_ID = asUuid('22222222-2222-4222-8222-222222222222')
const ROOM_ID = asUuid('66666666-6666-4666-8666-666666666666')
const PLAYER_ID = asUuid('44444444-4444-4444-8444-444444444444')

describe('knowledge panels', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    const store = useStore.getState()
    store.clearMessages()
    store.clearNotes()
  })

  it('searches across rooms, participants, messages, and notes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input)

        if (url.endsWith(`/api/chat/messages/${SESSION_ID}`)) {
          return {
            ok: true,
            json: async () => ({
              messages: [
                {
                  id: asUuid('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
                  authorId: PLAYER_ID,
                  authorUsername: 'Tara',
                  content: 'Check the archive map before we move.',
                  type: MessageType.OOC,
                  isDmOnly: false,
                  createdAt: 10,
                },
              ],
            }),
          }
        }

        if (url.endsWith(`/api/notes/${SESSION_ID}`)) {
          return {
            ok: true,
            json: async () => ({
              notes: [
                {
                  id: asUuid('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
                  authorId: PLAYER_ID,
                  authorUsername: 'Tara',
                  title: 'Archive route',
                  content: 'The cellar route stays quiet after midnight.',
                  visibility: NoteVisibility.PLAYERS_VISIBLE,
                  tags: ['route'],
                  allowedUsers: [],
                  createdAt: 5,
                  updatedAt: 8,
                },
              ],
            }),
          }
        }

        throw new Error(`Unexpected fetch call: ${url}`)
      })
    )

    const onSelectRoom = vi.fn()
    const onOpenNotesWorkspace = vi.fn()
    const onOpenChatWorkspace = vi.fn()

    render(
      <SearchPanel
        apiUrl="http://localhost:3000"
        token="token"
        sessionId={SESSION_ID}
        role={Role.PLAYER}
        rooms={[{ id: ROOM_ID, name: 'Archive Cellar', type: RoomType.PRIVATE }]}
        participants={[
          {
            userId: PLAYER_ID,
            username: 'Tara',
            state: PresenceState.SPEAKING,
            primaryRoomId: ROOM_ID,
            lastSeenAt: 10,
          },
        ]}
        onSelectRoom={onSelectRoom}
        onOpenNotesWorkspace={onOpenNotesWorkspace}
        onOpenChatWorkspace={onOpenChatWorkspace}
      />
    )

    await waitFor(() => {
      expect(screen.getByText(/1 rooms/i)).toBeTruthy()
    })

    fireEvent.change(screen.getByPlaceholderText('Search notes, chat, rooms, or players'), {
      target: { value: 'archive' },
    })

    await waitFor(() => {
      expect(screen.getAllByText('Archive Cellar').length).toBeGreaterThan(0)
    })
    expect(screen.getAllByText('Archive route').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Check the archive map before we move.').length).toBeGreaterThan(0)

    expect(screen.getByTestId('search-drilldown-panel')).toBeTruthy()

    const searchResultsList = screen.getByRole('list', { name: 'Search results' })
    const roomCard = within(searchResultsList).getAllByText('Archive Cellar')[0]?.closest('article')
    if (!roomCard) {
      throw new Error('Room result card not found')
    }
    fireEvent.click(within(roomCard).getByRole('button', { name: 'Inspect result' }))
    fireEvent.click(screen.getByRole('button', { name: 'Jump to room' }))
    expect(onSelectRoom).toHaveBeenCalledWith(ROOM_ID)

    const noteCard = screen.getByText('Archive route').closest('article')
    if (!noteCard) {
      throw new Error('Note result card not found')
    }
    fireEvent.click(within(noteCard).getByRole('button', { name: 'Inspect result' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open Notes workspace' }))
    expect(onOpenNotesWorkspace).toHaveBeenCalledTimes(1)

    const messageCard = screen.getByText('Check the archive map before we move.').closest('article')
    if (!messageCard) {
      throw new Error('Message result card not found')
    }
    fireEvent.click(within(messageCard).getByRole('button', { name: 'Inspect result' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open Chat workspace' }))
    expect(onOpenChatWorkspace).toHaveBeenCalledTimes(1)
  })

  it('supports journal pin, favorite, quick publish, and tag filtering', async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.endsWith(`/api/notes/${SESSION_ID}`)) {
        return {
          ok: true,
          json: async () => ({
            notes: [
              {
                id: asUuid('cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
                authorId: PLAYER_ID,
                authorUsername: 'Tara',
                title: 'Recovered sigil',
                content: 'Recovered from the archive vault door.',
                visibility: NoteVisibility.PLAYERS_VISIBLE,
                tags: ['sigil', 'vault'],
                allowedUsers: [],
                publishedAt: null,
                createdAt: 10,
                updatedAt: 20,
              },
              {
                id: asUuid('11111111-2222-4333-8444-555555555555'),
                authorId: PLAYER_ID,
                authorUsername: 'Tara',
                title: 'Tunnel map',
                content: 'Tunnel routes are marked.',
                visibility: NoteVisibility.PLAYERS_VISIBLE,
                tags: ['map'],
                allowedUsers: [],
                publishedAt: 20,
                createdAt: 15,
                updatedAt: 25,
              },
            ],
          }),
        }
      }

      if (url.includes('/publish') && init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            note: {
              publishedAt: 30,
            },
          }),
        }
      }

      throw new Error(`Unexpected fetch call: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    })

    render(
      <JournalPanel
        apiUrl="http://localhost:3000"
        token="token"
        sessionId={SESSION_ID}
        role={Role.DM}
      />
    )

    expect(await screen.findByText('Recovered sigil')).toBeTruthy()
    expect(screen.getByText('Editable source')).toBeTruthy()
    expect(screen.getAllByText('sigil').length).toBeGreaterThan(0)
    expect(screen.getAllByText('vault').length).toBeGreaterThan(0)

    const recoveredSigilCard = screen.getByText('Recovered sigil').closest('article')
    if (!recoveredSigilCard) {
      throw new Error('Recovered sigil card not found')
    }

    fireEvent.click(within(recoveredSigilCard).getByRole('button', { name: 'Pin entry' }))
    fireEvent.click(within(recoveredSigilCard).getByRole('button', { name: 'Favorite entry' }))
    expect(screen.getAllByText('Pinned').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Favorite').length).toBeGreaterThan(0)

    fireEvent.click(within(recoveredSigilCard).getByRole('button', { name: 'Quick publish' }))
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/publish'),
        expect.objectContaining({ method: 'POST' })
      )
    })

    fireEvent.change(screen.getByLabelText('Tag'), { target: { value: 'map' } })
    expect(screen.getByText('Tunnel map')).toBeTruthy()
    expect(screen.queryByText('Recovered sigil')).toBeNull()
  })

  it('renders and filters persisted session history entries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          logs: [
            {
              id: 'log-1',
              sessionId: SESSION_ID,
              userId: PLAYER_ID,
              username: 'Morgan',
              eventType: 'STATE_CHANGED',
              detail: 'Session state changed from IDLE to ACTIVE',
              createdAt: '2026-04-23T10:00:00.000Z',
            },
            {
              id: 'log-2',
              sessionId: SESSION_ID,
              userId: PLAYER_ID,
              username: 'Tara',
              eventType: 'USER_JOINED',
              detail: 'Tara joined main room',
              createdAt: '2026-04-23T11:00:00.000Z',
            },
          ],
        }),
      }))
    )

    render(
      <HistoryPanel
        apiUrl="http://localhost:3000"
        token="token"
        sessionId={SESSION_ID}
        role={Role.DM}
      />
    )

    expect(await screen.findByText('Session state changed from IDLE to ACTIVE')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Event type'), { target: { value: 'USER_JOINED' } })
    expect(screen.getByText('Tara joined main room')).toBeTruthy()
    expect(screen.queryByText('Session state changed from IDLE to ACTIVE')).toBeNull()

    fireEvent.change(screen.getByLabelText('Event type'), { target: { value: 'all' } })
    fireEvent.change(screen.getByLabelText('Actor'), { target: { value: 'Morgan' } })
    expect(screen.getByText('Session state changed from IDLE to ACTIVE')).toBeTruthy()
    expect(screen.queryByText('Tara joined main room')).toBeNull()
  })

  it('renders notes rail data and supports quick filtering', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          notes: [
            {
              id: asUuid('dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
              authorId: PLAYER_ID,
              authorUsername: 'Tara',
              title: 'Quiet ingress route',
              content: 'Use the eastern tunnel and avoid lanterns.',
              visibility: NoteVisibility.PLAYERS_VISIBLE,
              tags: ['route', 'stealth'],
              allowedUsers: [],
              createdAt: 40,
              updatedAt: 50,
            },
          ],
        }),
      }))
    )

    const onOpenNotesWorkspace = vi.fn()

    render(
      <NotesRailPanel
        apiUrl="http://localhost:3000"
        token="token"
        sessionId={SESSION_ID}
        role={Role.PLAYER}
        onOpenNotesWorkspace={onOpenNotesWorkspace}
      />
    )

    expect(await screen.findByText('Quiet ingress route')).toBeTruthy()
    expect(screen.getByText('Read only')).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText('Search titles, content, authors, or tags'), {
      target: { value: 'stealth' },
    })
    expect(screen.getByText('Quiet ingress route')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Open full notes workspace' }))
    expect(onOpenNotesWorkspace).toHaveBeenCalledTimes(1)
  })
})
