import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RoomType, SessionState, type UUID } from '@shared'
import { useWhisperFlow } from '@/hooks/session/useWhisperFlow'

const SESSION_ID = '11111111-1111-4111-8111-111111111111' as UUID
const WHISPER_ROOM_ID = '22222222-2222-4222-8222-222222222222' as UUID
const DM_ID = '33333333-3333-4333-8333-333333333333' as UUID
const PLAYER_ID = '44444444-4444-4444-8444-444444444444' as UUID

describe('useWhisperFlow', () => {
  it('does not auto-end whisper after the session enters cooldown', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const baseOptions = {
      apiUrl: 'https://api.test',
      token: 'token',
      sessionId: SESSION_ID,
      dmUserId: DM_ID,
      displayedParticipantsByRoom: {
        [WHISPER_ROOM_ID]: [{ userId: PLAYER_ID, username: 'alice', roomId: WHISPER_ROOM_ID }],
      },
      pendingRoomMoves: {},
      selectedRoomId: WHISPER_ROOM_ID,
      broadcastModeEnabled: false,
      canManageRooms: true,
      onToggleBroadcastMode: vi.fn(async () => undefined),
      onSelectRoom: vi.fn(),
      setMoveError: vi.fn(),
      syncSessionTopologyFromServer: vi.fn(async () => undefined),
      getRoomMemberIdsFromServer: vi.fn(async () => []),
    }

    const { rerender } = renderHook(
      (props: {
        sessionState: SessionState
        allRooms: Array<{
          id: UUID
          name: string
          type: RoomType
          memberCount: number
          participants: Array<{ userId: UUID; username: string }>
        }>
        displayedParticipantsByRoom: Record<
          string,
          Array<{ userId: UUID; username: string; roomId: UUID }>
        >
      }) =>
        useWhisperFlow({
          ...baseOptions,
          sessionState: props.sessionState,
          allRooms: props.allRooms,
          displayedParticipantsByRoom: props.displayedParticipantsByRoom,
        }),
      {
        initialProps: {
          sessionState: SessionState.ACTIVE,
          allRooms: [
            {
              id: WHISPER_ROOM_ID,
              name: 'Whisper',
              type: RoomType.PRIVATE,
              memberCount: 2,
              participants: [
                { userId: DM_ID, username: 'dm' },
                { userId: PLAYER_ID, username: 'alice' },
              ],
            },
          ],
          displayedParticipantsByRoom: {
            [WHISPER_ROOM_ID]: [{ userId: PLAYER_ID, username: 'alice', roomId: WHISPER_ROOM_ID }],
          },
        },
      }
    )

    rerender({
      sessionState: SessionState.COOLDOWN,
      allRooms: [
        {
          id: WHISPER_ROOM_ID,
          name: 'Whisper',
          type: RoomType.PRIVATE,
          memberCount: 0,
          participants: [],
        },
      ],
      displayedParticipantsByRoom: {
        [WHISPER_ROOM_ID]: [],
      },
    })

    await waitFor(() => {
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  it('does not auto-end whisper when session pause empties the whisper room', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const baseOptions = {
      apiUrl: 'https://api.test',
      token: 'token',
      sessionId: SESSION_ID,
      dmUserId: DM_ID,
      displayedParticipantsByRoom: {
        [WHISPER_ROOM_ID]: [{ userId: PLAYER_ID, username: 'alice', roomId: WHISPER_ROOM_ID }],
      },
      pendingRoomMoves: {},
      selectedRoomId: WHISPER_ROOM_ID,
      broadcastModeEnabled: false,
      canManageRooms: true,
      onToggleBroadcastMode: vi.fn(async () => undefined),
      onSelectRoom: vi.fn(),
      setMoveError: vi.fn(),
      syncSessionTopologyFromServer: vi.fn(async () => undefined),
      getRoomMemberIdsFromServer: vi.fn(async () => []),
    }

    const { rerender } = renderHook(
      (props: {
        sessionState: SessionState
        allRooms: Array<{
          id: UUID
          name: string
          type: RoomType
          memberCount: number
          participants: Array<{ userId: UUID; username: string }>
        }>
        displayedParticipantsByRoom: Record<
          string,
          Array<{ userId: UUID; username: string; roomId: UUID }>
        >
      }) =>
        useWhisperFlow({
          ...baseOptions,
          sessionState: props.sessionState,
          allRooms: props.allRooms,
          displayedParticipantsByRoom: props.displayedParticipantsByRoom,
        }),
      {
        initialProps: {
          sessionState: SessionState.ACTIVE,
          allRooms: [
            {
              id: WHISPER_ROOM_ID,
              name: 'Whisper',
              type: RoomType.PRIVATE,
              memberCount: 2,
              participants: [
                { userId: DM_ID, username: 'dm' },
                { userId: PLAYER_ID, username: 'alice' },
              ],
            },
          ],
          displayedParticipantsByRoom: {
            [WHISPER_ROOM_ID]: [{ userId: PLAYER_ID, username: 'alice', roomId: WHISPER_ROOM_ID }],
          },
        },
      }
    )

    // Simulate PAUSE transition: whisper room empties as session moves to PAUSED
    rerender({
      sessionState: SessionState.PAUSED,
      allRooms: [
        {
          id: WHISPER_ROOM_ID,
          name: 'Whisper',
          type: RoomType.PRIVATE,
          memberCount: 0,
          participants: [],
        },
      ],
      displayedParticipantsByRoom: {
        [WHISPER_ROOM_ID]: [],
      },
    })

    await waitFor(() => {
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })
})
