import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PresenceState, Role, RoomType } from '@shared'
import type { UUID } from '@shared'
import { DMAudioControls } from '../../src/components/workspaces/session/DMAudioControls'
import { useStore } from '../../src/state/store'
import { getUserDMOverride } from '@/utils/audioOverrides'

const SESSION_ID = '11111111-1111-4111-8111-111111111111' as UUID
const DM_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as UUID
const PLAYER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as UUID
const ROOM_A = '22222222-2222-4222-8222-222222222222' as UUID
const ROOM_B = '33333333-3333-4333-8333-333333333333' as UUID

describe('DMAudioControls', () => {
  beforeEach(() => {
    useStore.getState().reset()
    vi.restoreAllMocks()
  })

  it('shows DM-only message for non-DM roles', () => {
    render(
      <DMAudioControls
        apiUrl="http://localhost:3000"
        token="token"
        role={Role.PLAYER}
        sessionId={SESSION_ID}
        dmUserId={DM_ID}
        rooms={[]}
        participants={[]}
      />
    )

    expect(screen.getByText('Audio controls are DM-only.')).toBeTruthy()
  })

  it('loads presets and applies environment for DMs', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          presets: [
            { id: 'env-tavern', name: 'Tavern', category: 'ENVIRONMENT' },
            { id: 'voice-narrator', name: 'Narrator', category: 'VOICE' },
            { id: 'distance-near', name: 'Near', category: 'DISTANCE' },
            { id: 'condition-silenced', name: 'Silenced', category: 'CONDITION' },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <DMAudioControls
        apiUrl="http://localhost:3000"
        token="token"
        role={Role.DM}
        sessionId={SESSION_ID}
        dmUserId={DM_ID}
        rooms={[
          {
            id: ROOM_A,
            name: 'Tavern',
            type: RoomType.MAIN,
          },
        ]}
        participants={[]}
      />
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/api/audio/catalog/presets', {
        headers: { Authorization: 'Bearer token' },
      })
    })

    fireEvent.click(screen.getByRole('button', { name: 'Apply Environment' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/api/audio/environments/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token',
        },
        body: JSON.stringify({
          sessionId: SESSION_ID,
          roomId: ROOM_A,
          environmentName: 'Tavern',
        }),
      })
    })
  })

  it('applies DM mute override to selected player', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          presets: [
            { id: 'env-cave', name: 'Cave', category: 'ENVIRONMENT' },
            { id: 'distance-far', name: 'Far', category: 'DISTANCE' },
            { id: 'condition-silenced', name: 'Silenced', category: 'CONDITION' },
            { id: 'voice-whisper', name: 'Whisper', category: 'VOICE' },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <DMAudioControls
        apiUrl="http://localhost:3000"
        token="token"
        role={Role.DM}
        sessionId={SESSION_ID}
        dmUserId={DM_ID}
        rooms={[{ id: ROOM_A, name: 'Room A', type: RoomType.MAIN }]}
        participants={[
          {
            userId: DM_ID,
            username: 'GM',
            state: PresenceState.ONLINE,
          },
          {
            userId: PLAYER_ID,
            username: 'Player One',
            state: PresenceState.ONLINE,
            primaryRoomId: ROOM_A,
          },
        ]}
      />
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Mute' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/api/audio/overrides/dm/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token',
        },
        body: JSON.stringify({
          sessionId: SESSION_ID,
          targetUserId: PLAYER_ID,
          overrideType: 'MUTE',
          parameters: undefined,
        }),
      })
    })

    expect(
      getUserDMOverride(useStore.getState().dmOverrides, PLAYER_ID, 'MUTE')?.overrideType
    ).toBe('MUTE')
    expect(screen.getByText('Pending sync: waiting for websocket reconciliation.')).toBeTruthy()

    act(() => {
      useStore.getState().handleDMOverrideApplied({
        id: 'evt-confirm-1' as UUID,
        type: 'AUDIO:DM_OVERRIDE_APPLIED',
        version: 1,
        userId: DM_ID,
        userRole: Role.DM,
        sessionId: SESSION_ID,
        roomId: null,
        timestamp: Date.now(),
        payload: {
          targetUserId: PLAYER_ID,
          dmId: DM_ID,
          overrideType: 'MUTE',
          appliedAt: Date.now() + 1,
        },
      })
    })

    await waitFor(() => {
      expect(screen.queryByText('Pending sync: waiting for websocket reconciliation.')).toBeNull()
    })
  })

  it('applies advanced distance, condition, filter and DM voice presets', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          presets: [
            { id: 'env-cave', name: 'Cave', category: 'ENVIRONMENT' },
            { id: 'distance-far', name: 'Far', category: 'DISTANCE' },
            { id: 'condition-silenced', name: 'Silenced', category: 'CONDITION' },
            { id: 'voice-whisper', name: 'Whisper', category: 'VOICE' },
          ],
        }),
      })
      .mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <DMAudioControls
        apiUrl="http://localhost:3000"
        token="token"
        role={Role.DM}
        sessionId={SESSION_ID}
        dmUserId={DM_ID}
        rooms={[{ id: ROOM_A, name: 'Room A', type: RoomType.MAIN }]}
        participants={[
          { userId: DM_ID, username: 'GM', state: PresenceState.ONLINE },
          {
            userId: PLAYER_ID,
            username: 'Player One',
            state: PresenceState.ONLINE,
            primaryRoomId: ROOM_A,
          },
        ]}
      />
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Apply Distance' }))
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Apply Condition' }))
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Apply Filter' }))
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(4)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Apply DM Voice' }))
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(5)
    })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/audio/overrides/dm/apply',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer token',
          },
        })
      )
    })

    const calls = fetchMock.mock.calls
      .filter((entry) => entry[0] === 'http://localhost:3000/api/audio/overrides/dm/apply')
      .map((entry) => JSON.parse(entry[1].body as string))

    expect(calls.some((body) => body.parameters?.presetCategory === 'DISTANCE')).toBe(true)
    expect(calls.some((body) => body.parameters?.presetCategory === 'CONDITION')).toBe(true)
    expect(calls.some((body) => body.parameters?.presetCategory === 'FILTER')).toBe(true)
    expect(calls.some((body) => body.parameters?.presetCategory === 'VOICE')).toBe(true)
    expect(
      calls.some(
        (body) => body.targetUserId === DM_ID && body.parameters?.presetCategory === 'VOICE'
      )
    ).toBe(true)
  })

  it('shows drag/drop movement controls for DM and sends move request on drop', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          presets: [{ id: 'env-cave', name: 'Cave', category: 'ENVIRONMENT' }],
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <DMAudioControls
        apiUrl="http://localhost:3000"
        token="token"
        role={Role.DM}
        sessionId={SESSION_ID}
        dmUserId={DM_ID}
        rooms={[
          { id: ROOM_A, name: 'Room A', type: RoomType.MAIN },
          { id: ROOM_B, name: 'Room B', type: RoomType.GROUP },
        ]}
        participants={[
          { userId: DM_ID, username: 'GM', state: PresenceState.ONLINE },
          {
            userId: PLAYER_ID,
            username: 'Player One',
            state: PresenceState.ONLINE,
            primaryRoomId: ROOM_A,
          },
        ]}
      />
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    const draggable = screen.getByRole('button', { name: 'Drag Player One' })
    const dropTarget = screen.getByLabelText('Drop Room Room B')

    const dataTransfer = {
      data: '',
      setData: vi.fn((_: string, value: string) => {
        dataTransfer.data = value
      }),
      getData: vi.fn(() => dataTransfer.data),
    }

    fireEvent.dragStart(draggable, { dataTransfer })
    fireEvent.drop(dropTarget, { dataTransfer })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `http://localhost:3000/api/rooms/${ROOM_B}/members/move`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer token',
          },
          body: JSON.stringify({
            sessionId: SESSION_ID,
            targetUserId: PLAYER_ID,
          }),
        }
      )
    })
  })

  it('reconciles pending room move when participant room updates from websocket state', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          presets: [{ id: 'env-cave', name: 'Cave', category: 'ENVIRONMENT' }],
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
    vi.stubGlobal('fetch', fetchMock)

    const { rerender } = render(
      <DMAudioControls
        apiUrl="http://localhost:3000"
        token="token"
        role={Role.DM}
        sessionId={SESSION_ID}
        dmUserId={DM_ID}
        rooms={[
          { id: ROOM_A, name: 'Room A', type: RoomType.MAIN },
          { id: ROOM_B, name: 'Room B', type: RoomType.GROUP },
        ]}
        participants={[
          { userId: DM_ID, username: 'GM', state: PresenceState.ONLINE },
          {
            userId: PLAYER_ID,
            username: 'Player One',
            state: PresenceState.ONLINE,
            primaryRoomId: ROOM_A,
          },
        ]}
      />
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    const draggable = screen.getByRole('button', { name: 'Drag Player One' })
    const dropTarget = screen.getByLabelText('Drop Room Room B')
    const dataTransfer = {
      data: '',
      setData: vi.fn((_: string, value: string) => {
        dataTransfer.data = value
      }),
      getData: vi.fn(() => dataTransfer.data),
    }

    fireEvent.dragStart(draggable, { dataTransfer })
    fireEvent.drop(dropTarget, { dataTransfer })

    rerender(
      <DMAudioControls
        apiUrl="http://localhost:3000"
        token="token"
        role={Role.DM}
        sessionId={SESSION_ID}
        dmUserId={DM_ID}
        rooms={[
          { id: ROOM_A, name: 'Room A', type: RoomType.MAIN },
          { id: ROOM_B, name: 'Room B', type: RoomType.GROUP },
        ]}
        participants={[
          { userId: DM_ID, username: 'GM', state: PresenceState.ONLINE },
          {
            userId: PLAYER_ID,
            username: 'Player One',
            state: PresenceState.ONLINE,
            primaryRoomId: ROOM_B,
          },
        ]}
      />
    )

    await waitFor(() => {
      expect(
        screen.getByText('Player One moved to room and reconciled from websocket state.')
      ).toBeTruthy()
    })
  })

  it('completes DM drag/drop flow with live websocket room and presence updates', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          presets: [{ id: 'env-cave', name: 'Cave', category: 'ENVIRONMENT' }],
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
    vi.stubGlobal('fetch', fetchMock)

    act(() => {
      useStore.getState().replaceSessionTopology(
        SESSION_ID,
        [
          {
            id: ROOM_A,
            sessionId: SESSION_ID,
            name: 'Room A',
            type: RoomType.MAIN,
            createdAt: Date.now(),
            createdBy: DM_ID,
          },
          {
            id: ROOM_B,
            sessionId: SESSION_ID,
            name: 'Room B',
            type: RoomType.GROUP,
            createdAt: Date.now(),
            createdBy: DM_ID,
          },
        ],
        [
          {
            userId: DM_ID,
            username: 'GM',
            state: PresenceState.ONLINE,
            primaryRoomId: ROOM_A,
            lastSeenAt: Date.now(),
          },
          {
            userId: PLAYER_ID,
            username: 'Player One',
            state: PresenceState.ONLINE,
            primaryRoomId: ROOM_A,
            lastSeenAt: Date.now(),
          },
        ]
      )
    })

    const StoreDrivenDMAudioControls = () => {
      const roomsBySession = useStore((state) => state.rooms[SESSION_ID] || {})
      const presenceBySession = useStore((state) => state.sessionPresence[SESSION_ID] || {})

      const rooms = Object.values(roomsBySession).map((room) => ({
        id: room.id,
        name: room.name,
        type: room.type,
      }))

      const participants = Object.values(presenceBySession).map((presence) => ({
        userId: presence.userId,
        username: presence.username,
        state: presence.state,
        primaryRoomId: presence.primaryRoomId,
      }))

      return (
        <DMAudioControls
          apiUrl="http://localhost:3000"
          token="token"
          role={Role.DM}
          sessionId={SESSION_ID}
          dmUserId={DM_ID}
          rooms={rooms}
          participants={participants}
        />
      )
    }

    render(<StoreDrivenDMAudioControls />)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    const draggable = screen.getByRole('button', { name: 'Drag Player One' })
    const dropTarget = screen.getByLabelText('Drop Room Room B')
    const dataTransfer = {
      data: '',
      setData: vi.fn((_: string, value: string) => {
        dataTransfer.data = value
      }),
      getData: vi.fn(() => dataTransfer.data),
    }

    fireEvent.dragStart(draggable, { dataTransfer })
    fireEvent.drop(dropTarget, { dataTransfer })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `http://localhost:3000/api/rooms/${ROOM_B}/members/move`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer token',
          },
          body: JSON.stringify({
            sessionId: SESSION_ID,
            targetUserId: PLAYER_ID,
          }),
        }
      )
    })

    act(() => {
      useStore.getState().handleUserLeft({
        id: 'evt-left' as UUID,
        type: 'ROOM:USER_LEFT',
        version: 1,
        userId: DM_ID,
        userRole: Role.DM,
        sessionId: SESSION_ID,
        roomId: ROOM_A,
        timestamp: Date.now(),
        payload: {
          roomId: ROOM_A,
          userId: PLAYER_ID,
          leftAt: Date.now(),
        },
      })

      useStore.getState().handleUserJoined({
        id: 'evt-joined' as UUID,
        type: 'ROOM:USER_JOINED',
        version: 1,
        userId: DM_ID,
        userRole: Role.DM,
        sessionId: SESSION_ID,
        roomId: ROOM_B,
        timestamp: Date.now(),
        payload: {
          roomId: ROOM_B,
          userId: PLAYER_ID,
          username: 'Player One',
          joinedAt: Date.now(),
        },
      })
    })

    await waitFor(() => {
      expect(
        screen.getByText('Player One moved to room and reconciled from websocket state.')
      ).toBeTruthy()
    })
  })
})
