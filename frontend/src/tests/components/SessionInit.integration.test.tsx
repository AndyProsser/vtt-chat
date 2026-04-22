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
      expect(screen.getByText('Muted')).toBeTruthy()
    })

    expect(screen.queryByText('June')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Select room Archive Cellar/i }))

    await waitFor(() => {
      expect(screen.getByText('June')).toBeTruthy()
    })

    expect(screen.queryByText('Morgan')).toBeNull()
    expect(screen.queryByText('Silenced')).toBeNull()
    expect(screen.queryByText('Muted')).toBeNull()
  })
})
