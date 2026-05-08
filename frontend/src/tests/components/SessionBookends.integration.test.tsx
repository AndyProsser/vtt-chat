import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PresenceState, Role, RoomType, SessionState } from '@shared'
import type { UUID } from '@shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionInit } from '../../components/session/SessionInit'
import { MessageList } from '../../components/chat/MessageList'
import { useStore } from '../../state/store'

const asUuid = (value: string) => value as UUID

const CAMPAIGN_ID = asUuid('11111111-1111-4111-8111-111111111111')
const CURRENT_SESSION_ID = asUuid('22222222-2222-4222-8222-222222222222')
const PREVIOUS_SESSION_ID = asUuid('33333333-3333-4333-8333-333333333333')
const OLD_SESSION_ID = asUuid('44444444-4444-4444-8444-444444444444')
const NEXT_SESSION_ID = asUuid('88888888-8888-4888-8888-888888888888')
const DM_ID = asUuid('55555555-5555-4555-8555-555555555555')
const MAIN_ROOM_ID = asUuid('66666666-6666-4666-8666-666666666666')
const GREEN_ROOM_ID = asUuid('77777777-7777-4777-8777-777777777777')
const NEXT_MAIN_ROOM_ID = asUuid('99999999-9999-4999-8999-999999999999')
const NEXT_GREEN_ROOM_ID = asUuid('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
const EMPTY_SESSION_MESSAGES: Record<UUID, unknown> = {}

let wsConnectionState: 'connected' | 'reconnecting' = 'connected'
const wsSendMock = vi.fn()

vi.mock('../../hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    state: wsConnectionState,
    isConnected: wsConnectionState === 'connected',
    error: null,
    send: wsSendMock,
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
  ChatWindow: ({ sessionId, roomId, user }: any) => {
    const sessionMessages = useStore(
      (state) => (state.messages as any)[sessionId] ?? EMPTY_SESSION_MESSAGES
    )
    const messages = Object.values(sessionMessages)
      .filter((message: any) => message.roomId === roomId)
      .sort((left: any, right: any) => left.createdAt - right.createdAt)

    return (
      <div data-testid="chat-window-with-markers">
        <MessageList messages={messages as any} currentUserId={String(user.id)} />
      </div>
    )
  },
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

function createBaseStoreState() {
  const store = useStore.getState()
  store.clearSessions()
  store.clearMessages()
  store.clearRooms()
  store.reset()
  store.resetToolbarActionsState()
  store.setToolbarRightRailOpen(false)

  store.replaceSessionTopology(
    CURRENT_SESSION_ID,
    [
      {
        id: MAIN_ROOM_ID,
        sessionId: CURRENT_SESSION_ID,
        name: 'Main Room',
        type: RoomType.MAIN,
        createdAt: 1,
        createdBy: DM_ID,
      },
      {
        id: GREEN_ROOM_ID,
        sessionId: CURRENT_SESSION_ID,
        name: 'Green Room',
        type: RoomType.GROUP,
        createdAt: 2,
        createdBy: DM_ID,
      },
    ],
    [
      {
        userId: DM_ID,
        username: 'Morgan',
        state: PresenceState.ONLINE,
        primaryRoomId: GREEN_ROOM_ID,
        lastSeenAt: 1,
      },
    ]
  )
}

function createDefaultFetchMock(options: {
  sessions: Array<{
    id: UUID
    state: SessionState | 'ENDED'
    createdAt: number
    name: string
  }>
}) {
  return vi.fn(async (input: string | URL, init?: RequestInit) => {
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
        json: async () => ({ sessions: options.sessions }),
      }
    }

    if (
      url === `http://localhost:3000/api/v1/session/${CURRENT_SESSION_ID}/state` &&
      init?.method === 'PUT'
    ) {
      const requestedState = (() => {
        try {
          return JSON.parse(String(init.body || '{}')).state as SessionState | undefined
        } catch {
          return undefined
        }
      })()

      return {
        ok: true,
        json: async () => ({
          id: CURRENT_SESSION_ID,
          name: 'Session Current',
          dmId: DM_ID,
          state: requestedState || SessionState.ACTIVE,
          createdAt: 200,
        }),
      }
    }

    if (url.endsWith(`/api/v1/rooms/session/${CURRENT_SESSION_ID}`)) {
      return {
        ok: true,
        json: async () => ({
          rooms: [
            {
              id: MAIN_ROOM_ID,
              sessionId: CURRENT_SESSION_ID,
              name: 'Main Room',
              type: RoomType.MAIN,
              createdBy: DM_ID,
              createdAt: 1,
            },
            {
              id: GREEN_ROOM_ID,
              sessionId: CURRENT_SESSION_ID,
              name: 'Green Room',
              type: RoomType.GROUP,
              createdBy: DM_ID,
              createdAt: 2,
            },
          ],
        }),
      }
    }

    if (url.endsWith(`/api/v1/presence/${CURRENT_SESSION_ID}`)) {
      return {
        ok: true,
        json: async () => ({
          presence: [
            {
              userId: DM_ID,
              username: 'Morgan',
              state: PresenceState.ONLINE,
              primaryRoomId: GREEN_ROOM_ID,
              lastSeenAt: 1,
            },
          ],
        }),
      }
    }

    if (url.endsWith(`/api/v1/audio/sessions/${CURRENT_SESSION_ID}/state`)) {
      return {
        ok: true,
        json: async () => ({ environments: [], dmOverrides: [] }),
      }
    }

    if (url.endsWith(`/api/v1/rooms/session/${NEXT_SESSION_ID}`)) {
      return {
        ok: true,
        json: async () => ({
          rooms: [
            {
              id: NEXT_MAIN_ROOM_ID,
              sessionId: NEXT_SESSION_ID,
              name: 'Main Room',
              type: RoomType.MAIN,
              createdBy: DM_ID,
              createdAt: 1,
            },
            {
              id: NEXT_GREEN_ROOM_ID,
              sessionId: NEXT_SESSION_ID,
              name: 'Green Room',
              type: RoomType.GROUP,
              createdBy: DM_ID,
              createdAt: 2,
            },
          ],
        }),
      }
    }

    if (url.endsWith(`/api/v1/presence/${NEXT_SESSION_ID}`)) {
      return {
        ok: true,
        json: async () => ({
          presence: [
            {
              userId: DM_ID,
              username: 'Morgan',
              state: PresenceState.ONLINE,
              primaryRoomId: NEXT_GREEN_ROOM_ID,
              lastSeenAt: 1,
            },
          ],
        }),
      }
    }

    if (url.endsWith(`/api/v1/audio/sessions/${NEXT_SESSION_ID}/state`)) {
      return {
        ok: true,
        json: async () => ({ environments: [], dmOverrides: [] }),
      }
    }

    if (
      url === `http://localhost:3000/api/campaigns/${CAMPAIGN_ID}/sessions/start` &&
      init?.method === 'POST'
    ) {
      return {
        ok: true,
        json: async () => ({
          session: {
            id: NEXT_SESSION_ID,
            name: 'Session Next',
            dmId: DM_ID,
            state: SessionState.IDLE,
            createdAt: 400,
          },
        }),
      }
    }

    if (
      url === `http://localhost:3000/api/v1/session/${NEXT_SESSION_ID}/state` &&
      init?.method === 'PUT'
    ) {
      return {
        ok: true,
        json: async () => ({
          id: NEXT_SESSION_ID,
          name: 'Session Next',
          dmId: DM_ID,
          state: SessionState.ACTIVE,
          createdAt: 400,
        }),
      }
    }

    throw new Error(`Unexpected fetch call: ${url}`)
  })
}

describe('Session bookend integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    wsConnectionState = 'connected'
    wsSendMock.mockReset()
    createBaseStoreState()
  })

  it('renders a session start marker without injecting an extra summary reminder note', async () => {
    const fetchMock = createDefaultFetchMock({
      sessions: [
        {
          id: PREVIOUS_SESSION_ID,
          name: 'Session Previous',
          dmId: DM_ID,
          state: SessionState.ENDED,
          createdAt: 100,
        } as any,
        {
          id: CURRENT_SESSION_ID,
          name: 'Session Current',
          dmId: DM_ID,
          state: SessionState.IDLE,
          createdAt: 200,
        } as any,
      ],
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <SessionInit
        apiUrl="http://localhost:3000"
        wsUrl="ws://localhost:3000"
        token="token"
        user={{
          id: DM_ID,
          username: 'Morgan',
          role: Role.DM,
        }}
      />
    )

    await screen.findByText('Campaigns')
    fireEvent.click(screen.getByRole('button', { name: 'Launch campaign' }))
    await screen.findByTestId('session-toolbar')

    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    await waitFor(() => {
      expect(screen.getByText(/Session Start:/)).toBeTruthy()
    })

    expect(document.querySelector('.chat-session-marker--bookend')).toBeTruthy()
    expect(screen.queryByText('Session Note: No previous session summary available.')).toBeNull()
  })

  it('keeps chronological bookends and carries greenroom chat into the next session', async () => {
    const fetchMock = createDefaultFetchMock({
      sessions: [
        {
          id: OLD_SESSION_ID,
          name: 'Session Old',
          dmId: DM_ID,
          state: SessionState.ENDED,
          createdAt: 50,
        } as any,
        {
          id: CURRENT_SESSION_ID,
          name: 'Session Current',
          dmId: DM_ID,
          state: SessionState.IDLE,
          createdAt: 300,
        } as any,
        {
          id: PREVIOUS_SESSION_ID,
          name: 'Session Previous',
          dmId: DM_ID,
          state: SessionState.ENDED,
          createdAt: 200,
        } as any,
      ],
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <SessionInit
        apiUrl="http://localhost:3000"
        wsUrl="ws://localhost:3000"
        token="token"
        user={{
          id: DM_ID,
          username: 'Morgan',
          role: Role.DM,
        }}
      />
    )

    await screen.findByText('Campaigns')
    fireEvent.click(screen.getByRole('button', { name: 'Launch campaign' }))
    await screen.findByTestId('session-toolbar')

    act(() => {
      useStore.getState().addMessage(CURRENT_SESSION_ID, {
        id: asUuid('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
        roomId: GREEN_ROOM_ID,
        authorId: DM_ID,
        authorUsername: 'Morgan',
        content: 'Greenroom carry-over message',
        type: 'OOC' as any,
        isDmOnly: false,
        createdAt: Date.now(),
      } as any)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    await waitFor(() => {
      expect(screen.getAllByText(/Session Start:/).length).toBeGreaterThan(0)
    })

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'End session' }))

    await waitFor(() => {
      expect(screen.getAllByText(/Session End:/).length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    await waitFor(() => {
      expect(screen.getAllByText(/Session Start:/).length).toBeGreaterThan(0)
    })

    await waitFor(() => {
      const nextSessionMessages = Object.values(useStore.getState().messages[NEXT_SESSION_ID] || {})
      const carriedMessage = nextSessionMessages.find(
        (message: any) =>
          message.roomId === NEXT_GREEN_ROOM_ID &&
          message.content === 'Greenroom carry-over message'
      )

      expect(carriedMessage).toBeTruthy()
    })
  })
})
