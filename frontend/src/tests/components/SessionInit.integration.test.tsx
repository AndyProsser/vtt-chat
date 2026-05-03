import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PresenceState, Role, RoomType, SessionState } from '@shared'
import type { UUID } from '@shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionInit } from '../../components/session/SessionInit'
import { useStore } from '../../state/store'

const asUuid = (value: string) => value as UUID

const CAMPAIGN_ID = asUuid('11111111-1111-4111-8111-111111111111')
const SESSION_ID = asUuid('22222222-2222-4222-8222-222222222222')
const DM_ID = asUuid('33333333-3333-4333-8333-333333333333')
const PLAYER_ID = asUuid('44444444-4444-4444-8444-444444444444')
const PLAYER_TWO_ID = asUuid('55555555-5555-4555-8555-555555555555')
const ROOM_ONE_ID = asUuid('66666666-6666-4666-8666-666666666666')
const ROOM_TWO_ID = asUuid('77777777-7777-4777-8777-777777777777')

vi.mock('../../hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    state: 'connected',
    isConnected: true,
    error: null,
    send: vi.fn(),
  }),
}))

vi.mock('../../utils/telemetry', () => ({
  createHttpTelemetryTransport: () => vi.fn(),
  telemetryClient: {
    setTransport: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    track: vi.fn(),
    onSessionEnd: vi.fn(),
  },
}))

vi.mock('../../components/chat/ChatWindow', () => ({
  ChatWindow: () => <div>Mock Chat Window</div>,
}))

vi.mock('../../components/notes/NotesPanel', () => ({
  NotesPanel: () => <div>Mock Notes Panel</div>,
}))

vi.mock('../../components/session/DMAudioControls', () => ({
  DMAudioControls: () => <div>Mock DM Audio Controls</div>,
}))

vi.mock('../../components/ui/ReconnectBanner', () => ({
  ReconnectBanner: () => null,
}))

describe('SessionInit integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()

    const store = useStore.getState()
    store.clearSessions()
    store.clearRooms()
    store.reset()
    store.resetToolbarActionsState()
    store.setToolbarRightRailOpen(false)

    store.replaceSessionTopology(
      SESSION_ID,
      [
        {
          id: ROOM_ONE_ID,
          sessionId: SESSION_ID,
          name: 'Strategy Room',
          type: RoomType.MAIN,
          createdAt: 1,
          createdBy: DM_ID,
        },
        {
          id: ROOM_TWO_ID,
          sessionId: SESSION_ID,
          name: 'Archive Cellar',
          type: RoomType.PRIVATE,
          createdAt: 2,
          createdBy: DM_ID,
        },
      ],
      [
        {
          userId: DM_ID,
          username: 'Morgan',
          state: PresenceState.ONLINE,
          primaryRoomId: ROOM_ONE_ID,
          lastSeenAt: 1,
        },
        {
          userId: PLAYER_ID,
          username: 'Tara',
          state: PresenceState.SPEAKING,
          primaryRoomId: ROOM_ONE_ID,
          lastSeenAt: 2,
        },
        {
          userId: PLAYER_TWO_ID,
          username: 'June',
          state: PresenceState.ONLINE,
          primaryRoomId: ROOM_TWO_ID,
          lastSeenAt: 3,
        },
      ]
    )

    store.setDMOverride(PLAYER_ID, {
      userId: PLAYER_ID,
      overrideType: 'MUTE',
      appliedAt: Date.now(),
    })
    store.setCondition({
      id: asUuid('88888888-8888-4888-8888-888888888888'),
      name: 'Silenced',
      effects: {},
    })
  })

  it('updates left-rail participant status when room selection changes', async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input)

      if (url.endsWith('/api/campaigns')) {
        return {
          ok: true,
          json: async () => ({
            campaigns: [
              {
                id: CAMPAIGN_ID,
                name: 'Iron Keep',
                currentDmId: DM_ID,
                inviteCode: 'KEEP-01',
              },
            ],
          }),
        }
      }

      if (url.endsWith(`/api/campaigns/${CAMPAIGN_ID}/sessions`)) {
        return {
          ok: true,
          json: async () => ({
            sessions: [
              {
                id: SESSION_ID,
                name: 'Session Alpha',
                dmId: DM_ID,
                state: SessionState.ACTIVE,
                createdAt: 1,
                description: 'Active field session',
              },
            ],
          }),
        }
      }

      throw new Error(`Unexpected fetch call: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <SessionInit
        apiUrl="http://localhost:3000"
        wsUrl="ws://localhost:3000"
        token="token"
        user={{
          id: PLAYER_ID,
          username: 'Tara',
          role: Role.PLAYER,
        }}
      />
    )

    await screen.findByText('Session Alpha')

    fireEvent.click(screen.getByRole('button', { name: 'Select' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Select room Strategy Room/i })).toBeTruthy()
      expect(screen.getByText('Morgan')).toBeTruthy()
      expect(screen.getByText('Silenced')).toBeTruthy()
      expect(screen.getAllByText('Muted').length).toBeGreaterThan(0)
    })

    expect(screen.queryByText('June')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Select room Archive Cellar/i }))

    await waitFor(() => {
      expect(screen.getByText('June')).toBeTruthy()
    })

    expect(screen.queryByText('Morgan')).toBeNull()
    expect(screen.queryByText('Silenced')).toBeNull()
  })

  it('wires knowledge tabs into the right rail for players', async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input)

      if (url.endsWith('/api/campaigns')) {
        return {
          ok: true,
          json: async () => ({
            campaigns: [
              {
                id: CAMPAIGN_ID,
                name: 'Iron Keep',
                currentDmId: DM_ID,
                inviteCode: 'KEEP-01',
              },
            ],
          }),
        }
      }

      if (url.endsWith(`/api/campaigns/${CAMPAIGN_ID}/sessions`)) {
        return {
          ok: true,
          json: async () => ({
            sessions: [
              {
                id: SESSION_ID,
                name: 'Session Alpha',
                dmId: DM_ID,
                state: SessionState.ACTIVE,
                createdAt: 1,
                description: 'Active field session',
              },
            ],
          }),
        }
      }

      if (url.endsWith(`/api/chat/messages/${SESSION_ID}`)) {
        return {
          ok: true,
          json: async () => ({
            messages: [
              {
                id: asUuid('99999999-9999-4999-8999-999999999999'),
                authorId: PLAYER_ID,
                authorUsername: 'Tara',
                content: 'Archive map ready.',
                type: 'OOC',
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
                id: asUuid('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'),
                authorId: PLAYER_ID,
                authorUsername: 'Tara',
                title: 'Archive route',
                content: 'Cellar route confirmed.',
                visibility: 'PLAYERS_VISIBLE',
                tags: ['route'],
                allowedUsers: [],
                createdAt: 5,
                updatedAt: 8,
              },
            ],
          }),
        }
      }

      if (url.includes(`/api/session/${SESSION_ID}/logs`)) {
        return {
          ok: true,
          json: async () => ({
            logs: [
              {
                id: 'log-1',
                sessionId: SESSION_ID,
                userId: DM_ID,
                username: 'Morgan',
                eventType: 'STATE_CHANGED',
                detail: 'Session state changed from IDLE to ACTIVE',
                createdAt: '2026-04-23T10:00:00.000Z',
              },
            ],
          }),
        }
      }

      throw new Error(`Unexpected fetch call: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <SessionInit
        apiUrl="http://localhost:3000"
        wsUrl="ws://localhost:3000"
        token="token"
        user={{
          id: PLAYER_ID,
          username: 'Tara',
          role: Role.PLAYER,
        }}
      />
    )

    await screen.findByText('Session Alpha')
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))

    const notesTab = screen.getByRole('tab', { name: 'Tool Notes' })
    fireEvent.click(notesTab)
    expect(await screen.findByTestId('notes-rail-panel')).toBeTruthy()
    expect(screen.getByText('Archive route')).toBeTruthy()

    const searchTab = screen.getByRole('tab', { name: 'Tool Search' })
    fireEvent.click(searchTab)
    expect(await screen.findByTestId('search-panel')).toBeTruthy()
    expect(screen.getByPlaceholderText('Search notes, chat, rooms, or players')).toBeTruthy()

    const journalTab = screen.getByRole('tab', { name: 'Tool Journal' })
    fireEvent.click(journalTab)
    expect(await screen.findByTestId('journal-panel')).toBeTruthy()
    expect(screen.getByText('Archive route')).toBeTruthy()

    const historyTab = screen.getByRole('tab', { name: 'Tool History' })
    fireEvent.click(historyTab)
    expect(await screen.findByTestId('history-panel')).toBeTruthy()
    expect(screen.getByText('Session state changed from IDLE to ACTIVE')).toBeTruthy()
  })

  it('auto-applies default journal and history presets after switching rail tabs', async () => {
    const localStorageState = new Map<string, string>()
    const userScope = String(PLAYER_ID)
    localStorageState.set(
      `vtt-chat:journal:filter-presets:${userScope}:${SESSION_ID}`,
      JSON.stringify([
        {
          name: 'Map default',
          viewMode: 'all',
          tag: 'map',
          isDefault: true,
        },
      ])
    )
    localStorageState.set(
      `vtt-chat:history:filter-presets:${userScope}:${SESSION_ID}`,
      JSON.stringify([
        {
          name: 'Morgan default',
          eventType: 'all',
          actor: 'Morgan',
          window: 'all',
          isDefault: true,
        },
      ])
    )

    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => localStorageState.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        localStorageState.set(key, value)
      }),
    })

    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input)

      if (url.endsWith('/api/campaigns')) {
        return {
          ok: true,
          json: async () => ({
            campaigns: [
              {
                id: CAMPAIGN_ID,
                name: 'Iron Keep',
                currentDmId: DM_ID,
                inviteCode: 'KEEP-01',
              },
            ],
          }),
        }
      }

      if (url.endsWith(`/api/campaigns/${CAMPAIGN_ID}/sessions`)) {
        return {
          ok: true,
          json: async () => ({
            sessions: [
              {
                id: SESSION_ID,
                name: 'Session Alpha',
                dmId: DM_ID,
                state: SessionState.ACTIVE,
                createdAt: 1,
                description: 'Active field session',
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
                id: asUuid('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'),
                authorId: PLAYER_ID,
                authorUsername: 'Tara',
                title: 'Archive route',
                content: 'Cellar route confirmed.',
                visibility: 'PLAYERS_VISIBLE',
                tags: ['route'],
                allowedUsers: [],
                createdAt: 5,
                updatedAt: 8,
              },
              {
                id: asUuid('bbbbbbbb-cccc-4ddd-8eee-ffffffffffff'),
                authorId: PLAYER_ID,
                authorUsername: 'Tara',
                title: 'Tunnel map',
                content: 'Tunnel map annotations.',
                visibility: 'PLAYERS_VISIBLE',
                tags: ['map'],
                allowedUsers: [],
                createdAt: 9,
                updatedAt: 10,
              },
            ],
          }),
        }
      }

      if (url.endsWith(`/api/chat/messages/${SESSION_ID}`)) {
        return {
          ok: true,
          json: async () => ({
            messages: [
              {
                id: asUuid('99999999-9999-4999-8999-999999999999'),
                authorId: PLAYER_ID,
                authorUsername: 'Tara',
                content: 'Archive map ready.',
                type: 'OOC',
                isDmOnly: false,
                createdAt: 10,
              },
            ],
          }),
        }
      }

      if (url.includes(`/api/session/${SESSION_ID}/logs`)) {
        return {
          ok: true,
          json: async () => ({
            logs: [
              {
                id: 'log-1',
                sessionId: SESSION_ID,
                userId: DM_ID,
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
        }
      }

      throw new Error(`Unexpected fetch call: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <SessionInit
        apiUrl="http://localhost:3000"
        wsUrl="ws://localhost:3000"
        token="token"
        user={{
          id: PLAYER_ID,
          username: 'Tara',
          role: Role.PLAYER,
        }}
      />
    )

    await screen.findByText('Session Alpha')
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))

    const journalTab = screen.getByRole('tab', { name: 'Tool Journal' })
    fireEvent.click(journalTab)
    expect(await screen.findByTestId('journal-panel')).toBeTruthy()

    await waitFor(() => {
      expect(screen.getByText('Tunnel map')).toBeTruthy()
      expect(screen.queryByText('Archive route')).toBeNull()
    })

    fireEvent.change(screen.getByLabelText('Tag'), { target: { value: 'all' } })
    expect(screen.getByText('Archive route')).toBeTruthy()

    const searchTab = screen.getByRole('tab', { name: 'Tool Search' })
    fireEvent.click(searchTab)
    expect(await screen.findByTestId('search-panel')).toBeTruthy()

    fireEvent.click(journalTab)
    expect(await screen.findByTestId('journal-panel')).toBeTruthy()

    await waitFor(() => {
      expect(screen.getByText('Tunnel map')).toBeTruthy()
      expect(screen.queryByText('Archive route')).toBeNull()
    })

    const historyTab = screen.getByRole('tab', { name: 'Tool History' })
    fireEvent.click(historyTab)
    expect(await screen.findByTestId('history-panel')).toBeTruthy()

    await waitFor(() => {
      expect(screen.getByText('Session state changed from IDLE to ACTIVE')).toBeTruthy()
      expect(screen.queryByText('Tara joined main room')).toBeNull()
    })

    fireEvent.change(screen.getByLabelText('Actor'), { target: { value: 'all' } })
    expect(screen.getByText('Tara joined main room')).toBeTruthy()

    const notesTab = screen.getByRole('tab', { name: 'Tool Notes' })
    fireEvent.click(notesTab)
    expect(await screen.findByTestId('notes-rail-panel')).toBeTruthy()

    fireEvent.click(historyTab)
    expect(await screen.findByTestId('history-panel')).toBeTruthy()

    await waitFor(() => {
      expect(screen.getByText('Session state changed from IDLE to ACTIVE')).toBeTruthy()
      expect(screen.queryByText('Tara joined main room')).toBeNull()
    })
  })
})
