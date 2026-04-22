import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MessageType, NoteVisibility, PresenceState, Role, RoomType } from '@shared'
import type { UUID } from '@shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HistoryPanel } from '../../components/session/HistoryPanel'
import { JournalPanel } from '../../components/session/JournalPanel'
import { SearchPanel } from '../../components/session/SearchPanel'
import { useStore } from '../../state/store'

const asUuid = (value: string) => value as UUID

const SESSION_ID = asUuid('22222222-2222-4222-8222-222222222222')
const ROOM_ID = asUuid('66666666-6666-4666-8666-666666666666')
const PLAYER_ID = asUuid('44444444-4444-4444-8444-444444444444')

describe('Stage 11 knowledge panels', () => {
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
      />
    )

    await waitFor(() => {
      expect(screen.getByText(/1 rooms/i)).toBeTruthy()
    })

    fireEvent.change(screen.getByPlaceholderText('Search notes, chat, rooms, or players'), {
      target: { value: 'archive' },
    })

    expect(await screen.findByText('Archive Cellar')).toBeTruthy()
    expect(screen.getByText('Archive route')).toBeTruthy()
    expect(screen.getByText('Check the archive map before we move.')).toBeTruthy()

    fireEvent.click(screen.getAllByRole('button', { name: 'Focus room' })[0])
    expect(onSelectRoom).toHaveBeenCalledWith(ROOM_ID)
  })

  it('renders journal entries from visible notes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
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
              publishedAt: 20,
              createdAt: 10,
              updatedAt: 20,
            },
          ],
        }),
      }))
    )

    render(
      <JournalPanel
        apiUrl="http://localhost:3000"
        token="token"
        sessionId={SESSION_ID}
        role={Role.PLAYER}
      />
    )

    expect(await screen.findByText('Recovered sigil')).toBeTruthy()
    expect(screen.getByText('Read only')).toBeTruthy()
    expect(screen.getByText('sigil')).toBeTruthy()
    expect(screen.getByText('vault')).toBeTruthy()
  })

  it('renders persisted session history entries', async () => {
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

    expect(await screen.findByText('State Changed')).toBeTruthy()
    expect(screen.getByText('Session state changed from IDLE to ACTIVE')).toBeTruthy()
  })
})
