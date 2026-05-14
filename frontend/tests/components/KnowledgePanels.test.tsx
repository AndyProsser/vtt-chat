import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MessageType, NoteVisibility, PresenceState, Role, RoomType } from '@shared'
import type { UUID } from '@shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HistoryPanel } from '../../src/components/session/HistoryPanel'
import { JournalPanel } from '../../src/components/session/JournalPanel'
import { NotesRailPanel } from '../../src/components/session/NotesRailPanel'

import { useStore } from '../../src/state/store'
import type { Note } from '../../src/types/notes'

const asUuid = (value: string) => value as UUID

const SESSION_ID = asUuid('22222222-2222-4222-8222-222222222222')
const SESSION_TWO_ID = asUuid('23232323-2323-4232-8232-232323232323')
const ROOM_ID = asUuid('66666666-6666-4666-8666-666666666666')
const PLAYER_ID = asUuid('44444444-4444-4444-8444-444444444444')

describe('knowledge panels', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    const store = useStore.getState()
    store.clearMessages()
    store.clearNotes()
  })

  it('renders journal entries from state and supports recent vs all views', async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)

      if (
        url.endsWith(`/api/notes/${SESSION_ID}`) ||
        url.endsWith(`/api/notes/${SESSION_TWO_ID}`)
      ) {
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

      throw new Error(`Unexpected fetch call: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storage.set(key, value)
      }),
    })

    const clipboardWriteText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: clipboardWriteText,
      },
    })

    const firstRender = render(
      <JournalPanel
        apiUrl="http://localhost:3000"
        token="token"
        sessionId={SESSION_ID}
        role={Role.DM}
        userId={PLAYER_ID}
      />
    )

    const notesState = useStore.getState()
    const firstNote: Note = {
      id: asUuid('cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
      ownerId: PLAYER_ID,
      ownerUsername: 'Tara',
      title: 'Recovered sigil',
      content: 'Recovered from the archive vault door.',
      visibility: NoteVisibility.PLAYERS_VISIBLE,
      tags: ['sigil', 'vault'],
      allowedUsers: [],
      publishedAt: null,
      createdAt: 10,
      updatedAt: 20,
    }
    const secondNote: Note = {
      id: asUuid('11111111-2222-4333-8444-555555555555'),
      ownerId: PLAYER_ID,
      ownerUsername: 'Tara',
      title: 'Tunnel map',
      content: 'Tunnel routes are marked.',
      visibility: NoteVisibility.PLAYERS_VISIBLE,
      tags: ['map'],
      allowedUsers: [],
      publishedAt: 20,
      createdAt: 15,
      updatedAt: 25,
    }
    await act(async () => {
      notesState.addNote(SESSION_ID, firstNote)
      notesState.addNote(SESSION_ID, secondNote)
    })

    expect(await screen.findByText('Recovered sigil')).toBeTruthy()
    expect(screen.getByText('By Tara · sigil, vault')).toBeTruthy()
    expect(screen.getByText('By Tara · map')).toBeTruthy()

    const journalEntryList = screen.getByLabelText('Journal entries')
    expect(within(journalEntryList).getAllByRole('article').length).toBe(2)

    firstRender.unmount()

    const secondRender = render(
      <JournalPanel
        apiUrl="http://localhost:3000"
        token="token"
        sessionId={SESSION_ID}
        role={Role.DM}
        userId={PLAYER_ID}
      />
    )

    const secondState = useStore.getState()
    await act(async () => {
      secondState.addNote(SESSION_ID, firstNote)
      secondState.addNote(SESSION_ID, secondNote)
    })

    await waitFor(() => {
      expect(screen.getByText('Recovered sigil')).toBeTruthy()
      expect(screen.getByText('Tunnel map')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('tab', { name: 'Recent' }))
    expect(screen.getByText('Recovered sigil')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'All' }))
    expect(screen.getByText('Tunnel map')).toBeTruthy()

    secondRender.unmount()

    render(
      <JournalPanel
        apiUrl="http://localhost:3000"
        token="token"
        sessionId={SESSION_TWO_ID}
        role={Role.DM}
        userId={PLAYER_ID}
      />
    )

    const thirdState = useStore.getState()
    await act(async () => {
      thirdState.addNote(SESSION_TWO_ID, firstNote)
      thirdState.addNote(SESSION_TWO_ID, secondNote)
    })

    expect(await screen.findByText('Recovered sigil')).toBeTruthy()
    expect(screen.getByText('Tunnel map')).toBeTruthy()
  })

  it('renders history entries and supports grouping and sort controls', async () => {
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storage.set(key, value)
      }),
    })

    const clipboardWriteText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: clipboardWriteText,
      },
    })

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input)
        const requestedSessionId = url.includes(SESSION_TWO_ID) ? SESSION_TWO_ID : SESSION_ID

        return {
          ok: true,
          json: async () => ({
            logs: [
              {
                id: 'log-1',
                sessionId: requestedSessionId,
                userId: PLAYER_ID,
                username: 'Morgan',
                eventType: 'STATE_CHANGED',
                detail: 'Session state changed from IDLE to ACTIVE',
                createdAt: '2026-04-23T10:00:00.000Z',
              },
              {
                id: 'log-2',
                sessionId: requestedSessionId,
                userId: PLAYER_ID,
                username: 'Tara',
                eventType: 'USER_JOINED',
                detail: 'Tara joined main room',
                createdAt: '2026-04-23T11:00:00.000Z',
              },
            ],
          }),
        }
      })
    )

    const firstRender = render(
      <HistoryPanel
        apiUrl="http://localhost:3000"
        token="token"
        sessionId={SESSION_ID}
        role={Role.DM}
        userId={PLAYER_ID}
      />
    )

    expect(await screen.findByText('Session state changed from IDLE to ACTIVE')).toBeTruthy()

    expect(screen.getByRole('tab', { name: 'Day' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Event' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Newest' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Oldest' })).toBeTruthy()
    expect(screen.getByText('State Changed')).toBeTruthy()
    expect(screen.getByText('User Joined')).toBeTruthy()
    expect(screen.getByText('Tara joined main room')).toBeTruthy()
    expect(screen.getByText('Session state changed from IDLE to ACTIVE')).toBeTruthy()

    firstRender.unmount()

    const secondRender = render(
      <HistoryPanel
        apiUrl="http://localhost:3000"
        token="token"
        sessionId={SESSION_ID}
        role={Role.DM}
        userId={PLAYER_ID}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Session state changed from IDLE to ACTIVE')).toBeTruthy()
      expect(screen.getByText('Tara joined main room')).toBeTruthy()
    })

    secondRender.unmount()

    render(
      <HistoryPanel
        apiUrl="http://localhost:3000"
        token="token"
        sessionId={SESSION_TWO_ID}
        role={Role.DM}
        userId={PLAYER_ID}
      />
    )

    expect(await screen.findByText('Tara joined main room')).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Event' })).toBeTruthy()
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
