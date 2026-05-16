import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageType, Role, RoomType } from '@shared'
import type { UUID } from '@shared'
import { ChatWindow } from '../../src/components/chat/ChatWindow'
import { MessageList } from '../../src/components/chat/MessageList'
import { useStore } from '../../src/state/store'

const SESSION_ID = '11111111-1111-4111-8111-111111111111' as UUID
const USER_ID = '22222222-2222-4222-8222-222222222222' as UUID
const MAIN_ROOM_ID = '33333333-3333-4333-8333-333333333333' as UUID
const GREEN_ROOM_ID = '44444444-4444-4444-8444-444444444444' as UUID

describe('ChatWindow timeline behavior', () => {
  beforeEach(() => {
    const store = useStore.getState()
    store.clearMessages()
    store.clearRooms()
    store.reset()
    store.replaceSessionTopology(
      SESSION_ID,
      [
        {
          id: MAIN_ROOM_ID,
          sessionId: SESSION_ID,
          name: 'Main Room',
          type: RoomType.MAIN,
          createdAt: 1,
          createdBy: USER_ID,
        },
        {
          id: GREEN_ROOM_ID,
          sessionId: SESSION_ID,
          name: 'Green Room',
          type: RoomType.GROUP,
          createdAt: 2,
          createdBy: USER_ID,
        },
      ],
      [
        {
          userId: USER_ID,
          username: 'Morgan',
          state: 'ONLINE' as any,
          primaryRoomId: GREEN_ROOM_ID,
          lastSeenAt: Date.now(),
        },
      ]
    )
  })

  it('shows only greenroom messages while in greenroom mode', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        messages: [
          {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            roomId: MAIN_ROOM_ID,
            authorId: USER_ID,
            authorUsername: 'SYSTEM',
            content: '[Session Started] Session Alpha',
            type: MessageType.SYSTEM,
            isDmOnly: false,
            createdAt: 100,
          },
          {
            id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            roomId: MAIN_ROOM_ID,
            authorId: USER_ID,
            authorUsername: 'SYSTEM',
            content: '[Session Paused] Session Alpha',
            type: MessageType.SYSTEM,
            isDmOnly: false,
            createdAt: 200,
          },
          {
            id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            roomId: MAIN_ROOM_ID,
            authorId: USER_ID,
            authorUsername: 'SYSTEM',
            content: '[Session Resumed] Session Alpha',
            type: MessageType.SYSTEM,
            isDmOnly: false,
            createdAt: 300,
          },
          {
            id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            roomId: GREEN_ROOM_ID,
            authorId: USER_ID,
            authorUsername: 'Morgan',
            content: 'Greenroom table talk',
            type: MessageType.OOC,
            isDmOnly: false,
            createdAt: 400,
          },
        ],
      }),
    }))

    vi.stubGlobal('fetch', fetchMock)

    render(
      <ChatWindow
        apiUrl="http://localhost:3000"
        token="token"
        sessionId={SESSION_ID}
        roomId={GREEN_ROOM_ID}
        roomName="Green Room"
        user={{ id: USER_ID, username: 'Morgan', role: Role.DM }}
        forceMessageType={MessageType.OOC}
      />
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/chat/messages/11111111-1111-4111-8111-111111111111?limit=20&roomId=44444444-4444-4444-8444-444444444444&includeCampaignGreenroom=1',
        expect.anything()
      )
    })

    expect(screen.getByText('Greenroom table talk')).toBeTruthy()
    expect(screen.queryByText('[Session Started] Session Alpha')).toBeNull()
    expect(screen.queryByText('[Session Paused] Session Alpha')).toBeNull()
    expect(screen.queryByText('[Session Resumed] Session Alpha')).toBeNull()
  })

  it('hides session-start marker and greenroom messages in active main-room mode', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        messages: [
          {
            id: '10101010-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            roomId: MAIN_ROOM_ID,
            authorId: USER_ID,
            authorUsername: 'SYSTEM',
            content: '[Session Started] Session Alpha',
            type: MessageType.SYSTEM,
            isDmOnly: false,
            createdAt: 100,
          },
          {
            id: '20202020-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            roomId: GREEN_ROOM_ID,
            authorId: USER_ID,
            authorUsername: 'Morgan',
            content: 'Greenroom aside',
            type: MessageType.OOC,
            isDmOnly: false,
            createdAt: 200,
          },
          {
            id: '30303030-cccc-4ccc-8ccc-cccccccccccc',
            roomId: MAIN_ROOM_ID,
            authorId: USER_ID,
            authorUsername: 'Morgan',
            content: 'Main room action',
            type: MessageType.IC,
            isDmOnly: false,
            createdAt: 300,
          },
        ],
      }),
    }))

    vi.stubGlobal('fetch', fetchMock)

    render(
      <ChatWindow
        apiUrl="http://localhost:3000"
        token="token"
        sessionId={SESSION_ID}
        roomId={MAIN_ROOM_ID}
        roomName="Main Room"
        user={{ id: USER_ID, username: 'Morgan', role: Role.DM }}
      />
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/chat/messages/11111111-1111-4111-8111-111111111111?limit=20',
        expect.anything()
      )
    })

    expect(screen.getByText('Main room action')).toBeTruthy()
    expect(screen.queryByText('[Session Started] Session Alpha')).toBeNull()
    expect(screen.queryByText('Greenroom aside')).toBeNull()
  })

  it('renders day separators for editorial timeline grouping', () => {
    const yesterday = Date.now() - 24 * 60 * 60 * 1000

    render(
      <MessageList
        currentUserId={String(USER_ID)}
        activeRoomId={MAIN_ROOM_ID}
        messages={
          [
            {
              id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' as UUID,
              roomId: MAIN_ROOM_ID,
              authorId: USER_ID,
              authorUsername: 'Morgan',
              content: 'Yesterday recap',
              type: MessageType.OOC,
              isDmOnly: false,
              createdAt: yesterday,
            },
            {
              id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' as UUID,
              roomId: MAIN_ROOM_ID,
              authorId: USER_ID,
              authorUsername: 'Morgan',
              content: 'Today action',
              type: MessageType.OOC,
              isDmOnly: false,
              createdAt: Date.now(),
            },
          ] as any
        }
      />
    )

    const separators = document.querySelectorAll('.chat-day-separator')
    expect(separators.length).toBe(2)
    expect(screen.getByText('Today action')).toBeTruthy()
  })
})
