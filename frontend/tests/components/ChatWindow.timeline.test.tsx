import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageType, Role, RoomType } from '@shared'
import type { UUID } from '@shared'
import { TooltipProvider } from '../../src/components/ui'
import { ChatWindow } from '../../src/components/workspaces/session/chat/ChatWindow'
import { MessageInput } from '../../src/components/workspaces/session/chat/MessageInput'
import { MessageList } from '../../src/components/workspaces/session/chat/MessageList'
import { useStore } from '../../src/state/store'

const SESSION_ID = '11111111-1111-4111-8111-111111111111' as UUID
const USER_ID = '22222222-2222-4222-8222-222222222222' as UUID
const MAIN_ROOM_ID = '33333333-3333-4333-8333-333333333333' as UUID
const GREEN_ROOM_ID = '44444444-4444-4444-8444-444444444444' as UUID

function getStartOfTodayTimestamp(): number {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
}

function renderWithTooltip(ui: React.ReactNode) {
  return render(<TooltipProvider delayDuration={140}>{ui}</TooltipProvider>)
}

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
    const now = Date.now()
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
            createdAt: now - 400,
          },
          {
            id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            roomId: MAIN_ROOM_ID,
            authorId: USER_ID,
            authorUsername: 'SYSTEM',
            content: '[Session Paused] Session Alpha',
            type: MessageType.SYSTEM,
            isDmOnly: false,
            createdAt: now - 300,
          },
          {
            id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            roomId: MAIN_ROOM_ID,
            authorId: USER_ID,
            authorUsername: 'SYSTEM',
            content: '[Session Resumed] Session Alpha',
            type: MessageType.SYSTEM,
            isDmOnly: false,
            createdAt: now - 200,
          },
          {
            id: 'edededed-eeee-4eee-8eee-eeeeeeeeeeee',
            roomId: GREEN_ROOM_ID,
            authorId: USER_ID,
            authorUsername: 'SYSTEM',
            content: '[Session Cooldown] Session Alpha',
            type: MessageType.SYSTEM,
            isDmOnly: false,
            createdAt: now - 100,
          },
          {
            id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            roomId: GREEN_ROOM_ID,
            authorId: USER_ID,
            authorUsername: 'Morgan',
            content: 'Greenroom table talk',
            type: MessageType.OOC,
            isDmOnly: false,
            createdAt: now,
          },
        ],
      }),
    }))

    vi.stubGlobal('fetch', fetchMock)

    renderWithTooltip(
      <ChatWindow
        apiUrl="http://localhost:3000"
        token="token"
        sessionId={SESSION_ID}
        roomId={GREEN_ROOM_ID}
        roomName="Green Room"
        campaignId={'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as UUID}
        user={{ id: USER_ID, username: 'Morgan', role: Role.DM }}
        forceMessageType={MessageType.OOC}
      />
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/chat/campaign/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/chat/page?limit=20&todayOnly=1',
        expect.anything()
      )
    })

    expect(screen.getByText('Greenroom table talk')).toBeTruthy()
    expect(screen.getByText('CLOSED')).toBeTruthy()
    expect(screen.queryByText('[Session Started] Session Alpha')).toBeNull()
    expect(screen.queryByText('[Session Paused] Session Alpha')).toBeNull()
    expect(screen.queryByText('[Session Resumed] Session Alpha')).toBeNull()
  })

  it('keeps older greenroom backlog hidden until the user scrolls upward', async () => {
    const todayStart = getStartOfTodayTimestamp()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messages: [],
          hasMore: false,
          hasEarlier: true,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messages: [
            {
              id: 'eeeeeeee-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              roomId: GREEN_ROOM_ID,
              authorId: USER_ID,
              authorUsername: 'Morgan',
              content: 'Earlier greenroom planning',
              type: MessageType.OOC,
              isDmOnly: false,
              createdAt: todayStart - 60_000,
            },
          ],
          hasMore: false,
        }),
      })

    vi.stubGlobal('fetch', fetchMock)

    const { container } = renderWithTooltip(
      <ChatWindow
        apiUrl="http://localhost:3000"
        token="token"
        sessionId={SESSION_ID}
        roomId={GREEN_ROOM_ID}
        roomName="Green Room"
        campaignId={'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as UUID}
        user={{ id: USER_ID, username: 'Morgan', role: Role.DM }}
        forceMessageType={MessageType.OOC}
      />
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/chat/campaign/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/chat/page?limit=20&todayOnly=1',
        expect.anything()
      )
    })

    expect(screen.getByLabelText('Messages from Today')).toBeTruthy()
    expect(screen.queryByText('Earlier greenroom planning')).toBeNull()

    const list = container.querySelector('.session-message-list') as HTMLDivElement | null
    expect(list).toBeTruthy()

    fireEvent.wheel(list as HTMLDivElement, { deltaY: -120 })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `http://localhost:3000/api/chat/campaign/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/chat/page?limit=20&before=${todayStart}`,
        expect.anything()
      )
    })

    expect(screen.getByText('Earlier greenroom planning')).toBeTruthy()
  })

  it('shows session-start marker but hides ended/intermission markers and greenroom messages in active main-room mode', async () => {
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
            id: '23232323-ffff-4fff-8fff-ffffffffffff',
            roomId: MAIN_ROOM_ID,
            authorId: USER_ID,
            authorUsername: 'SYSTEM',
            content: '[Session Paused] Session Alpha',
            type: MessageType.SYSTEM,
            isDmOnly: false,
            createdAt: 230,
          },
          {
            id: '24242424-eeee-4eee-8eee-eeeeeeeeeeee',
            roomId: MAIN_ROOM_ID,
            authorId: USER_ID,
            authorUsername: 'SYSTEM',
            content: '[Session Resumed] Session Alpha',
            type: MessageType.SYSTEM,
            isDmOnly: false,
            createdAt: 240,
          },
          {
            id: '25252525-dddd-4ddd-8ddd-dddddddddddd',
            roomId: MAIN_ROOM_ID,
            authorId: USER_ID,
            authorUsername: 'SYSTEM',
            content: '[Session Ended] Session Alpha',
            type: MessageType.SYSTEM,
            isDmOnly: false,
            createdAt: 250,
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

    renderWithTooltip(
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
        'http://localhost:3000/api/chat/messages/11111111-1111-4111-8111-111111111111?limit=20&sinceLatestStart=1',
        expect.anything()
      )
    })

    expect(screen.getByText('Main room action')).toBeTruthy()
    expect(screen.getByText('STARTED')).toBeTruthy()
    expect(screen.queryByText('Greenroom aside')).toBeNull()
    expect(screen.queryByText('[Session Paused] Session Alpha')).toBeNull()
    expect(screen.queryByText('[Session Resumed] Session Alpha')).toBeNull()
    expect(screen.queryByText('[Session Ended] Session Alpha')).toBeNull()
  })

  it('renders campaign brief recap with explicit first-session label', () => {
    renderWithTooltip(
      <MessageList
        currentUserId={String(USER_ID)}
        activeRoomId={MAIN_ROOM_ID}
        messages={
          [
            {
              id: 'abababab-abab-4aba-8aba-abababababab' as UUID,
              roomId: MAIN_ROOM_ID,
              authorId: USER_ID,
              authorUsername: 'SYSTEM',
              content: '[Campaign Brief] Shattered Crown: Heroes begin in the old watchtower.',
              type: MessageType.SYSTEM,
              isDmOnly: false,
              createdAt: Date.now(),
            },
          ] as any
        }
      />
    )

    expect(screen.getByText('Campaign Brief')).toBeTruthy()
    expect(screen.getByText('Shattered Crown: Heroes begin in the old watchtower.')).toBeTruthy()
  })

  it('renders shared handouts as markdown system cards instead of generic bubbles', () => {
    renderWithTooltip(
      <MessageList
        currentUserId={String(USER_ID)}
        activeRoomId={MAIN_ROOM_ID}
        messages={
          [
            {
              id: 'c0ffee00-abab-4aba-8aba-abababababab' as UUID,
              roomId: MAIN_ROOM_ID,
              authorId: USER_ID,
              authorUsername: 'SYSTEM',
              content:
                '[Note Shared] Treasure Map\n' +
                'Shared with: All players\n' +
                'Hashtags: #clue, #treasure\n\n' +
                '**First clue**\n\n' +
                '![map](data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==)',
              type: MessageType.SYSTEM,
              isDmOnly: false,
              createdAt: Date.now(),
            },
          ] as any
        }
      />
    )

    expect(screen.getByText('Handout Shared')).toBeTruthy()
    expect(screen.getByText('Treasure Map')).toBeTruthy()
    expect(screen.getByText('All players')).toBeTruthy()
    expect(screen.getByText('First clue')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'map' })).toBeTruthy()
    expect(screen.queryByText('[Note Shared] Treasure Map')).toBeNull()
  })

  it('prefers structured note-share metadata over legacy text payloads', () => {
    renderWithTooltip(
      <MessageList
        currentUserId={String(USER_ID)}
        activeRoomId={MAIN_ROOM_ID}
        messages={
          [
            {
              id: 'd0ffee00-abab-4aba-8aba-abababababab' as UUID,
              roomId: MAIN_ROOM_ID,
              authorId: USER_ID,
              authorUsername: 'SYSTEM',
              content:
                '[Note Shared] Legacy title\nShared with: Legacy\nHashtags: #old\n\nOld body',
              type: MessageType.SYSTEM,
              isDmOnly: false,
              metadata: {
                noteShared: {
                  kind: 'NOTE_SHARED',
                  noteId: 'f0ffee00-abab-4aba-8aba-abababababab' as UUID,
                  title: 'Structured title',
                  markdown: '**Structured body**',
                  sharedWith: 'All players',
                  hashtags: '#new',
                },
              },
              createdAt: Date.now(),
            },
          ] as any
        }
      />
    )

    expect(screen.getByText('Structured title')).toBeTruthy()
    expect(screen.getByText('Structured body')).toBeTruthy()
    expect(screen.queryByText('Legacy title')).toBeNull()
    expect(screen.queryByText('Old body')).toBeNull()
  })

  it('renders day separators for editorial timeline grouping', () => {
    const yesterday = Date.now() - 24 * 60 * 60 * 1000

    renderWithTooltip(
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

    const separators = document.querySelectorAll('.session-message-list__day-separator')
    expect(separators.length).toBe(2)
    expect(screen.getByText('Today action')).toBeTruthy()
  })

  it('renders the connected message-type bar and whisper picker for players', async () => {
    renderWithTooltip(
      <MessageInput
        onSend={vi.fn().mockResolvedValue(undefined)}
        role={Role.PLAYER}
        whisperRecipients={[
          {
            id: '99999999-9999-4999-8999-999999999999',
            label: 'Brother Sol',
            avatarUrl: null,
          },
        ]}
      />
    )

    expect(screen.getByRole('radio', { name: 'IC' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'OOC' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'WHISPER' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'DM' })).toBeTruthy()

    fireEvent.click(screen.getByRole('radio', { name: 'WHISPER' }))

    expect(await screen.findByText('Whisper to')).toBeTruthy()
    expect(screen.getByText('Brother Sol')).toBeTruthy()
  })

  it('hides the DM type button for the DM', () => {
    renderWithTooltip(<MessageInput onSend={vi.fn().mockResolvedValue(undefined)} role={Role.DM} />)

    expect(screen.getByRole('radio', { name: 'IC' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'OOC' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'WHISPER' })).toBeTruthy()
    expect(screen.queryByRole('radio', { name: 'DM' })).toBeNull()
  })
})
