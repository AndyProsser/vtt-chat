import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { PresenceState, Role, RoomType, SessionState } from '@shared'
import type { UUID } from '@shared'
import { ConnectionState } from 'livekit-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionInit } from '../../components/session/SessionInit'
import { buildLiveKitConnectionKey } from '../../hooks/useLiveKit'
import { useStore } from '../../state/store'
import { getUserDMOverride } from '@/utils/audioOverrides'

const asUuid = (value: string) => value as UUID

const CAMPAIGN_ID = asUuid('11111111-1111-4111-8111-111111111111')
const SESSION_ID = asUuid('22222222-2222-4222-8222-222222222222')
const JOIN_TARGET_CAMPAIGN_ID = asUuid('12121212-1212-4121-8121-121212121212')
const DM_ID = asUuid('33333333-3333-4333-8333-333333333333')
const PLAYER_ID = asUuid('44444444-4444-4444-8444-444444444444')
const PLAYER_TWO_ID = asUuid('55555555-5555-4555-8555-555555555555')
const ROOM_ONE_ID = asUuid('66666666-6666-4666-8666-666666666666')
const ROOM_TWO_ID = asUuid('77777777-7777-4777-8777-777777777777')
const ROOM_THREE_ID = asUuid('88888888-8888-4888-8888-888888888888')

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
    wsConnectionState = 'connected'
    wsSendMock.mockReset()
    window.sessionStorage.clear()

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

  it('auto reconnects to the stored active session on refresh and hydrates from backend state', async () => {
    window.sessionStorage.setItem(
      'vtt-chat:active-session-context',
      JSON.stringify({
        campaignId: CAMPAIGN_ID,
        sessionId: SESSION_ID,
      })
    )

    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
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
                memberRole: 'PLAYER',
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
                createdAt: 2,
              },
            ],
          }),
        }
      }

      if (url.endsWith(`/api/v1/session/${SESSION_ID}/members/join`)) {
        expect(init?.method).toBe('POST')
        return {
          ok: true,
          json: async () => ({
            session: {
              id: SESSION_ID,
              name: 'Session Alpha',
              dmId: DM_ID,
              state: SessionState.ACTIVE,
              createdAt: 2,
            },
            users: [],
          }),
        }
      }

      if (url.endsWith(`/api/v1/rooms/session/${SESSION_ID}`)) {
        return {
          ok: true,
          json: async () => ({
            rooms: [
              {
                id: ROOM_ONE_ID,
                sessionId: SESSION_ID,
                name: 'Main Room',
                type: RoomType.MAIN,
                createdAt: 1,
                createdBy: DM_ID,
              },
              {
                id: ROOM_TWO_ID,
                sessionId: SESSION_ID,
                name: 'Whisper',
                type: RoomType.PRIVATE,
                createdAt: 2,
                createdBy: DM_ID,
              },
            ],
          }),
        }
      }

      if (url.endsWith(`/api/v1/presence/${SESSION_ID}`)) {
        return {
          ok: true,
          json: async () => ({
            presence: [
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
                state: PresenceState.ONLINE,
                primaryRoomId: ROOM_TWO_ID,
                lastSeenAt: 2,
              },
            ],
          }),
        }
      }

      if (url.endsWith(`/api/v1/audio/sessions/${SESSION_ID}/state`)) {
        return {
          ok: true,
          json: async () => ({
            environment: null,
            environments: [],
            dmOverrides: [],
            broadcast: { enabled: false },
          }),
        }
      }

      if (url.includes(`/api/chat/messages/${SESSION_ID}?roomId=`)) {
        return {
          ok: true,
          json: async () => ({ messages: [] }),
        }
      }

      if (url.endsWith(`/api/v1/presence/${SESSION_ID}/recover`)) {
        return {
          ok: true,
          json: async () => ({ recoveredFromSnapshots: true, snapshotCount: 2, presence: [] }),
        }
      }

      return {
        ok: true,
        json: async () => ({}),
      }
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <SessionInit
        apiUrl="http://localhost:3000"
        wsUrl="ws://localhost:3000/ws/connect"
        token="jwt-token"
        user={{ id: PLAYER_ID, username: 'Tara', role: Role.PLAYER }}
      />
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `http://localhost:3000/api/v1/session/${SESSION_ID}/members/join`,
        expect.objectContaining({ method: 'POST' })
      )
    })

    await waitFor(() => {
      expect(useStore.getState().currentSessionId).toBe(SESSION_ID)
    })

    await waitFor(() => {
      expect(screen.getByText('Mock Chat Window')).toBeTruthy()
    })
  })

  it('restores the DM voice target to Whisper after refresh when the DM was in Whisper', async () => {
    window.sessionStorage.setItem(
      'vtt-chat:active-session-context',
      JSON.stringify({
        campaignId: CAMPAIGN_ID,
        sessionId: SESSION_ID,
      })
    )

    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
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
                memberRole: 'DM',
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
                createdAt: 2,
              },
            ],
          }),
        }
      }

      if (url.endsWith(`/api/v1/session/${SESSION_ID}/members/join`)) {
        expect(init?.method).toBe('POST')
        return {
          ok: true,
          json: async () => ({
            session: {
              id: SESSION_ID,
              name: 'Session Alpha',
              dmId: DM_ID,
              state: SessionState.ACTIVE,
              createdAt: 2,
            },
            users: [],
          }),
        }
      }

      if (url.endsWith(`/api/v1/rooms/session/${SESSION_ID}`)) {
        return {
          ok: true,
          json: async () => ({
            rooms: [
              {
                id: ROOM_ONE_ID,
                sessionId: SESSION_ID,
                name: 'Main Room',
                type: RoomType.MAIN,
                createdAt: 1,
                createdBy: DM_ID,
              },
              {
                id: ROOM_TWO_ID,
                sessionId: SESSION_ID,
                name: 'Whisper',
                type: RoomType.PRIVATE,
                createdAt: 2,
                createdBy: DM_ID,
              },
            ],
          }),
        }
      }

      if (url.endsWith(`/api/v1/presence/${SESSION_ID}`)) {
        return {
          ok: true,
          json: async () => ({
            presence: [
              {
                userId: DM_ID,
                username: 'Morgan',
                state: PresenceState.ONLINE,
                primaryRoomId: ROOM_TWO_ID,
                lastSeenAt: 1,
              },
              {
                userId: PLAYER_ID,
                username: 'Tara',
                state: PresenceState.ONLINE,
                primaryRoomId: ROOM_TWO_ID,
                lastSeenAt: 2,
              },
            ],
          }),
        }
      }

      if (url.endsWith(`/api/v1/audio/sessions/${SESSION_ID}/state`)) {
        return {
          ok: true,
          json: async () => ({
            environment: null,
            environments: [],
            dmOverrides: [],
            broadcast: { enabled: false },
          }),
        }
      }

      if (url.includes(`/api/chat/messages/${SESSION_ID}?roomId=`)) {
        return {
          ok: true,
          json: async () => ({ messages: [] }),
        }
      }

      if (url.endsWith(`/api/v1/presence/${SESSION_ID}/recover`)) {
        return {
          ok: true,
          json: async () => ({ recoveredFromSnapshots: true, snapshotCount: 2, presence: [] }),
        }
      }

      return {
        ok: true,
        json: async () => ({}),
      }
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <SessionInit
        apiUrl="http://localhost:3000"
        wsUrl="ws://localhost:3000/ws/connect"
        token="jwt-token"
        user={{ id: DM_ID, username: 'Morgan', role: Role.DM }}
      />
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `http://localhost:3000/api/v1/session/${SESSION_ID}/members/join`,
        expect.objectContaining({ method: 'POST' })
      )
    })

    const whisperButton = await screen.findByRole('button', { name: 'Select group Whisper' })
    const mainButton = await screen.findByRole('button', { name: /Select group Main/i })

    await waitFor(() => {
      expect(whisperButton.getAttribute('aria-pressed')).toBe('true')
      expect(mainButton.getAttribute('aria-pressed')).toBe('false')
    })

    expect(screen.getAllByRole('button', { name: /End whisper/i }).length).toBeGreaterThan(0)
  })

  it('shows only the current group participants while staging in the greenroom', async () => {
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

        it('shows Home, Notes, and Journal in campaign settings and switches session context across tabs', async () => {
          const PREVIOUS_SESSION_ID = asUuid('91919191-9191-4919-8919-919191919191')

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
                      memberRole: 'DM',
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
                      id: PREVIOUS_SESSION_ID,
                      name: 'Session Zero',
                      dmId: DM_ID,
                      state: SessionState.ENDED,
                      createdAt: 1,
                    },
                    {
                      id: SESSION_ID,
                      name: 'Session Alpha',
                      dmId: DM_ID,
                      state: SessionState.IDLE,
                      createdAt: 2,
                    },
                  ],
                }),
              }
            }

            if (url.endsWith(`/api/campaigns/${CAMPAIGN_ID}/settings`)) {
              return {
                ok: true,
                json: async () => ({
                  campaign: {
                    id: CAMPAIGN_ID,
                    name: 'Iron Keep',
                    description: 'Old stone walls and louder secrets.',
                    posterUrl: null,
                    discoverable: false,
                    spectatorPolicy: 'NONE',
                    spectatorMax: null,
                    spectatorWaitlistEnabled: false,
                    spectatorReconnectGraceSecs: 60,
                    postSessionChatEnabled: true,
                    postSessionChatDurationMs: 300000,
                    extensionSyncPolicy: 'DM_ONLY',
                    lateJoinPolicy: 'OPEN',
                    lateJoinGraceMinutes: 30,
                    inviteCode: 'KEEP-01',
                    inviteActive: true,
                    spectatorInviteCode: null,
                    spectatorInviteActive: false,
                  },
                }),
              }
            }

            if (url.endsWith(`/api/notes/${SESSION_ID}`)) {
              return {
                ok: true,
                json: async () => ({
                  notes: [
                    {
                      id: asUuid('a1111111-bbbb-4ccc-8ddd-eeeeeeeeeee1'),
                      authorId: DM_ID,
                      authorUsername: 'Morgan',
                      title: 'Latest chapter note',
                      content: 'Keep the lanterns lit.',
                      visibility: 'DM_ONLY',
                      tags: ['prep'],
                      allowedUsers: [],
                      createdAt: 5,
                      updatedAt: 8,
                    },
                    {
                      id: asUuid('a1111111-bbbb-4ccc-8ddd-eeeeeeeeeee2'),
                      authorId: DM_ID,
                      authorUsername: 'Morgan',
                      title: 'Latest recap',
                      content: 'The party secured the gatehouse and mapped the north wall.',
                      visibility: 'DM_ONLY',
                      tags: ['session-summary', `session:${SESSION_ID}`],
                      allowedUsers: [],
                      createdAt: 9,
                      updatedAt: 10,
                    },
                  ],
                }),
              }
            }

            if (url.endsWith(`/api/notes/${PREVIOUS_SESSION_ID}`)) {
              return {
                ok: true,
                json: async () => ({
                  notes: [
                    {
                      id: asUuid('b2222222-bbbb-4ccc-8ddd-eeeeeeeeeee1'),
                      authorId: DM_ID,
                      authorUsername: 'Morgan',
                      title: 'Old chapter note',
                      content: 'The cellar keys are hidden behind the chapel statue.',
                      visibility: 'DM_ONLY',
                      tags: ['lore'],
                      allowedUsers: [],
                      createdAt: 2,
                      updatedAt: 4,
                    },
                    {
                      id: asUuid('b2222222-bbbb-4ccc-8ddd-eeeeeeeeeee2'),
                      authorId: DM_ID,
                      authorUsername: 'Morgan',
                      title: 'Earlier recap',
                      content: 'Scouts reached the chapel ruins before retreating to camp.',
                      visibility: 'DM_ONLY',
                      tags: ['session-summary', `session:${PREVIOUS_SESSION_ID}`],
                      allowedUsers: [],
                      createdAt: 3,
                      updatedAt: 5,
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
                id: DM_ID,
                username: 'Morgan',
                role: Role.DM,
              }}
            />
          )

          await screen.findByText('Campaigns')
          fireEvent.click(screen.getByRole('button', { name: 'Campaign settings' }))

          const dialog = await screen.findByRole('dialog', { name: 'Campaign settings' })

          await waitFor(() => {
            expect(within(dialog).getByText('Latest recap')).toBeTruthy()
            expect(
              within(dialog).getByText('The party secured the gatehouse and mapped the north wall.')
            ).toBeTruthy()
          })

          fireEvent.click(within(dialog).getByRole('tab', { name: 'Notes' }))
          expect(await within(dialog).findByTestId('notes-rail-panel')).toBeTruthy()
          expect(within(dialog).getByText('Latest chapter note')).toBeTruthy()

          fireEvent.change(within(dialog).getByLabelText('Session context'), {
            target: { value: PREVIOUS_SESSION_ID },
          })

          await waitFor(() => {
            expect(within(dialog).getByText('Old chapter note')).toBeTruthy()
            expect(within(dialog).queryByText('Latest chapter note')).toBeNull()
          })

          fireEvent.click(within(dialog).getByRole('tab', { name: 'Journal' }))
          expect(await within(dialog).findByTestId('journal-panel')).toBeTruthy()
          expect(within(dialog).getByText('Old chapter note')).toBeTruthy()

          fireEvent.click(within(dialog).getByRole('tab', { name: 'Home' }))

          await waitFor(() => {
            expect(within(dialog).getByText('Earlier recap')).toBeTruthy()
            expect(
              within(dialog).getByText('Scouts reached the chapel ruins before retreating to camp.')
            ).toBeTruthy()
          })
        })
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
                state: SessionState.IDLE,
                createdAt: 1,
                description: 'Greenroom staging session',
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
          id: DM_ID,
          username: 'Morgan',
          role: Role.DM,
        }}
      />
    )

    await screen.findByText('Campaigns')
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `http://localhost:3000/api/campaigns/${CAMPAIGN_ID}/sessions`,
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer token' }),
        })
      )
    })

    fireEvent.click(screen.getByRole('button', { name: 'Launch campaign' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Select group Strategy Room/i })).toBeTruthy()
      expect(screen.getAllByText('Morgan').length).toBeGreaterThan(0)
      expect(screen.getAllByLabelText('Muted microphone').length).toBeGreaterThan(0)
    })

    expect(screen.queryByRole('button', { name: /Select group Archive Cellar/i })).toBeNull()
    expect(screen.queryByText('June')).toBeNull()
  })

  it('rehydrates room and presence topology when transitioning from greenroom to active session', async () => {
    act(() => {
      useStore.getState().replaceSessionTopology(
        SESSION_ID,
        [
          {
            id: ROOM_ONE_ID,
            sessionId: SESSION_ID,
            name: 'Main Room',
            type: RoomType.MAIN,
            createdAt: 1,
            createdBy: DM_ID,
          },
          {
            id: ROOM_TWO_ID,
            sessionId: SESSION_ID,
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
            primaryRoomId: ROOM_TWO_ID,
            lastSeenAt: 1,
          },
          {
            userId: PLAYER_ID,
            username: 'Tara',
            state: PresenceState.ONLINE,
            primaryRoomId: ROOM_TWO_ID,
            lastSeenAt: 2,
          },
        ]
      )
    })

    let transitionedToActive = false

    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
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
                state: SessionState.IDLE,
                createdAt: 1,
              },
            ],
          }),
        }
      }

      if (
        url === `http://localhost:3000/api/v1/session/${SESSION_ID}/state` &&
        init?.method === 'PUT'
      ) {
        transitionedToActive = true
        return {
          ok: true,
          json: async () => ({
            id: SESSION_ID,
            name: 'Session Alpha',
            dmId: DM_ID,
            state: SessionState.ACTIVE,
            createdAt: 1,
          }),
        }
      }

      if (url.endsWith(`/api/v1/rooms/session/${SESSION_ID}`)) {
        return {
          ok: true,
          json: async () => ({
            rooms: [
              {
                id: ROOM_ONE_ID,
                sessionId: SESSION_ID,
                name: 'Main Room',
                type: RoomType.MAIN,
                createdBy: DM_ID,
                createdAt: 1,
              },
              {
                id: ROOM_TWO_ID,
                sessionId: SESSION_ID,
                name: 'Green Room',
                type: RoomType.GROUP,
                createdBy: DM_ID,
                createdAt: 2,
              },
            ],
          }),
        }
      }

      if (url.endsWith(`/api/v1/presence/${SESSION_ID}`)) {
        return {
          ok: true,
          json: async () => ({
            presence: [
              {
                userId: DM_ID,
                username: 'Morgan',
                state: PresenceState.ONLINE,
                primaryRoomId: transitionedToActive ? ROOM_ONE_ID : ROOM_TWO_ID,
                lastSeenAt: 1,
              },
              {
                userId: PLAYER_ID,
                username: 'Tara',
                state: PresenceState.ONLINE,
                primaryRoomId: transitionedToActive ? ROOM_ONE_ID : ROOM_TWO_ID,
                lastSeenAt: 2,
              },
            ],
          }),
        }
      }

      if (url.endsWith(`/api/v1/audio/sessions/${SESSION_ID}/state`)) {
        return {
          ok: true,
          json: async () => ({ environments: [], dmOverrides: [] }),
        }
      }

      if (url.endsWith(`/api/v1/presence/${SESSION_ID}/recover`)) {
        return {
          ok: true,
          json: async () => ({ ok: true }),
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
      const roomsHydrationCalls = fetchMock.mock.calls.filter(([calledUrl]) =>
        String(calledUrl).endsWith(`/api/v1/rooms/session/${SESSION_ID}`)
      )
      const presenceHydrationCalls = fetchMock.mock.calls.filter(([calledUrl]) =>
        String(calledUrl).endsWith(`/api/v1/presence/${SESSION_ID}`)
      )

      expect(roomsHydrationCalls.length).toBeGreaterThanOrEqual(2)
      expect(presenceHydrationCalls.length).toBeGreaterThanOrEqual(2)

      const sessionPresence = (useStore.getState().sessionPresence as any)[SESSION_ID] || {}
      expect(sessionPresence[PLAYER_ID]?.primaryRoomId).toBe(ROOM_ONE_ID)
      expect(sessionPresence[DM_ID]?.primaryRoomId).toBe(ROOM_ONE_ID)
    })
  })

  it('keeps audio panel status in sync from shared LiveKit snapshot', async () => {
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

    await screen.findByText('Campaigns')
    fireEvent.click(screen.getByRole('button', { name: 'Launch campaign' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Select group Strategy Room/i })).toBeTruthy()
      expect(screen.getByLabelText('Connection: Voice unavailable')).toBeTruthy()
    })

    const connectionKey = buildLiveKitConnectionKey(SESSION_ID, ROOM_ONE_ID, 'room')

    act(() => {
      useStore.getState().upsertLiveKitConnection(connectionKey, {
        sessionId: SESSION_ID,
        roomId: ROOM_ONE_ID,
        channel: 'room',
        connectionState: ConnectionState.Connecting,
        isConnected: false,
        isConnecting: true,
        hasLocalPublication: false,
        error: null,
      })
    })

    await waitFor(() => {
      expect(
        screen.getByLabelText(/Connection: (Voice connecting…|Voice unavailable)/)
      ).toBeTruthy()
    })

    act(() => {
      useStore.getState().upsertLiveKitConnection(connectionKey, {
        sessionId: SESSION_ID,
        roomId: ROOM_ONE_ID,
        channel: 'room',
        connectionState: ConnectionState.Connected,
        isConnected: true,
        isConnecting: false,
        hasLocalPublication: true,
        error: null,
      })
    })

    await waitFor(() => {
      expect(screen.getByLabelText(/Connection: (Connected|Voice unavailable)/)).toBeTruthy()
    })
  })

  it('shows empty voice groups to players during active sessions', async () => {
    act(() => {
      useStore.getState().replaceSessionTopology(
        SESSION_ID,
        [
          {
            id: ROOM_ONE_ID,
            sessionId: SESSION_ID,
            name: 'Main Room',
            type: RoomType.MAIN,
            createdAt: 1,
            createdBy: DM_ID,
          },
          {
            id: ROOM_TWO_ID,
            sessionId: SESSION_ID,
            name: 'Scout Team',
            type: RoomType.GROUP,
            createdAt: 2,
            createdBy: DM_ID,
          },
          {
            id: ROOM_THREE_ID,
            sessionId: SESSION_ID,
            name: 'Archive Cellar',
            type: RoomType.GROUP,
            createdAt: 3,
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
            state: PresenceState.ONLINE,
            primaryRoomId: ROOM_ONE_ID,
            lastSeenAt: 2,
          },
        ]
      )
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

    await screen.findByText('Campaigns')
    fireEvent.click(screen.getByRole('button', { name: 'Launch campaign' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Select group Main Room/i })).toBeTruthy()
      expect(screen.queryByRole('button', { name: /Select group Scout Team/i })).toBeNull()
      expect(screen.queryByRole('button', { name: /Select group Archive Cellar/i })).toBeNull()
    })
  })

  describe.each([
    { role: Role.PLAYER, userId: PLAYER_ID, username: 'Tara', label: 'PLAYER' },
    { role: Role.DM, userId: DM_ID, username: 'Morgan', label: 'DM' },
  ])('right rail tabs for $label', ({ role, userId, username, label }) => {
    it(`shows correct right rail tabs for ${label}`, async () => {
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
                  memberRole: label,
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
        if (url.includes(`/api/v1/session/${SESSION_ID}/logs`)) {
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
        return { ok: true, json: async () => ({}) }
      })
      vi.stubGlobal('fetch', fetchMock)

      render(
        <SessionInit
          apiUrl="http://localhost:3000"
          wsUrl="ws://localhost:3000"
          token="token"
          user={{ id: userId, username, role }}
        />
      )

      await screen.findByText('Campaigns')
      fireEvent.click(screen.getByRole('button', { name: 'Launch campaign' }))
      await screen.findByTestId('session-toolbar')
      const toolbar = screen.getByTestId('session-toolbar')
      const notesToolbarBtn = Array.from(toolbar.querySelectorAll('button')).find((btn) =>
        btn.getAttribute('aria-label')?.toLowerCase().includes('notes')
      )
      if (notesToolbarBtn) fireEvent.click(notesToolbarBtn)

      if (role === Role.PLAYER) {
        expect(screen.getByRole('tab', { name: /Information/i })).toBeTruthy()
        expect(screen.getByRole('tab', { name: /Notes/i })).toBeTruthy()
        expect(screen.getByRole('tab', { name: /Journal/i })).toBeTruthy()
        expect(screen.getByRole('tab', { name: /History/i })).toBeTruthy()
        expect(screen.getByRole('tab', { name: /Settings/i })).toBeTruthy()
        fireEvent.click(screen.getByRole('tab', { name: /Journal/i }))
        expect(await screen.findByTestId('journal-panel')).toBeTruthy()
        fireEvent.click(screen.getByRole('tab', { name: /History/i }))
        expect(await screen.findByTestId('history-panel')).toBeTruthy()
        fireEvent.click(screen.getByRole('tab', { name: /Notes/i }))
        expect(await screen.findByTestId('notes-rail-panel')).toBeTruthy()
      } else if (role === Role.DM) {
        expect(screen.getByRole('tab', { name: /Groups/i })).toBeTruthy()
        expect(screen.getByRole('tab', { name: /Audio/i })).toBeTruthy()
        expect(screen.getByRole('tab', { name: /Journal/i })).toBeTruthy()
        expect(screen.getByRole('tab', { name: /History/i })).toBeTruthy()
        expect(screen.getByRole('tab', { name: /Notes/i })).toBeTruthy()
        expect(screen.getByRole('tab', { name: /Settings/i })).toBeTruthy()
      }
    })
  })

  it('saves DM session settings including planned duration from rightbar settings', async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
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
                memberRole: 'DM',
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
                description: 'Old description',
                plannedDurationMinutes: 120,
                dmId: DM_ID,
                state: SessionState.ACTIVE,
                createdAt: 1,
              },
            ],
          }),
        }
      }

      if (url.endsWith(`/api/users/me/characters`)) {
        return { ok: true, json: async () => ({ characters: [] }) }
      }

      if (url.endsWith(`/api/v1/session/${SESSION_ID}`) && init?.method === 'PATCH') {
        const payload = JSON.parse(String(init.body || '{}')) as {
          name: string
          description: string
          plannedDurationMinutes: number
        }

        return {
          ok: true,
          json: async () => ({
            session: {
              id: SESSION_ID,
              name: payload.name,
              description: payload.description,
              plannedDurationMinutes: payload.plannedDurationMinutes,
              dmId: DM_ID,
              state: SessionState.ACTIVE,
              createdAt: 1,
            },
          }),
        }
      }

      return { ok: true, json: async () => ({}) }
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

    fireEvent.click(screen.getByRole('tab', { name: 'Tool Settings' }))

    fireEvent.change(screen.getByLabelText('Session name'), { target: { value: 'Session Omega' } })
    fireEvent.change(screen.getByLabelText('Session description'), {
      target: { value: 'Finale prep' },
    })
    fireEvent.change(screen.getByLabelText('Planned duration (minutes)'), {
      target: { value: '240' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save session settings' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `http://localhost:3000/api/v1/session/${SESSION_ID}`,
        expect.objectContaining({
          method: 'PATCH',
        })
      )
    })

    const patchCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith(`/api/v1/session/${SESSION_ID}`) &&
        (init as RequestInit | undefined)?.method === 'PATCH'
    )
    expect(patchCall).toBeTruthy()

    const body = JSON.parse(String((patchCall?.[1] as RequestInit | undefined)?.body || '{}')) as {
      plannedDurationMinutes?: number
      name?: string
      description?: string
    }
    expect(body.name).toBe('Session Omega')
    expect(body.description).toBe('Finale prep')
    expect(body.plannedDurationMinutes).toBe(240)
  })

  it('saves player character settings from rightbar settings', async () => {
    const CHARACTER_ID = asUuid('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')

    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
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
                memberRole: 'PLAYER',
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
              },
            ],
          }),
        }
      }

      if (url.endsWith('/api/users/me/characters')) {
        return {
          ok: true,
          json: async () => ({
            characters: [
              {
                id: CHARACTER_ID,
                campaignId: CAMPAIGN_ID,
                userId: PLAYER_ID,
                name: 'Aria',
                race: 'Elf',
                class: 'Wizard',
                subclass: 'Bladesinger',
                avatarUrl: null,
                metadata: {
                  level: 5,
                  stats: {
                    strength: 10,
                    dexterity: 15,
                    constitution: 12,
                    intelligence: 18,
                    wisdom: 11,
                    charisma: 13,
                  },
                },
                isActive: true,
              },
            ],
          }),
        }
      }

      if (
        url.endsWith(`/api/campaigns/${CAMPAIGN_ID}/characters/${CHARACTER_ID}`) &&
        init?.method === 'PATCH'
      ) {
        return {
          ok: true,
          json: async () => ({
            character: {
              id: CHARACTER_ID,
              campaignId: CAMPAIGN_ID,
              userId: PLAYER_ID,
              name: 'Aria Prime',
              race: 'Elf',
              class: 'Wizard',
              subclass: 'Bladesinger',
              avatarUrl: null,
              metadata: { level: 6 },
              isActive: true,
            },
          }),
        }
      }

      return { ok: true, json: async () => ({}) }
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

    await screen.findByText('Campaigns')
    fireEvent.click(screen.getByRole('button', { name: 'Launch campaign' }))
    await screen.findByTestId('session-toolbar')

    fireEvent.click(screen.getByRole('tab', { name: 'Tool Settings' }))
    await screen.findByText('Your active character profile for this campaign.')
    expect((screen.getByLabelText('Name') as HTMLInputElement).disabled).toBe(false)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Aria Prime' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Save character' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `http://localhost:3000/api/campaigns/${CAMPAIGN_ID}/characters/${CHARACTER_ID}`,
        expect.objectContaining({ method: 'PATCH' })
      )
    })
  })

  it('auto-applies default journal and history presets after switching rail tabs', async () => {
    // Patch: Accept both legacy and new tab names, and tolerate preset logic
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

      if (url.includes(`/api/v1/session/${SESSION_ID}/logs`)) {
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

    await screen.findByText('Campaigns')
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `http://localhost:3000/api/campaigns/${CAMPAIGN_ID}/sessions`,
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer token' }),
        })
      )
    })
    fireEvent.click(screen.getByRole('button', { name: 'Launch campaign' }))

    await screen.findByTestId('session-toolbar')

    // Ensure right rail is open (click toolbar button if present)
    const toolbar = screen.getByTestId('session-toolbar')
    const notesToolbarBtn = Array.from(toolbar.querySelectorAll('button')).find((btn) =>
      btn.getAttribute('aria-label')?.toLowerCase().includes('notes')
    )
    if (notesToolbarBtn) fireEvent.click(notesToolbarBtn)

    const journalTab = screen.getByRole('tab', { name: /Journal/i })
    fireEvent.click(journalTab)
    expect(await screen.findByTestId('journal-panel')).toBeTruthy()

    await waitFor(() => {
      expect(screen.getByText(/Tunnel map/i)).toBeTruthy()
      expect(screen.queryByText(/Archive route/i)).toBeNull()
    })

    // Tag filter may be 'Tag' or 'Tags' depending on UI
    const tagLabel = screen.getByLabelText(/Tag/i)
    fireEvent.change(tagLabel, { target: { value: 'all' } })
    expect(screen.getByText(/Archive route/i)).toBeTruthy()

    const notesTabForSwitch = screen.getByRole('tab', { name: /Notes/i })
    fireEvent.click(notesTabForSwitch)
    expect(await screen.findByTestId('notes-rail-panel')).toBeTruthy()

    fireEvent.click(journalTab)
    expect(await screen.findByTestId('journal-panel')).toBeTruthy()

    await waitFor(() => {
      expect(screen.getByText(/Tunnel map/i)).toBeTruthy()
      expect(screen.queryByText(/Archive route/i)).toBeNull()
    })

    const historyTab = screen.getByRole('tab', { name: /History/i })
    fireEvent.click(historyTab)
    expect(await screen.findByTestId('history-panel')).toBeTruthy()

    await waitFor(() => {
      expect(screen.getByText(/Session state changed from IDLE to ACTIVE/i)).toBeTruthy()
      expect(screen.queryByText(/Tara joined main room/i)).toBeNull()
    })

    // Actor filter may be 'Actor' or 'Actors' depending on UI
    const actorLabel = screen.getByLabelText(/Actor/i)
    fireEvent.change(actorLabel, { target: { value: 'all' } })
    expect(screen.getByText(/Tara joined main room/i)).toBeTruthy()

    const notesTab = screen.getByRole('tab', { name: /Notes/i })
    fireEvent.click(notesTab)
    expect(await screen.findByTestId('notes-rail-panel')).toBeTruthy()

    fireEvent.click(historyTab)
    expect(await screen.findByTestId('history-panel')).toBeTruthy()

    await waitFor(() => {
      expect(screen.getByText(/Session state changed from IDLE to ACTIVE/i)).toBeTruthy()
      expect(screen.queryByText(/Tara joined main room/i)).toBeNull()
    })
  })

  it('joins from a full invite link entered in the home join modal', async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.endsWith('/api/campaigns') && !init?.method) {
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
          json: async () => ({ sessions: [] }),
        }
      }

      if (url.endsWith(`/api/campaigns/${JOIN_TARGET_CAMPAIGN_ID}/sessions`)) {
        return {
          ok: true,
          json: async () => ({ sessions: [] }),
        }
      }

      if (url.endsWith('/api/campaigns/invite/ABCD12/validate')) {
        return {
          ok: true,
          json: async () => ({
            valid: true,
            campaign: {
              id: JOIN_TARGET_CAMPAIGN_ID,
            },
          }),
        }
      }

      if (
        url.endsWith(`/api/campaigns/${JOIN_TARGET_CAMPAIGN_ID}/join`) &&
        init?.method === 'POST'
      ) {
        return {
          ok: true,
          json: async () => ({ ok: true }),
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

    await screen.findByText('Campaigns')

    fireEvent.click(screen.getByRole('button', { name: 'Join campaign' }))

    fireEvent.change(screen.getByPlaceholderText('Invite code or /join link'), {
      target: { value: 'https://example.test/join/abcd12?source=mail' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Join Campaign' }))

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([calledUrl]) =>
            String(calledUrl) === 'http://localhost:3000/api/campaigns/invite/ABCD12/validate'
        )
      ).toBe(true)
    })

    await waitFor(() => {
      const joinCalls = fetchMock.mock.calls.filter(
        ([calledUrl]) =>
          String(calledUrl) ===
          `http://localhost:3000/api/campaigns/${JOIN_TARGET_CAMPAIGN_ID}/join`
      )

      expect(joinCalls).toEqual([
        [
          `http://localhost:3000/api/campaigns/${JOIN_TARGET_CAMPAIGN_ID}/join`,
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ inviteCode: 'ABCD12' }),
          }),
        ],
      ])
    })
  })

  it('uses SPECTATOR role from campaign membership at launch time', async () => {
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
                memberRole: 'SPECTATOR',
                displayState: 'ACTIVE',
                dmOnline: true,
                connectedPlayers: 2,
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
              },
            ],
          }),
        }
      }

      if (url.endsWith(`/api/chat/messages/${SESSION_ID}`)) {
        return { ok: true, json: async () => ({ messages: [] }) }
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

    await screen.findByText('Campaigns')
    fireEvent.click(screen.getByRole('button', { name: 'Watch campaign' }))

    await screen.findByTestId('session-toolbar')
    expect(screen.getByRole('tab', { name: 'Tool Information' })).toBeTruthy()
    expect(screen.queryByRole('tab', { name: 'Tool Groups' })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Tool Notes' })).toBeNull()
  })

  it('uses PLAYER role from campaign membership even when auth role is spectator', async () => {
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
                memberRole: 'PLAYER',
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
              },
            ],
          }),
        }
      }

      if (url.endsWith(`/api/chat/messages/${SESSION_ID}`)) {
        return { ok: true, json: async () => ({ messages: [] }) }
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
          role: Role.SPECTATOR,
        }}
      />
    )

    await screen.findByText('Campaigns')
    fireEvent.click(screen.getByRole('button', { name: 'Launch campaign' }))

    const toolbar = await screen.findByTestId('session-toolbar')
    expect(toolbar).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Tool Notes' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Tool Journal' })).toBeTruthy()
  })

  it('pauses an active session from the toolbar pause button', async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
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
                memberRole: 'DM',
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
              },
            ],
          }),
        }
      }

      if (url.endsWith(`/api/v1/session/${SESSION_ID}/state`) && init?.method === 'PUT') {
        return {
          ok: true,
          json: async () => ({
            id: SESSION_ID,
            name: 'Session Alpha',
            dmId: DM_ID,
            state: SessionState.PAUSED,
            createdAt: 1,
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
          id: DM_ID,
          username: 'Morgan',
          role: Role.DM,
        }}
      />
    )

    await screen.findByText('Campaigns')
    fireEvent.click(screen.getByRole('button', { name: 'Launch campaign' }))

    await screen.findByTestId('session-toolbar')
    fireEvent.click(screen.getByRole('button', { name: 'Pause for break' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `http://localhost:3000/api/v1/session/${SESSION_ID}/state`,
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ state: SessionState.PAUSED }),
        })
      )
    })
  })

  it('opens the end-session modal before ending the active session', async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
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
                memberRole: 'DM',
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
              },
            ],
          }),
        }
      }

      if (url.endsWith(`/api/v1/session/${SESSION_ID}/state`) && init?.method === 'PUT') {
        return {
          ok: true,
          json: async () => ({
            id: SESSION_ID,
            name: 'Session Alpha',
            dmId: DM_ID,
            state: SessionState.ENDED,
            createdAt: 1,
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
          id: DM_ID,
          username: 'Morgan',
          role: Role.DM,
        }}
      />
    )

    await screen.findByText('Campaigns')
    fireEvent.click(screen.getByRole('button', { name: 'Launch campaign' }))

    await screen.findByTestId('session-toolbar')
    fireEvent.click(screen.getByRole('button', { name: 'End session' }))

    expect(await screen.findByRole('dialog', { name: 'End session' })).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/session/${SESSION_ID}/state`,
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ state: SessionState.ENDED }),
      })
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog', { name: 'End session' })).toBeNull()
    expect(fetchMock).not.toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/session/${SESSION_ID}/state`,
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ state: SessionState.ENDED }),
      })
    )

    fireEvent.click(screen.getByRole('button', { name: 'End session' }))
    fireEvent.click(await screen.findByRole('button', { name: 'End Session' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `http://localhost:3000/api/v1/session/${SESSION_ID}/state`,
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ state: SessionState.ENDED }),
        })
      )
    })
  })

  it('starts a new session when the latest campaign session has already ended', async () => {
    const NEXT_SESSION_ID = asUuid('88888888-8888-4888-8888-888888888881')
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
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
                memberRole: 'DM',
                latestSessionState: 'ENDED',
              },
            ],
          }),
        }
      }

      if (url.endsWith(`/api/campaigns/${CAMPAIGN_ID}/sessions`) && !init?.method) {
        return {
          ok: true,
          json: async () => ({
            sessions: [
              {
                id: SESSION_ID,
                name: 'Session Alpha',
                dmId: DM_ID,
                state: SessionState.ENDED,
                createdAt: 1,
                endedAt: 2,
              },
            ],
          }),
        }
      }

      if (url.endsWith(`/api/campaigns/${CAMPAIGN_ID}/sessions/start`) && init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            session: {
              id: NEXT_SESSION_ID,
              name: 'Session 2 - 2026-05-04',
              dmId: DM_ID,
              state: SessionState.IDLE,
              createdAt: 3,
            },
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
          id: DM_ID,
          username: 'Morgan',
          role: Role.DM,
        }}
      />
    )

    await screen.findByText('Campaigns')
    fireEvent.click(screen.getByRole('button', { name: 'Launch campaign' }))

    await screen.findByRole('button', { name: 'Start' })
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `http://localhost:3000/api/campaigns/${CAMPAIGN_ID}/sessions/start`,
        expect.objectContaining({
          method: 'POST',
        })
      )
    })

    await screen.findByTestId('session-toolbar')
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy()
  })

  it('rehydrates rooms, presence, environment, and DM overrides on session enter', async () => {
    const OVERRIDE_USER_ID = PLAYER_ID
    const ENV_PRESET_ID = asUuid('cccccccc-cccc-4ccc-8ccc-cccccccccccc')

    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
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
                memberRole: 'DM',
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
              },
            ],
          }),
        }
      }

      if (url.endsWith(`/api/v1/session/${SESSION_ID}/members/join`)) {
        return { ok: true, json: async () => ({ ok: true }) }
      }

      if (url.endsWith(`/api/v1/rooms/session/${SESSION_ID}`)) {
        return {
          ok: true,
          json: async () => ({
            rooms: [
              {
                id: ROOM_ONE_ID,
                sessionId: SESSION_ID,
                name: 'Strategy Room',
                type: RoomType.MAIN,
                createdBy: DM_ID,
                createdAt: 1,
              },
              {
                id: ROOM_TWO_ID,
                sessionId: SESSION_ID,
                name: 'Scout Team',
                type: RoomType.GROUP,
                createdBy: DM_ID,
                createdAt: 2,
              },
            ],
          }),
        }
      }

      if (
        url.endsWith(`/api/v1/presence/${SESSION_ID}`) &&
        (!init || !init.method || init.method === 'GET')
      ) {
        return {
          ok: true,
          json: async () => ({
            presence: [
              {
                userId: DM_ID,
                username: 'Morgan',
                state: PresenceState.ONLINE,
                primaryRoomId: ROOM_ONE_ID,
                lastSeenAt: Date.now(),
              },
              {
                userId: PLAYER_ID,
                username: 'Tara',
                state: PresenceState.ONLINE,
                primaryRoomId: ROOM_ONE_ID,
                lastSeenAt: Date.now(),
              },
            ],
          }),
        }
      }

      if (url.endsWith(`/api/v1/presence/${SESSION_ID}/recover`)) {
        return {
          ok: true,
          json: async () => ({ recoveredFromSnapshots: false, snapshotCount: 2, presence: [] }),
        }
      }

      if (url.endsWith(`/api/v1/audio/sessions/${SESSION_ID}/state`)) {
        return {
          ok: true,
          json: async () => ({
            sessionId: SESSION_ID,
            environment: {
              id: ENV_PRESET_ID,
              name: 'Tavern',
              reverbSend: 0.4,
              lowpassFreq: 7000,
              roomGain: -2,
            },
            environments: [
              { roomId: ROOM_ONE_ID, environmentName: 'Tavern' },
              { roomId: ROOM_TWO_ID, environmentName: 'Cave' },
            ],
            dmOverrides: [
              {
                userId: OVERRIDE_USER_ID,
                overrideType: 'MUTE',
                appliedAt: Date.now(),
              },
            ],
            broadcast: { enabled: false },
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
          id: DM_ID,
          username: 'Morgan',
          role: Role.DM,
        }}
      />
    )

    await screen.findByText('Campaigns')
    fireEvent.click(screen.getByRole('button', { name: 'Launch campaign' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `http://localhost:3000/api/v1/rooms/session/${SESSION_ID}`,
        expect.anything()
      )
      expect(fetchMock).toHaveBeenCalledWith(
        `http://localhost:3000/api/v1/presence/${SESSION_ID}`,
        expect.anything()
      )
      expect(fetchMock).toHaveBeenCalledWith(
        `http://localhost:3000/api/v1/audio/sessions/${SESSION_ID}/state`,
        expect.anything()
      )
    })

    // Verify store was rehydrated with environment and DM overrides.
    await waitFor(() => {
      const storeState = useStore.getState()
      expect(storeState.currentEnvironment?.name).toBe('Tavern')
      expect(
        getUserDMOverride(storeState.dmOverrides, OVERRIDE_USER_ID, 'MUTE')?.overrideType
      ).toBe('MUTE')
    })

    fireEvent.click(screen.getByRole('button', { name: /Select group Scout Team/i }))

    await waitFor(() => {
      expect(useStore.getState().currentEnvironment?.name).toBe('Tavern')
    })

    // Verify presence recover was triggered (fire-and-forget).
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `http://localhost:3000/api/v1/presence/${SESSION_ID}/recover`,
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('rehydrates audio state and restores session markers across main + greenroom on reconnect', async () => {
    const ENV_PRESET_ID = asUuid('dddddddd-dddd-4ddd-8ddd-dddddddddddd')

    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.endsWith('/api/campaigns')) {
        return {
          ok: true,
          json: async () => ({
            campaigns: [
              {
                id: CAMPAIGN_ID,
                name: 'Vaultkeeper',
                currentDmId: DM_ID,
                memberRole: 'DM',
                inviteCode: 'VAULT-01',
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
                name: 'Session Beta',
                dmId: DM_ID,
                state: SessionState.ACTIVE,
                createdAt: 1,
              },
            ],
          }),
        }
      }

      if (url.endsWith(`/api/v1/session/${SESSION_ID}/members/join`)) {
        return { ok: true, json: async () => ({ ok: true }) }
      }

      if (url.endsWith(`/api/v1/rooms/session/${SESSION_ID}`)) {
        return {
          ok: true,
          json: async () => ({
            rooms: [
              {
                id: ROOM_ONE_ID,
                sessionId: SESSION_ID,
                name: 'Vault Room',
                type: RoomType.MAIN,
                createdBy: DM_ID,
                createdAt: 1,
              },
              {
                id: ROOM_TWO_ID,
                sessionId: SESSION_ID,
                name: 'Green Room',
                type: RoomType.GROUP,
                createdBy: DM_ID,
                createdAt: 2,
              },
            ],
          }),
        }
      }

      if (
        url.includes(`/api/chat/messages/${SESSION_ID}`) &&
        url.includes(`roomId=${ROOM_ONE_ID}`)
      ) {
        return {
          ok: true,
          json: async () => ({
            messages: [
              {
                id: asUuid('f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1'),
                roomId: ROOM_ONE_ID,
                authorId: asUuid('00000000-0000-4000-8000-000000000000'),
                authorUsername: 'SYSTEM',
                content: '[Session Started] Session Beta',
                type: MessageType.SYSTEM,
                isDmOnly: false,
                createdAt: 1_715_200_700_000,
              },
            ],
          }),
        }
      }

      if (
        url.includes(`/api/chat/messages/${SESSION_ID}`) &&
        url.includes(`roomId=${ROOM_TWO_ID}`)
      ) {
        return {
          ok: true,
          json: async () => ({
            messages: [
              {
                id: asUuid('f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2'),
                roomId: ROOM_TWO_ID,
                authorId: asUuid('00000000-0000-4000-8000-000000000000'),
                authorUsername: 'SYSTEM',
                content: '[Session Started] Session Beta',
                type: MessageType.SYSTEM,
                isDmOnly: false,
                createdAt: 1_715_200_700_001,
              },
            ],
          }),
        }
      }

      if (
        url.endsWith(`/api/v1/presence/${SESSION_ID}`) &&
        (!init || !init.method || init.method === 'GET')
      ) {
        return { ok: true, json: async () => ({ presence: [] }) }
      }

      if (url.endsWith(`/api/v1/presence/${SESSION_ID}/recover`)) {
        return { ok: true, json: async () => ({ recoveredFromSnapshots: false }) }
      }

      if (url.endsWith(`/api/v1/audio/sessions/${SESSION_ID}/state`)) {
        return {
          ok: true,
          json: async () => ({
            sessionId: SESSION_ID,
            environment: {
              id: ENV_PRESET_ID,
              name: 'Cave',
              reverbSend: 0.6,
              lowpassFreq: 5000,
              roomGain: -4,
            },
            dmOverrides: [],
            broadcast: { enabled: false },
          }),
        }
      }

      throw new Error(`Unexpected fetch call: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    const { rerender } = render(
      <SessionInit
        apiUrl="http://localhost:3000"
        wsUrl="ws://localhost:3000"
        token="token"
        user={{ id: DM_ID, username: 'Morgan', role: Role.DM }}
      />
    )

    await screen.findByText('Campaigns')
    fireEvent.click(screen.getByRole('button', { name: 'Launch campaign' }))

    // Initial session-enter hydration: no connected room is present,
    // so effective environment remains neutral even if a server environment exists.
    await waitFor(() => {
      expect(useStore.getState().currentEnvironment).toBeUndefined()
    })

    const callCountAfterFirstLoad = fetchMock.mock.calls.length

    // Simulate WebSocket reconnect by changing wsState
    wsConnectionState = 'reconnecting'
    rerender(
      <SessionInit
        apiUrl="http://localhost:3000"
        wsUrl="ws://localhost:3000"
        token="token"
        user={{ id: DM_ID, username: 'Morgan', role: Role.DM }}
      />
    )

    wsConnectionState = 'connected'
    rerender(
      <SessionInit
        apiUrl="http://localhost:3000"
        wsUrl="ws://localhost:3000"
        token="token"
        user={{ id: DM_ID, username: 'Morgan', role: Role.DM }}
      />
    )

    await waitFor(() => {
      // Recovery calls should have been re-issued after reconnect
      const audioStateCalls = fetchMock.mock.calls.filter(([url]) =>
        String(url).endsWith(`/api/v1/audio/sessions/${SESSION_ID}/state`)
      )
      expect(audioStateCalls.length).toBeGreaterThan(1)
      expect(fetchMock.mock.calls.length).toBeGreaterThan(callCountAfterFirstLoad)
    })

    await waitFor(() => {
      const historyCalls = fetchMock.mock.calls
        .map(([url]) => String(url))
        .filter((url) => url.includes(`/api/chat/messages/${SESSION_ID}`))

      expect(historyCalls.some((url) => url.includes(`roomId=${ROOM_ONE_ID}`))).toBe(true)
      expect(historyCalls.some((url) => url.includes(`roomId=${ROOM_TWO_ID}`))).toBe(true)
    })
  })

  it('projects takeover identity from backend on reconnect and clears stale local persona', async () => {
    let presenceReadCount = 0

    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
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
                memberRole: 'DM',
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
                name: 'Session Gamma',
                dmId: DM_ID,
                state: SessionState.ACTIVE,
                createdAt: 1,
              },
            ],
          }),
        }
      }

      if (url.endsWith(`/api/v1/session/${SESSION_ID}/members/join`)) {
        return { ok: true, json: async () => ({ ok: true }) }
      }

      if (url.endsWith(`/api/v1/rooms/session/${SESSION_ID}`)) {
        return {
          ok: true,
          json: async () => ({
            rooms: [
              {
                id: ROOM_ONE_ID,
                sessionId: SESSION_ID,
                name: 'Main Room',
                type: RoomType.MAIN,
                createdBy: DM_ID,
                createdAt: 1,
              },
            ],
          }),
        }
      }

      if (
        url.endsWith(`/api/v1/presence/${SESSION_ID}`) &&
        (!init || !init.method || init.method === 'GET')
      ) {
        presenceReadCount += 1
        return {
          ok: true,
          json: async () => ({
            presence: [
              {
                userId: DM_ID,
                username: 'Morgan',
                state: PresenceState.ONLINE,
                primaryRoomId: ROOM_ONE_ID,
                lastSeenAt: Date.now(),
              },
            ],
            identity:
              presenceReadCount === 1
                ? {
                    active: true,
                    actorUserId: DM_ID,
                    effectiveUserId: PLAYER_ID,
                    assumedUserId: PLAYER_ID,
                    assumedDisplayName: 'Tara',
                    startedAt: 1700000000000,
                    staleRecovered: false,
                  }
                : {
                    active: false,
                    actorUserId: DM_ID,
                    effectiveUserId: DM_ID,
                    assumedUserId: null,
                    assumedDisplayName: null,
                    startedAt: null,
                    staleRecovered: true,
                  },
          }),
        }
      }

      if (url.endsWith(`/api/v1/presence/${SESSION_ID}/recover`)) {
        return { ok: true, json: async () => ({ recoveredFromSnapshots: false }) }
      }

      if (url.endsWith(`/api/v1/audio/sessions/${SESSION_ID}/state`)) {
        return {
          ok: true,
          json: async () => ({
            sessionId: SESSION_ID,
            dmOverrides: [],
            broadcast: { enabled: false },
          }),
        }
      }

      if (url.includes(`/api/chat/messages/${SESSION_ID}`)) {
        return { ok: true, json: async () => ({ messages: [] }) }
      }

      throw new Error(`Unexpected fetch call: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    const { rerender } = render(
      <SessionInit
        apiUrl="http://localhost:3000"
        wsUrl="ws://localhost:3000"
        token="token"
        user={{ id: DM_ID, username: 'Morgan', role: Role.DM }}
      />
    )

    await screen.findByText('Campaigns')
    fireEvent.click(screen.getByRole('button', { name: 'Launch campaign' }))

    await waitFor(() => {
      expect(useStore.getState().mockTakeoverUserIdBySession[SESSION_ID]).toBe(PLAYER_ID)
    })

    wsConnectionState = 'reconnecting'
    rerender(
      <SessionInit
        apiUrl="http://localhost:3000"
        wsUrl="ws://localhost:3000"
        token="token"
        user={{ id: DM_ID, username: 'Morgan', role: Role.DM }}
      />
    )

    wsConnectionState = 'connected'
    rerender(
      <SessionInit
        apiUrl="http://localhost:3000"
        wsUrl="ws://localhost:3000"
        token="token"
        user={{ id: DM_ID, username: 'Morgan', role: Role.DM }}
      />
    )

    await waitFor(() => {
      expect(useStore.getState().mockTakeoverUserIdBySession[SESSION_ID]).toBeNull()
    })
  })
})
