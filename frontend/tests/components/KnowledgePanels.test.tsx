import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MessageType, NoteVisibility, PresenceState, Role, RoomType } from '@shared'
import type { UUID } from '@shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HistoryPanel } from '../../src/components/workspaces/shared/panels/HistoryPanel'
import { JournalPanel } from '../../src/components/workspaces/shared/panels/JournalPanel'
import { NotesPanel } from '../../src/components/workspaces/shared/panels/NotesPanel'
import { useStore } from '../../src/hooks/useStore'

const asUuid = (value: string) => value as UUID

const SESSION_ID = asUuid('22222222-2222-4222-8222-222222222222')
const SESSION_TWO_ID = asUuid('23232323-2323-4232-8232-232323232323')
const CAMPAIGN_ID = asUuid('21212121-2121-4212-8212-212121212121')
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

    // Focused mode renders a journal editor/viewer for DM without the compact browser edit toggle.
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
    expect(screen.queryByLabelText('Edit journal')).toBeNull()
    expect(screen.getByTestId('markdown-editor')).toBeTruthy()

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

  it('lets players open older session journals from the compact browser', async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input)

      if (!url.includes('/api/notes/')) {
        throw new Error(`Unexpected fetch call: ${url}`)
      }

      if (url.includes(SESSION_TWO_ID)) {
        return {
          ok: true,
          json: async () => ({
            notes: [
              {
                id: asUuid('abababab-abab-4bab-8bab-abababababab'),
                authorId: PLAYER_ID,
                authorUsername: 'Tara',
                title: 'Session Journal',
                content: 'The crew recovered the moon key.',
                visibility: NoteVisibility.PLAYERS_VISIBLE,
                tags: ['_journal', '#loot'],
                allowedUsers: [],
                publishedAt: null,
                createdAt: 30,
                updatedAt: 40,
              },
            ],
          }),
        }
      }

      return {
        ok: true,
        json: async () => ({
          notes: [
            {
              id: asUuid('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd'),
              authorId: PLAYER_ID,
              authorUsername: 'Tara',
              title: 'Session Journal',
              content: 'The party descended into the vault.',
              visibility: NoteVisibility.PLAYERS_VISIBLE,
              tags: ['_journal', '#recap'],
              allowedUsers: [],
              publishedAt: null,
              createdAt: 10,
              updatedAt: 20,
            },
          ],
        }),
      }
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <JournalPanel
        apiUrl="http://localhost:3000"
        token="token"
        role={Role.PLAYER}
        sessions={[
          {
            id: SESSION_ID,
            name: 'The Emerald Crown #29 - 24 May 2026',
            dmId: PLAYER_ID,
            state: 'ACTIVE',
            createdAt: 200,
          },
          {
            id: SESSION_TWO_ID,
            name: 'The Emerald Crown #28 - 17 May 2026',
            dmId: PLAYER_ID,
            state: 'ENDED',
            createdAt: 100,
          },
        ]}
        selectedSessionId={SESSION_ID}
        onSessionChange={vi.fn()}
      />
    )

    expect(await screen.findByText('The party descended into the vault.')).toBeTruthy()
    expect(screen.getByText('The Emerald Crown #28 - 17 May 2026')).toBeTruthy()

    fireEvent.click(screen.getByText('The Emerald Crown #28 - 17 May 2026'))

    expect(await screen.findByText('The crew recovered the moon key.')).toBeTruthy()
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

        if (url.endsWith(`/api/campaigns/${CAMPAIGN_ID}/sessions`)) {
          return {
            ok: true,
            json: async () => ({
              sessions: [
                {
                  id: SESSION_ID,
                  name: 'Session Current',
                  state: 'ACTIVE',
                  createdAt: 200,
                },
                {
                  id: SESSION_TWO_ID,
                  name: 'Session Previous',
                  state: 'ENDED',
                  createdAt: 100,
                  startedAt: 100,
                  endedAt: 120,
                },
              ],
            }),
          }
        }

        if (!url.includes('/api/chat/messages/')) {
          throw new Error(`Unexpected fetch call: ${url}`)
        }

        const requestedSessionId = url.includes(String(SESSION_TWO_ID))
          ? SESSION_TWO_ID
          : SESSION_ID

        return {
          ok: true,
          json: async () => ({
            messages: [
              {
                id: 'log-1',
                sessionId: requestedSessionId,
                roomId: ROOM_ID,
                userId: PLAYER_ID,
                authorUsername: 'Morgan',
                content: 'Session state changed from IDLE to ACTIVE',
                type: MessageType.SYSTEM,
                createdAt: '2026-04-23T10:00:00.000Z',
              },
              {
                id: 'log-2',
                sessionId: requestedSessionId,
                roomId: ROOM_ID,
                userId: PLAYER_ID,
                authorUsername: 'Tara',
                content: 'Tara joined main room',
                type: MessageType.OOC,
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
        campaignId={CAMPAIGN_ID}
        sessionId={SESSION_ID}
        role={Role.DM}
        userId={PLAYER_ID}
      />
    )

    expect(await screen.findByText('Session state changed from IDLE to ACTIVE')).toBeTruthy()

    expect(screen.getByRole('tab', { name: 'Sort by newest first' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Sort by oldest first' })).toBeTruthy()
    expect(screen.getByText('Tara joined main room')).toBeTruthy()
    expect(screen.getByText('Session state changed from IDLE to ACTIVE')).toBeTruthy()

    firstRender.unmount()

    const secondRender = render(
      <HistoryPanel
        apiUrl="http://localhost:3000"
        token="token"
        campaignId={CAMPAIGN_ID}
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
        campaignId={CAMPAIGN_ID}
        sessionId={SESSION_TWO_ID}
        role={Role.DM}
        userId={PLAYER_ID}
      />
    )

    expect(await screen.findByText('Tara joined main room')).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Sort by oldest first' })).toBeTruthy()
  })

  it('renders shared handouts in history as dedicated cards with markdown content', async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input)

      if (url.includes(`/api/campaigns/${CAMPAIGN_ID}/sessions`)) {
        return {
          ok: true,
          json: async () => ({
            sessions: [
              {
                id: SESSION_ID,
                name: 'The Emerald Crown #3',
                state: 'ACTIVE',
                createdAt: '2026-05-31T19:00:00.000Z',
              },
              {
                id: SESSION_TWO_ID,
                name: 'The Emerald Crown #2',
                state: 'ENDED',
                createdAt: '2026-05-24T19:00:00.000Z',
                startedAt: '2026-05-24T19:00:00.000Z',
              },
            ],
          }),
        }
      }

      if (!url.includes(`/api/chat/messages/${SESSION_TWO_ID}`)) {
        throw new Error(`Unexpected fetch call: ${url}`)
      }

      return {
        ok: true,
        json: async () => ({
          messages: [
            {
              id: 'note-1',
              sessionId: SESSION_TWO_ID,
              roomId: ROOM_ID,
              userId: PLAYER_ID,
              authorUsername: 'SYSTEM',
              content:
                '[Note Shared] Emerald Crown\n' +
                'Shared with: All players\n' +
                'Hashtags: None\n\n' +
                'The crown bears **three runes**.',
              type: MessageType.SYSTEM,
              createdAt: '2026-05-24T19:55:37.000Z',
            },
          ],
        }),
      }
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <HistoryPanel
        apiUrl="http://localhost:3000"
        token="token"
        campaignId={CAMPAIGN_ID}
        sessionId={SESSION_ID}
        role={Role.DM}
        userId={PLAYER_ID}
      />
    )

    expect(await screen.findByText('Handout Shared')).toBeTruthy()
    expect(screen.getByText('Emerald Crown')).toBeTruthy()
    expect(screen.getByText(/The crown bears/i)).toBeTruthy()
    expect(screen.getByText(/three runes/i)).toBeTruthy()
    expect(screen.queryByText('[Note Shared] Emerald Crown')).toBeNull()
  })

  it('does not refetch journal status on browser rerender when sessions are unchanged', async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input)

      if (!url.includes('/api/notes/')) {
        throw new Error(`Unexpected fetch call: ${url}`)
      }

      return {
        ok: true,
        json: async () => ({
          notes: [
            {
              id: asUuid('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
              authorId: PLAYER_ID,
              authorUsername: 'Tara',
              title: 'Session Journal',
              content: 'The wards held through dawn.',
              visibility: NoteVisibility.PLAYERS_VISIBLE,
              tags: ['_journal', '#recap'],
              allowedUsers: [],
              publishedAt: null,
              createdAt: 10,
              updatedAt: 20,
            },
          ],
        }),
      }
    })
    vi.stubGlobal('fetch', fetchMock)

    const sessions = [
      {
        id: SESSION_ID,
        name: 'The Emerald Crown #29 - 24 May 2026',
        dmId: PLAYER_ID,
        state: 'ACTIVE',
        createdAt: 200,
      },
      {
        id: SESSION_TWO_ID,
        name: 'The Emerald Crown #28 - 17 May 2026',
        dmId: PLAYER_ID,
        state: 'ENDED',
        createdAt: 100,
      },
    ]

    const { rerender } = render(
      <JournalPanel
        apiUrl="http://localhost:3000"
        token="token"
        role={Role.DM}
        sessions={sessions}
        selectedSessionId={SESSION_ID}
        onSessionChange={vi.fn()}
      />
    )

    expect(await screen.findByText('The wards held through dawn.')).toBeTruthy()

    await waitFor(() => {
      const noteCalls = fetchMock.mock.calls.filter(([input]) =>
        String(input).includes('/api/notes/')
      )

      // 2 browser status fetches (one per session) + 1 selected session editor fetch
      expect(noteCalls.length).toBe(3)
    })

    const stableInitialCallCount = fetchMock.mock.calls.length

    rerender(
      <JournalPanel
        apiUrl="http://localhost:3000"
        token="token"
        role={Role.DM}
        sessions={sessions.map((session) => ({ ...session }))}
        selectedSessionId={SESSION_ID}
        onSessionChange={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBe(stableInitialCallCount)
    })
  })

  it('renders notes rail data for the current handout selection', async () => {
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

    render(
      <NotesPanel
        apiUrl="http://localhost:3000"
        token="token"
        campaignId={SESSION_ID}
        sessionId={SESSION_ID}
        role={Role.PLAYER}
        user={{ id: PLAYER_ID, role: Role.PLAYER }}
      />
    )

    expect(await screen.findAllByText('Quiet ingress route')).toHaveLength(2)

    expect(screen.getByText('Use the eastern tunnel and avoid lanterns.')).toBeTruthy()
  })
})
