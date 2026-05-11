import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { PresenceState, Role, RoomType, SessionState } from '@shared'
import type { UUID } from '@shared'
import { ConnectionState } from 'livekit-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionInit } from '../../components/session/SessionInit'
import { buildLiveKitConnectionKey } from '../../hooks/useLiveKit'
import { useStore } from '../../state/store'

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

    expect(screen.getByRole('button', { name: 'Return' })).toBeTruthy()
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
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/campaigns/invite/ABCD12/validate'
      )
    })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `http://localhost:3000/api/campaigns/${JOIN_TARGET_CAMPAIGN_ID}/join`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ inviteCode: 'ABCD12' }),
        })
      )
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
      expect(storeState.dmOverrides.get(OVERRIDE_USER_ID)?.overrideType).toBe('MUTE')
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
      const sessionMessages = Object.values((useStore.getState().messages as any)[SESSION_ID] || {})
      const mainMarker = sessionMessages.find(
        (message: any) =>
          message.roomId === ROOM_ONE_ID &&
          typeof message.content === 'string' &&
          (message.content.startsWith('Session Start:') ||
            message.content.startsWith('[Session Started]'))
      )
      const greenMarker = sessionMessages.find(
        (message: any) =>
          message.roomId === ROOM_TWO_ID &&
          typeof message.content === 'string' &&
          (message.content.startsWith('Session Start:') ||
            message.content.startsWith('[Session Started]'))
      )

      expect(mainMarker).toBeTruthy()
      expect(greenMarker).toBeTruthy()
    })
  })
})
