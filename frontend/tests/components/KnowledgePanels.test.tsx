import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MessageType, NoteVisibility, PresenceState, Role, RoomType } from '@shared'
import type { UUID } from '@shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HistoryPanel } from '../../src/components/session/HistoryPanel'
import { JournalPanel } from '../../src/components/session/JournalPanel'
import { NotesRailPanel } from '../../src/components/session/NotesRailPanel'

import { useStore } from '../../src/state/store'

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

  it('renders journal editor for DM and read-only view for players', async () => {
    const journalNote = {
      id: asUuid('cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
      authorId: PLAYER_ID,
      authorUsername: 'Tara',
      title: 'Session Journal',
      content: 'The party descended into the vault.',
      visibility: NoteVisibility.PLAYERS_VISIBLE,
      tags: ['_journal'],
      allowedUsers: [],
      publishedAt: null,
      createdAt: 10,
      updatedAt: 20,
    }

    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.includes('/api/notes/')) {
        return {
          ok: true,
          json: async () => ({ notes: [journalNote] }),
        }
      }
      throw new Error(`Unexpected fetch call: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    // DM sees editor with Edit button
    const { unmount: unmountDm } = render(
      <JournalPanel
        apiUrl="http://localhost:3000"
        token="token"
        sessionId={SESSION_ID}
        sessionName="Chapter One"
        role={Role.DM}
        userId={PLAYER_ID}
      />
    )

    expect(await screen.findByTestId('journal-panel')).toBeTruthy()
    expect(await screen.findByLabelText('Edit journal')).toBeTruthy()
    // Editor is read-only until Edit is clicked
    expect(screen.getByTestId('markdown-editor')).toBeTruthy()

    // Click Edit — editor becomes active
    fireEvent.click(screen.getByLabelText('Edit journal'))
    expect(screen.getByLabelText('Save journal')).toBeTruthy()
    expect(screen.getByLabelText('Cancel editing')).toBeTruthy()

    unmountDm()

    // Player sees read-only editor, no Edit button
    render(
      <JournalPanel
        apiUrl="http://localhost:3000"
        token="token"
        sessionId={SESSION_ID}
        role={Role.PLAYER}
        userId={PLAYER_ID}
      />
    )

    expect(await screen.findByTestId('journal-panel')).toBeTruthy()
    expect(screen.getByTestId('markdown-editor')).toBeTruthy()
    expect(screen.queryByLabelText('Edit journal')).toBeNull()
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
