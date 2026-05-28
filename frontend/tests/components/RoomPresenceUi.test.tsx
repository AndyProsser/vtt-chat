import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { PresenceState, RoomType } from '@shared'
import type { UUID } from '@shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AvatarOverlay } from '../../src/components/workspaces/session/rooms/AvatarOverlay'
import { GroupsPanel as RoomSelector } from '../../src/components/workspaces/session/rooms/GroupsPanel'
import { useStore } from '../../src/hooks/useStore'
import { getUserDMOverride } from '@/utils/audioOverrides'

const asUuid = (value: string) => value as UUID

const getCreateGroupButton = () => screen.queryByRole('button', { name: /Create group/i })

const getCreateGroupDialog = () => screen.getByRole('dialog', { name: /Create group/i })

const getSelectGroupButton = (groupName: string) =>
  screen.getByRole('button', { name: new RegExp(`^Select group ${groupName}$`, 'i') })

const getEndWhisperButton = (groupName: string) =>
  screen.getByRole('button', {
    name: new RegExp(
      `(End whisper|Delete group|Close group|Returns players to Main) ${groupName}`,
      'i'
    ),
  })

const getDmVoiceButton = (groupName: string) =>
  screen.getByRole('button', { name: new RegExp(`^Set DM voice to ${groupName}$`, 'i') })

const getDragUserButton = (username: string) =>
  screen.getByRole('button', { name: new RegExp(`^Drag ${username}$`, 'i') })

const moveUserByDragAndDrop = (username: string, groupName: string) => {
  const dragButton = getDragUserButton(username)
  const dropTarget = getSelectGroupButton(groupName).closest('section') as HTMLElement
  const dragData: Record<string, string> = {}
  const dataTransfer = {
    setData: vi.fn((type: string, value: string) => {
      dragData[type] = value
    }),
    getData: vi.fn((type: string) => dragData[type] || ''),
  }

  fireEvent.dragStart(dragButton, { dataTransfer })
  fireEvent.dragOver(dropTarget, { dataTransfer })
  fireEvent.drop(dropTarget, { dataTransfer })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('AvatarOverlay', () => {
  it('renders muted badge and D&D meta line', () => {
    render(
      <AvatarOverlay
        username="Aria"
        roleLabel="PLAYER"
        presenceState={PresenceState.SPEAKING}
        metaLine="Wizard | Level 7 | Elf"
        isMuted
      />
    )

    expect(screen.getByText('Aria')).toBeTruthy()
    expect(screen.getByText('PLAYER')).toBeTruthy()
    expect(screen.getByText('Wizard | Level 7 | Elf')).toBeTruthy()
    expect(screen.queryByLabelText('Muted microphone')).toBeNull()
    expect(screen.queryByText('Muted')).toBeNull()
  })
})

describe('RoomSelector', () => {
  it('renders room selection and member status cards', () => {
    const onSelectRoom = vi.fn()

    render(
      <RoomSelector
        apiUrl="http://localhost:3000"
        token="jwt-token"
        sessionId={asUuid('session-1')}
        dmUserId={asUuid('user-1')}
        canManageRooms={true}
        broadcastModeEnabled={false}
        onToggleBroadcastMode={vi.fn(async () => {})}
        rooms={[
          {
            id: asUuid('room-1'),
            name: 'Tavern',
            type: RoomType.MAIN,
            memberCount: 2,
            participants: [
              {
                userId: asUuid('user-1'),
                username: 'Morgan',
                roleLabel: 'DM',
                presenceState: PresenceState.ONLINE,
                isMuted: false,
              },
              {
                userId: asUuid('user-2'),
                username: 'Tara',
                roleLabel: 'PLAYER',
                presenceState: PresenceState.SPEAKING,
                isMuted: true,
                characterClass: 'Rogue',
                level: 5,
                characterRace: 'Halfling',
                condition: 'Underwater',
              },
            ],
          },
          {
            id: asUuid('room-2'),
            name: 'Whisper Booth',
            type: RoomType.PRIVATE,
            memberCount: 1,
            participants: [],
          },
        ]}
        selectedRoomId={asUuid('room-1')}
        onSelectRoom={onSelectRoom}
      />
    )

    expect(screen.getAllByRole('button', { name: /Change group environment/i }).length).toBe(1)
    expect(screen.getAllByText('Whisper Booth').length).toBeGreaterThan(0)
    expect(screen.queryByText('Main Group')).toBeNull()
    expect(screen.getByText('Morgan')).toBeTruthy()
    expect(screen.getByText('Tara')).toBeTruthy()
    expect(screen.getByText('Rogue | Halfling | Level 5')).toBeTruthy()

    fireEvent.click(getSelectGroupButton('Tavern'))
    expect(onSelectRoom).toHaveBeenCalledWith(asUuid('room-1'))
  })

  it('renders empty states when there are no rooms or participants', () => {
    render(
      <RoomSelector
        apiUrl="http://localhost:3000"
        token="jwt-token"
        sessionId={asUuid('session-1')}
        dmUserId={asUuid('user-1')}
        canManageRooms={false}
        broadcastModeEnabled={false}
        onToggleBroadcastMode={vi.fn(async () => {})}
        rooms={[]}
        selectedRoomId={''}
        onSelectRoom={() => {}}
      />
    )

    expect(screen.getByText('No groups available.')).toBeTruthy()
    expect(screen.queryByText('No members in this group.')).toBeNull()
  })

  it('keeps whisper docked and collapses other groups during drag in dense sessions', () => {
    const { container } = render(
      <RoomSelector
        apiUrl="http://localhost:3000"
        token="jwt-token"
        sessionId={asUuid('session-1')}
        dmUserId={asUuid('user-1')}
        canManageRooms={true}
        broadcastModeEnabled={false}
        onToggleBroadcastMode={vi.fn(async () => {})}
        rooms={[
          {
            id: asUuid('room-main'),
            name: 'Main Table',
            type: RoomType.MAIN,
            memberCount: 4,
            participants: [
              {
                userId: asUuid('user-1'),
                username: 'Morgan',
                roleLabel: 'DM',
                presenceState: PresenceState.ONLINE,
              },
              {
                userId: asUuid('user-2'),
                username: 'Tara',
                roleLabel: 'PLAYER',
                presenceState: PresenceState.ONLINE,
              },
              {
                userId: asUuid('user-3'),
                username: 'Kara',
                roleLabel: 'PLAYER',
                presenceState: PresenceState.ONLINE,
              },
              {
                userId: asUuid('user-4'),
                username: 'Ivo',
                roleLabel: 'PLAYER',
                presenceState: PresenceState.ONLINE,
              },
            ],
          },
          {
            id: asUuid('room-scouts'),
            name: 'Scouts',
            type: RoomType.GROUP,
            memberCount: 3,
            participants: [
              {
                userId: asUuid('user-5'),
                username: 'Nyra',
                roleLabel: 'PLAYER',
                presenceState: PresenceState.ONLINE,
              },
              {
                userId: asUuid('user-6'),
                username: 'Bex',
                roleLabel: 'PLAYER',
                presenceState: PresenceState.ONLINE,
              },
              {
                userId: asUuid('user-7'),
                username: 'Hale',
                roleLabel: 'PLAYER',
                presenceState: PresenceState.ONLINE,
              },
            ],
          },
          {
            id: asUuid('room-ritual'),
            name: 'Ritual',
            type: RoomType.GROUP,
            memberCount: 3,
            participants: [
              {
                userId: asUuid('user-8'),
                username: 'Orrin',
                roleLabel: 'PLAYER',
                presenceState: PresenceState.ONLINE,
              },
              {
                userId: asUuid('user-9'),
                username: 'Sia',
                roleLabel: 'PLAYER',
                presenceState: PresenceState.ONLINE,
              },
              {
                userId: asUuid('user-10'),
                username: 'Jax',
                roleLabel: 'PLAYER',
                presenceState: PresenceState.ONLINE,
              },
            ],
          },
          {
            id: asUuid('room-whisper'),
            name: 'Whisper Booth',
            type: RoomType.PRIVATE,
            memberCount: 0,
            participants: [],
          },
        ]}
        selectedRoomId={asUuid('room-main')}
        onSelectRoom={vi.fn()}
      />
    )

    expect(container.querySelector('.room-selector-whisper-dock')).toBeTruthy()
    expect(
      container
        .querySelector('[aria-label="Group Scouts"] .room-selector-members-list')
        ?.classList.contains('room-selector-members-list--constrained')
    ).toBe(false)

    fireEvent.dragStart(getDragUserButton('Tara'), {
      dataTransfer: {
        setData: vi.fn(),
        getData: vi.fn(() => asUuid('user-2')),
      },
    })

    expect(
      screen.getByLabelText('Group Scouts').classList.contains('room-selector-item--drag-collapsed')
    ).toBe(true)
    expect(
      screen.getByLabelText('Group Ritual').classList.contains('room-selector-item--drag-collapsed')
    ).toBe(true)
    expect(
      screen
        .getByLabelText('Group Main Table')
        .classList.contains('room-selector-item--drag-collapsed')
    ).toBe(false)
  })

  it('shows optimistic group immediately while create request is pending', async () => {
    const onSelectRoom = vi.fn()
    let resolveFetch: (value: Response) => void = () => undefined
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve
        })
    )

    vi.stubGlobal('fetch', fetchMock)

    render(
      <RoomSelector
        apiUrl="http://localhost:3000"
        token="jwt-token"
        sessionId={asUuid('session-1')}
        dmUserId={asUuid('user-1')}
        canManageRooms={true}
        broadcastModeEnabled={false}
        onToggleBroadcastMode={vi.fn(async () => {})}
        rooms={[
          {
            id: asUuid('room-main'),
            name: 'Main Table',
            type: RoomType.MAIN,
            memberCount: 1,
            participants: [
              {
                userId: asUuid('user-1'),
                username: 'Morgan',
                roleLabel: 'DM',
                presenceState: PresenceState.ONLINE,
              },
            ],
          },
        ]}
        selectedRoomId={asUuid('room-main')}
        onSelectRoom={onSelectRoom}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Create group/i }))
    fireEvent.change(screen.getByPlaceholderText('Scouts'), { target: { value: 'In Jail' } })
    const createDialog = getCreateGroupDialog()
    fireEvent.click(within(createDialog).getByRole('button', { name: /Create Group/i }))

    await waitFor(() => {
      expect(getSelectGroupButton('In Jail')).toBeTruthy()
    })

    resolveFetch(
      new Response(
        JSON.stringify({
          room: {
            id: 'room-jail',
            name: 'In Jail',
            type: RoomType.GROUP,
          },
        }),
        {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/rooms',
        expect.objectContaining({ method: 'POST' })
      )
    })

    await waitFor(() => {
      expect(onSelectRoom).toHaveBeenCalledWith(asUuid('room-jail'))
    })
  })

  it('shows create-group API error message in modal and panel', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ message: 'Only DM can create rooms' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        })
    )

    vi.stubGlobal('fetch', fetchMock)

    render(
      <RoomSelector
        apiUrl="http://localhost:3000"
        token="jwt-token"
        sessionId={asUuid('session-1')}
        dmUserId={asUuid('user-1')}
        canManageRooms={true}
        broadcastModeEnabled={false}
        onToggleBroadcastMode={vi.fn(async () => {})}
        rooms={[]}
        selectedRoomId={''}
        onSelectRoom={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Create group/i }))
    fireEvent.change(screen.getByPlaceholderText('Scouts'), { target: { value: 'Scouts' } })
    const createDialog = getCreateGroupDialog()
    fireEvent.click(within(createDialog).getByRole('button', { name: /Create Group/i }))

    await waitFor(() => {
      expect(screen.getAllByText('Only DM can create rooms').length).toBe(2)
    })
  })

  it('always submits GROUP type in create-group modal', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            room: {
              id: 'room-group',
              name: 'Scout Team',
              type: RoomType.GROUP,
            },
          }),
          {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          }
        )
    )

    vi.stubGlobal('fetch', fetchMock)

    render(
      <RoomSelector
        apiUrl="http://localhost:3000"
        token="jwt-token"
        sessionId={asUuid('session-1')}
        dmUserId={asUuid('user-1')}
        canManageRooms={true}
        broadcastModeEnabled={false}
        onToggleBroadcastMode={vi.fn(async () => {})}
        rooms={[]}
        selectedRoomId={''}
        onSelectRoom={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Create group/i }))
    const createDialog = getCreateGroupDialog()
    fireEvent.change(screen.getByPlaceholderText('Scouts'), { target: { value: 'Scout Team' } })
    expect(within(createDialog).queryByRole('button', { name: /Private/i })).toBeNull()
    fireEvent.click(within(createDialog).getByRole('button', { name: /Create Group/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/rooms',
        expect.objectContaining({
          body: JSON.stringify({
            sessionId: 'session-1',
            name: 'Scout Team',
            type: RoomType.GROUP,
          }),
          method: 'POST',
        })
      )
    })
  })

  it('dismisses the create-group popover on Escape and outside click', () => {
    render(
      <RoomSelector
        apiUrl="http://localhost:3000"
        token="jwt-token"
        sessionId={asUuid('session-1')}
        dmUserId={asUuid('user-1')}
        canManageRooms={true}
        broadcastModeEnabled={false}
        onToggleBroadcastMode={vi.fn(async () => {})}
        rooms={[]}
        selectedRoomId={''}
        onSelectRoom={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Create group/i }))
    expect(getCreateGroupDialog()).toBeTruthy()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: /Create group/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Create group/i }))
    expect(getCreateGroupDialog()).toBeTruthy()

    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('dialog', { name: /Create group/i })).toBeNull()
  })

  it('dismisses the environment picker on Escape and outside click', () => {
    render(
      <RoomSelector
        apiUrl="http://localhost:3000"
        token="jwt-token"
        sessionId={asUuid('session-1')}
        dmUserId={asUuid('user-1')}
        canManageRooms={true}
        broadcastModeEnabled={false}
        onToggleBroadcastMode={vi.fn(async () => {})}
        rooms={[
          {
            id: asUuid('room-main'),
            name: 'Main Table',
            type: RoomType.MAIN,
            memberCount: 1,
            participants: [
              {
                userId: asUuid('user-1'),
                username: 'Morgan',
                roleLabel: 'DM',
                presenceState: PresenceState.ONLINE,
              },
            ],
          },
        ]}
        selectedRoomId={asUuid('room-main')}
        onSelectRoom={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Change group environment/i }))
    expect(screen.getByRole('dialog', { name: 'Group environment picker' })).toBeTruthy()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Group environment picker' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Change group environment/i }))
    expect(screen.getByRole('dialog', { name: 'Group environment picker' })).toBeTruthy()

    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('dialog', { name: 'Group environment picker' })).toBeNull()
  })

  it('sorts private groups to the end of Other Groups', () => {
    render(
      <RoomSelector
        apiUrl="http://localhost:3000"
        token="jwt-token"
        sessionId={asUuid('session-1')}
        dmUserId={asUuid('user-1')}
        canManageRooms={true}
        broadcastModeEnabled={false}
        onToggleBroadcastMode={vi.fn(async () => {})}
        rooms={[
          {
            id: asUuid('room-main'),
            name: 'Main Table',
            type: RoomType.MAIN,
            memberCount: 0,
            participants: [
              {
                userId: asUuid('user-1'),
                username: 'Morgan',
                roleLabel: 'DM',
                presenceState: PresenceState.ONLINE,
              },
            ],
          },
          {
            id: asUuid('room-private-a'),
            name: 'Whisper A',
            type: RoomType.PRIVATE,
            memberCount: 0,
            participants: [],
          },
          {
            id: asUuid('room-group-b'),
            name: 'Scouts',
            type: RoomType.GROUP,
            memberCount: 0,
            participants: [],
          },
          {
            id: asUuid('room-private-b'),
            name: 'Whisper B',
            type: RoomType.PRIVATE,
            memberCount: 0,
            participants: [],
          },
        ]}
        selectedRoomId={asUuid('room-main')}
        onSelectRoom={vi.fn()}
      />
    )

    const groupButtons = screen
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-label')?.startsWith('Select group '))
      .map((button) => button.getAttribute('aria-label'))

    expect(groupButtons).toEqual([
      'Select group Main Table',
      'Select group Scouts',
      'Select group Whisper A',
      'Select group Whisper B',
    ])
  })

  it('ends whisper via API for private room action', async () => {
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/api/rooms/room-private/end-whisper') && options?.method === 'POST') {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ message: 'Unexpected request' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <RoomSelector
        apiUrl="http://localhost:3000"
        token="jwt-token"
        sessionId={asUuid('session-1')}
        dmUserId={asUuid('user-1')}
        canManageRooms={true}
        broadcastModeEnabled={false}
        onToggleBroadcastMode={vi.fn(async () => {})}
        rooms={[
          {
            id: asUuid('room-main'),
            name: 'Main Table',
            type: RoomType.MAIN,
            memberCount: 1,
            participants: [
              {
                userId: asUuid('user-1'),
                username: 'Morgan',
                roleLabel: 'DM',
                presenceState: PresenceState.ONLINE,
              },
            ],
          },
          {
            id: asUuid('room-private'),
            name: 'Whisper Booth',
            type: RoomType.PRIVATE,
            memberCount: 1,
            participants: [
              {
                userId: asUuid('user-2'),
                username: 'Tara',
                roleLabel: 'PLAYER',
                presenceState: PresenceState.ONLINE,
              },
            ],
          },
        ]}
        selectedRoomId={asUuid('room-main')}
        onSelectRoom={vi.fn()}
      />
    )

    fireEvent.click(getEndWhisperButton('Whisper Booth'))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/rooms/room-private/end-whisper',
        expect.objectContaining({ method: 'POST' })
      )
    })

    expect(screen.getAllByText('Whisper Booth').length).toBeGreaterThan(0)
  })

  it('shows close-group API error and keeps group visible when request fails', async () => {
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/api/rooms/room-private/end-whisper') && options?.method === 'POST') {
        return new Response(JSON.stringify({ message: 'Failed to end whisper' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ message: 'Unexpected request' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <RoomSelector
        apiUrl="http://localhost:3000"
        token="jwt-token"
        sessionId={asUuid('session-1')}
        dmUserId={asUuid('user-1')}
        canManageRooms={true}
        broadcastModeEnabled={false}
        onToggleBroadcastMode={vi.fn(async () => {})}
        rooms={[
          {
            id: asUuid('room-main'),
            name: 'Main Table',
            type: RoomType.MAIN,
            memberCount: 1,
            participants: [
              {
                userId: asUuid('user-1'),
                username: 'Morgan',
                roleLabel: 'DM',
                presenceState: PresenceState.ONLINE,
              },
            ],
          },
          {
            id: asUuid('room-private'),
            name: 'Whisper Booth',
            type: RoomType.PRIVATE,
            memberCount: 1,
            participants: [
              {
                userId: asUuid('user-2'),
                username: 'Tara',
                roleLabel: 'PLAYER',
                presenceState: PresenceState.ONLINE,
              },
            ],
          },
        ]}
        selectedRoomId={asUuid('room-main')}
        onSelectRoom={vi.fn()}
      />
    )

    fireEvent.click(getEndWhisperButton('Whisper Booth'))

    await waitFor(() => {
      expect(screen.getByText('Failed to end whisper')).toBeTruthy()
    })

    expect(screen.getAllByText('Whisper Booth').length).toBeGreaterThan(0)
  })

  it('keeps an empty group visible until delete completes and parent/store topology update removes it', async () => {
    useStore.getState().reset()

    const mainRoomId = asUuid('room-main')
    const groupRoomId = asUuid('room-group')

    let resolveDelete: (value: Response) => void = () => undefined
    let deleteResolved = false

    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (url.endsWith('/api/rooms/room-group') && options?.method === 'DELETE') {
        return new Promise<Response>((resolve) => {
          resolveDelete = (response: Response) => {
            deleteResolved = true
            resolve(response)
          }
        })
      }

      if (url.endsWith('/api/rooms/session/session-1')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              rooms: deleteResolved
                ? [
                    {
                      id: 'room-main',
                      sessionId: 'session-1',
                      name: 'Main Table',
                      type: RoomType.MAIN,
                      createdBy: 'user-1',
                      createdAt: 1,
                    },
                  ]
                : [
                    {
                      id: 'room-main',
                      sessionId: 'session-1',
                      name: 'Main Table',
                      type: RoomType.MAIN,
                      createdBy: 'user-1',
                      createdAt: 1,
                    },
                    {
                      id: 'room-group',
                      sessionId: 'session-1',
                      name: 'Scouts',
                      type: RoomType.GROUP,
                      createdBy: 'user-1',
                      createdAt: 1,
                    },
                  ],
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        )
      }

      if (url.endsWith('/api/presence/session-1')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              presence: [
                {
                  sessionId: 'session-1',
                  userId: 'user-1',
                  username: 'Morgan',
                  state: PresenceState.ONLINE,
                  primaryRoomId: 'room-main',
                  lastSeenAt: 1,
                },
                {
                  sessionId: 'session-1',
                  userId: 'user-1',
                  username: 'Morgan',
                  state: PresenceState.ONLINE,
                  primaryRoomId: 'room-main',
                  lastSeenAt: 1,
                },
              ],
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        )
      }

      return Promise.resolve(
        new Response(JSON.stringify({ message: 'Unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    })

    vi.stubGlobal('fetch', fetchMock)

    const baseProps = {
      apiUrl: 'http://localhost:3000',
      token: 'jwt-token',
      sessionId: asUuid('session-1'),
      dmUserId: asUuid('user-1'),
      canManageRooms: true,
      broadcastModeEnabled: false,
      onToggleBroadcastMode: vi.fn(async () => {}),
      selectedRoomId: asUuid('room-main'),
      onSelectRoom: vi.fn(),
    }

    const initialRooms = [
      {
        id: mainRoomId,
        name: 'Main Table',
        type: RoomType.MAIN,
        memberCount: 1,
        participants: [
          {
            userId: asUuid('user-1'),
            username: 'Morgan',
            roleLabel: 'DM' as const,
            presenceState: PresenceState.ONLINE,
          },
        ],
      },
      {
        id: groupRoomId,
        name: 'Scouts',
        type: RoomType.GROUP,
        memberCount: 0,
        participants: [],
      },
    ]

    const { rerender } = render(<RoomSelector {...baseProps} rooms={initialRooms} />)

    fireEvent.click(
      screen.getByRole('button', {
        name: /Delete group Scouts|Close group Scouts|End whisper Scouts|Returns players to Main Scouts/i,
      })
    )

    // While DELETE is still pending, group remains visible (not prematurely hidden).
    await waitFor(() => {
      expect(screen.getByLabelText('Group Scouts')).toBeTruthy()
    })
    expect(screen.getByLabelText('Group Scouts').className).toContain(
      'room-selector-item--deleting'
    )

    resolveDelete(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/rooms/room-group',
        expect.objectContaining({ method: 'DELETE' })
      )
    })

    // Parent/session topology updates after deletion are reflected in props.
    rerender(<RoomSelector {...baseProps} rooms={initialRooms.slice(0, 1)} />)

    await waitFor(() => {
      expect(screen.queryByLabelText('Group Scouts')).toBeNull()
      expect(screen.getByLabelText('Group Main Table')).toBeTruthy()
    })
  })

  it('disables delete button while deleting an empty group and re-enables it after failure for retry', async () => {
    useStore.getState().reset()

    const mainRoomId = asUuid('room-main')
    const groupRoomId = asUuid('room-group')

    let deleteCallCount = 0
    let resolveFirstDelete: (value: Response) => void = () => undefined

    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (url.endsWith('/api/rooms/room-group') && options?.method === 'DELETE') {
        deleteCallCount += 1

        if (deleteCallCount === 1) {
          return new Promise<Response>((resolve) => {
            resolveFirstDelete = resolve
          })
        }

        return Promise.resolve(
          new Response(JSON.stringify({ message: 'Failed to close group' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      }

      return Promise.resolve(
        new Response(JSON.stringify({ message: 'Unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <RoomSelector
        apiUrl="http://localhost:3000"
        token="jwt-token"
        sessionId={asUuid('session-1')}
        dmUserId={asUuid('user-1')}
        canManageRooms={true}
        broadcastModeEnabled={false}
        onToggleBroadcastMode={vi.fn(async () => {})}
        rooms={[
          {
            id: mainRoomId,
            name: 'Main Table',
            type: RoomType.MAIN,
            memberCount: 1,
            participants: [
              {
                userId: asUuid('user-1'),
                username: 'Morgan',
                roleLabel: 'DM',
                presenceState: PresenceState.ONLINE,
              },
            ],
          },
          {
            id: groupRoomId,
            name: 'Scouts',
            type: RoomType.GROUP,
            memberCount: 0,
            participants: [],
          },
        ]}
        selectedRoomId={asUuid('room-main')}
        onSelectRoom={vi.fn()}
      />
    )

    const deleteButton = screen.getByRole('button', { name: /Delete group Scouts/i })
    expect(deleteButton.hasAttribute('disabled')).toBe(false)
    expect(deleteButton.className).toContain('room-selector-item__close-inline--delete')

    fireEvent.click(deleteButton)

    await waitFor(() => {
      expect(deleteButton.hasAttribute('disabled')).toBe(true)
      expect(screen.getByLabelText('Group Scouts').className).toContain(
        'room-selector-item--deleting'
      )
    })

    resolveFirstDelete(
      new Response(JSON.stringify({ message: 'Failed to close group' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    await waitFor(() => {
      expect(screen.getByText('Failed to close group')).toBeTruthy()
      expect(deleteButton.hasAttribute('disabled')).toBe(false)
    })

    fireEvent.click(deleteButton)

    await waitFor(() => {
      const deleteCalls = fetchMock.mock.calls.filter(
        ([url, options]) =>
          String(url).endsWith('/api/rooms/room-group') &&
          (options as RequestInit | undefined)?.method === 'DELETE'
      )
      expect(deleteCalls.length).toBe(2)
    })
  })

  it('first close on non-empty group evacuates players to Main and does not delete the group', async () => {
    useStore.getState().reset()

    const onSelectRoom = vi.fn()

    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/api/rooms/room-main/members/move') && options?.method === 'POST') {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      if (url.endsWith('/api/rooms/session/session-1')) {
        return new Response(
          JSON.stringify({
            rooms: [
              {
                id: 'room-main',
                sessionId: 'session-1',
                name: 'Main Table',
                type: RoomType.MAIN,
                createdBy: 'user-1',
                createdAt: 1,
              },
              {
                id: 'room-group',
                sessionId: 'session-1',
                name: 'Scouts',
                type: RoomType.GROUP,
                createdBy: 'user-1',
                createdAt: 1,
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }

      if (url.endsWith('/api/presence/session-1')) {
        return new Response(
          JSON.stringify({
            presence: [
              {
                sessionId: 'session-1',
                userId: 'user-1',
                username: 'Morgan',
                state: PresenceState.ONLINE,
                primaryRoomId: 'room-main',
                lastSeenAt: 1,
              },
              {
                sessionId: 'session-1',
                userId: 'user-2',
                username: 'Tara',
                state: PresenceState.ONLINE,
                primaryRoomId: 'room-main',
                lastSeenAt: 1,
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }

      return new Response(JSON.stringify({ message: 'Unexpected request' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <RoomSelector
        apiUrl="http://localhost:3000"
        token="jwt-token"
        sessionId={asUuid('session-1')}
        dmUserId={asUuid('user-1')}
        canManageRooms={true}
        broadcastModeEnabled={false}
        onToggleBroadcastMode={vi.fn(async () => {})}
        rooms={[
          {
            id: asUuid('room-main'),
            name: 'Main Table',
            type: RoomType.MAIN,
            memberCount: 1,
            participants: [
              {
                userId: asUuid('user-1'),
                username: 'Morgan',
                roleLabel: 'DM',
                presenceState: PresenceState.ONLINE,
              },
            ],
          },
          {
            id: asUuid('room-group'),
            name: 'Scouts',
            type: RoomType.GROUP,
            memberCount: 1,
            participants: [
              {
                userId: asUuid('user-2'),
                username: 'Tara',
                roleLabel: 'PLAYER',
                presenceState: PresenceState.ONLINE,
              },
            ],
          },
        ]}
        selectedRoomId={asUuid('room-group')}
        onSelectRoom={onSelectRoom}
      />
    )

    const returnToMainButton = screen.getByRole('button', {
      name: /Returns players to Main Scouts/i,
    })
    expect(returnToMainButton.className).toContain('room-selector-item__close-inline--return')
    fireEvent.click(returnToMainButton)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/rooms/room-main/members/move',
        expect.objectContaining({ method: 'POST' })
      )
    })

    const deleteCalls = fetchMock.mock.calls.filter(
      ([url, options]) =>
        String(url).endsWith('/api/rooms/room-group') &&
        (options as RequestInit | undefined)?.method === 'DELETE'
    )
    expect(deleteCalls.length).toBe(0)
    expect(onSelectRoom).toHaveBeenCalledWith(asUuid('room-main'))
    expect(screen.getByLabelText('Group Scouts')).toBeTruthy()
  })

  it('allows DM voice target when server presence confirms group has players', async () => {
    useStore.getState().reset()

    const onSelectRoom = vi.fn()
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/api/presence/session-1')) {
        return new Response(
          JSON.stringify({
            presence: [
              {
                sessionId: 'session-1',
                userId: 'user-2',
                username: 'Tara',
                state: PresenceState.ONLINE,
                primaryRoomId: 'room-group',
                lastSeenAt: 1,
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }

      return new Response(JSON.stringify({ message: 'Unexpected request' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <RoomSelector
        apiUrl="http://localhost:3000"
        token="jwt-token"
        sessionId={asUuid('session-1')}
        dmUserId={asUuid('user-1')}
        canManageRooms={true}
        broadcastModeEnabled={false}
        onToggleBroadcastMode={vi.fn(async () => {})}
        rooms={[
          {
            id: asUuid('room-main'),
            name: 'Main Table',
            type: RoomType.MAIN,
            memberCount: 1,
            participants: [
              {
                userId: asUuid('user-1'),
                username: 'Morgan',
                roleLabel: 'DM',
                presenceState: PresenceState.ONLINE,
              },
            ],
          },
          {
            id: asUuid('room-group'),
            name: 'Scouts',
            type: RoomType.GROUP,
            memberCount: 1,
            participants: [],
          },
        ]}
        selectedRoomId={asUuid('room-main')}
        onSelectRoom={onSelectRoom}
      />
    )

    fireEvent.click(getDmVoiceButton('Scouts'))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/presence/session-1',
        expect.any(Object)
      )
      expect(onSelectRoom).toHaveBeenCalledWith(asUuid('room-group'))
      expect(screen.queryByText('Cannot set DM voice target to an empty room or group')).toBeNull()
    })
  })

  it('blocks targeting an empty whisper room as DM voice', async () => {
    useStore.getState().reset()

    const onSelectRoom = vi.fn()
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/api/presence/session-1')) {
        return new Response(JSON.stringify({ presence: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ message: 'Unexpected request' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <RoomSelector
        apiUrl="http://localhost:3000"
        token="jwt-token"
        sessionId={asUuid('session-1')}
        dmUserId={asUuid('user-1')}
        canManageRooms={true}
        broadcastModeEnabled={false}
        onToggleBroadcastMode={vi.fn(async () => {})}
        rooms={[
          {
            id: asUuid('room-main'),
            name: 'Main Table',
            type: RoomType.MAIN,
            memberCount: 1,
            participants: [
              {
                userId: asUuid('user-1'),
                username: 'Morgan',
                roleLabel: 'DM',
                presenceState: PresenceState.ONLINE,
              },
            ],
          },
          {
            id: asUuid('room-private'),
            name: 'Whisper Booth',
            type: RoomType.PRIVATE,
            memberCount: 0,
            participants: [],
          },
        ]}
        selectedRoomId={asUuid('room-main')}
        onSelectRoom={onSelectRoom}
      />
    )

    fireEvent.click(getSelectGroupButton('Whisper Booth'))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/presence/session-1',
        expect.any(Object)
      )
      expect(screen.getByText('Cannot set DM voice target to an empty room or group')).toBeTruthy()
      expect(onSelectRoom).not.toHaveBeenCalledWith(asUuid('room-private'))
    })
  })

  it('hides voice-panel create-group controls in greenroom and shows DM management groups', () => {
    render(
      <RoomSelector
        apiUrl="http://localhost:3000"
        token="jwt-token"
        sessionId={asUuid('session-1')}
        dmUserId={asUuid('user-1')}
        isGreenroom={true}
        canManageRooms={true}
        broadcastModeEnabled={false}
        onToggleBroadcastMode={vi.fn(async () => {})}
        rooms={[
          {
            id: asUuid('room-main'),
            name: 'Main Table',
            type: RoomType.MAIN,
            memberCount: 2,
            participants: [
              {
                userId: asUuid('user-1'),
                username: 'Morgan',
                roleLabel: 'DM',
                presenceState: PresenceState.ONLINE,
              },
              {
                userId: asUuid('user-2'),
                username: 'Tara',
                roleLabel: 'PLAYER',
                presenceState: PresenceState.ONLINE,
              },
            ],
          },
          {
            id: asUuid('room-other'),
            name: 'Scouts',
            type: RoomType.GROUP,
            memberCount: 0,
            participants: [],
          },
        ]}
        selectedRoomId={asUuid('room-main')}
        onSelectRoom={vi.fn()}
      />
    )

    expect(getCreateGroupButton()).toBeNull()
    expect(screen.queryByLabelText('Dungeon Master voice controls')).toBeNull()
    expect(screen.queryByRole('button', { name: /Drag Tara/i })).toBeNull()
    expect(screen.getByRole('button', { name: 'Tara' })).toBeTruthy()
    expect(screen.getByText('Morgan')).toBeTruthy()
    expect(screen.getByText('Tara')).toBeTruthy()
    const effectButtons = screen.getAllByRole('button', { name: /Change group environment/i })
    expect(effectButtons.length).toBeGreaterThan(0)
    expect(effectButtons[0]?.hasAttribute('disabled')).toBe(true)
  })

  it('keeps DM first and sorts remaining greenroom members alphabetically', () => {
    const { container } = render(
      <RoomSelector
        apiUrl="http://localhost:3000"
        token="jwt-token"
        sessionId={asUuid('session-1')}
        dmUserId={asUuid('user-1')}
        isGreenroom={true}
        canManageRooms={true}
        broadcastModeEnabled={false}
        onToggleBroadcastMode={vi.fn(async () => {})}
        rooms={[
          {
            id: asUuid('room-main'),
            name: 'Green Room',
            type: RoomType.MAIN,
            memberCount: 4,
            participants: [
              {
                userId: asUuid('user-3'),
                username: 'Tharn',
                roleLabel: 'PLAYER',
                presenceState: PresenceState.ONLINE,
              },
              {
                userId: asUuid('user-1'),
                username: 'Morgan',
                roleLabel: 'DM',
                presenceState: PresenceState.ONLINE,
              },
              {
                userId: asUuid('user-4'),
                username: 'Rook',
                roleLabel: 'PLAYER',
                presenceState: PresenceState.ONLINE,
              },
              {
                userId: asUuid('user-2'),
                username: 'Aria',
                roleLabel: 'PLAYER',
                presenceState: PresenceState.ONLINE,
              },
            ],
          },
        ]}
        selectedRoomId={asUuid('room-main')}
        onSelectRoom={vi.fn()}
      />
    )

    const memberButtons = Array.from(
      container.querySelectorAll('[aria-label="Group Green Room"] .room-selector-member')
    ).map((node) => node.getAttribute('aria-label'))

    expect(memberButtons).toEqual(['Morgan', 'Aria', 'Rook', 'Tharn'])
  })

  it('allows ending whisper room even when members are present', async () => {
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/api/rooms/room-private/end-whisper') && options?.method === 'POST') {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ message: 'Unexpected request' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <RoomSelector
        apiUrl="http://localhost:3000"
        token="jwt-token"
        sessionId={asUuid('session-1')}
        dmUserId={asUuid('user-1')}
        canManageRooms={true}
        broadcastModeEnabled={false}
        onToggleBroadcastMode={vi.fn(async () => {})}
        rooms={[
          {
            id: asUuid('room-main'),
            name: 'Main Table',
            type: RoomType.MAIN,
            memberCount: 1,
            participants: [
              {
                userId: asUuid('user-1'),
                username: 'Morgan',
                roleLabel: 'DM',
                presenceState: PresenceState.ONLINE,
              },
            ],
          },
          {
            id: asUuid('room-private'),
            name: 'Whisper Booth',
            type: RoomType.PRIVATE,
            memberCount: 1,
            participants: [
              {
                userId: asUuid('user-2'),
                username: 'Tara',
                roleLabel: 'PLAYER',
                presenceState: PresenceState.ONLINE,
              },
            ],
          },
        ]}
        selectedRoomId={asUuid('room-main')}
        onSelectRoom={vi.fn()}
      />
    )

    const closeButton = getEndWhisperButton('Whisper Booth')
    expect(closeButton.hasAttribute('disabled')).toBe(false)

    fireEvent.click(closeButton)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/rooms/room-private/end-whisper',
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('allows moving a whisper participant out while another whisper participant remains', async () => {
    useStore.getState().reset()

    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/api/rooms/room-main/members/move') && options?.method === 'POST') {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ message: 'Unexpected request' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <RoomSelector
        apiUrl="http://localhost:3000"
        token="jwt-token"
        sessionId={asUuid('session-1')}
        dmUserId={asUuid('user-1')}
        canManageRooms={true}
        broadcastModeEnabled={false}
        onToggleBroadcastMode={vi.fn(async () => {})}
        rooms={[
          {
            id: asUuid('room-main'),
            name: 'Main Table',
            type: RoomType.MAIN,
            memberCount: 1,
            participants: [
              {
                userId: asUuid('user-1'),
                username: 'Morgan',
                roleLabel: 'DM',
                presenceState: PresenceState.ONLINE,
              },
            ],
          },
          {
            id: asUuid('room-private'),
            name: 'Whisper Booth',
            type: RoomType.PRIVATE,
            memberCount: 2,
            participants: [
              {
                userId: asUuid('user-2'),
                username: 'Tara',
                roleLabel: 'PLAYER',
                presenceState: PresenceState.ONLINE,
              },
              {
                userId: asUuid('user-3'),
                username: 'Zara',
                roleLabel: 'PLAYER',
                presenceState: PresenceState.ONLINE,
              },
            ],
          },
        ]}
        selectedRoomId={asUuid('room-private')}
        onSelectRoom={vi.fn()}
      />
    )

    moveUserByDragAndDrop('Tara', 'Main Table')

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/rooms/room-main/members/move',
        expect.objectContaining({ method: 'POST' })
      )
    })

    expect(screen.queryByText('End whisper to move the last player out of whisper')).toBeNull()
  })

  it('auto-ends whisper and returns DM voice to Main when dragging last whisper player out', async () => {
    useStore.getState().reset()

    const onSelectRoom = vi.fn()

    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/api/rooms/room-main/members/move') && options?.method === 'POST') {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      if (url.endsWith('/api/rooms/room-private/end-whisper') && options?.method === 'POST') {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      if (url.endsWith('/api/rooms/session/session-1')) {
        return new Response(JSON.stringify({ rooms: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      if (url.endsWith('/api/presence/session-1')) {
        return new Response(JSON.stringify({ presence: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ message: 'Unexpected request' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <RoomSelector
        apiUrl="http://localhost:3000"
        token="jwt-token"
        sessionId={asUuid('session-1')}
        dmUserId={asUuid('user-1')}
        canManageRooms={true}
        broadcastModeEnabled={false}
        onToggleBroadcastMode={vi.fn(async () => {})}
        rooms={[
          {
            id: asUuid('room-main'),
            name: 'Main Table',
            type: RoomType.MAIN,
            memberCount: 1,
            participants: [
              {
                userId: asUuid('user-1'),
                username: 'Morgan',
                roleLabel: 'DM',
                presenceState: PresenceState.ONLINE,
              },
            ],
          },
          {
            id: asUuid('room-private'),
            name: 'Whisper Booth',
            type: RoomType.PRIVATE,
            memberCount: 1,
            participants: [
              {
                userId: asUuid('user-2'),
                username: 'Tara',
                roleLabel: 'PLAYER',
                presenceState: PresenceState.ONLINE,
              },
            ],
          },
        ]}
        selectedRoomId={asUuid('room-private')}
        onSelectRoom={onSelectRoom}
      />
    )

    moveUserByDragAndDrop('Tara', 'Main Table')

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/rooms/room-main/members/move',
        expect.objectContaining({ method: 'POST' })
      )
    })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/rooms/room-private/end-whisper',
        expect.objectContaining({ method: 'POST' })
      )
    })

    await waitFor(() => {
      expect(onSelectRoom).toHaveBeenCalledWith(asUuid('room-main'))
    })

    expect(screen.queryByText('End whisper to move the last player out of whisper')).toBeNull()
  })

  it('disables end-whisper button while pending whisper moves exist', async () => {
    useStore.getState().reset()

    let resolveMoveParticipant: (value: Response) => void = () => undefined
    const moveParticipantPromise = new Promise<Response>((resolve) => {
      resolveMoveParticipant = resolve
    })

    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/api/rooms/room-private/members/move') && options?.method === 'POST') {
        return moveParticipantPromise
      }

      return new Response(JSON.stringify({ message: 'Unexpected request' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <RoomSelector
        apiUrl="http://localhost:3000"
        token="jwt-token"
        sessionId={asUuid('session-1')}
        dmUserId={asUuid('user-1')}
        canManageRooms={true}
        broadcastModeEnabled={false}
        onToggleBroadcastMode={vi.fn(async () => {})}
        rooms={[
          {
            id: asUuid('room-main'),
            name: 'Main Table',
            type: RoomType.MAIN,
            memberCount: 2,
            participants: [
              {
                userId: asUuid('user-1'),
                username: 'Morgan',
                roleLabel: 'DM',
                presenceState: PresenceState.ONLINE,
              },
              {
                userId: asUuid('user-3'),
                username: 'Zara',
                roleLabel: 'PLAYER',
                presenceState: PresenceState.ONLINE,
              },
            ],
          },
          {
            id: asUuid('room-private'),
            name: 'Whisper Booth',
            type: RoomType.PRIVATE,
            memberCount: 1,
            participants: [
              {
                userId: asUuid('user-2'),
                username: 'Tara',
                roleLabel: 'PLAYER',
                presenceState: PresenceState.ONLINE,
              },
            ],
          },
        ]}
        selectedRoomId={asUuid('room-main')}
        onSelectRoom={vi.fn()}
      />
    )

    // Verify end-whisper button exists and is enabled initially
    const endWhisperButton = screen.getByRole('button', { name: 'End whisper' })
    expect(endWhisperButton.hasAttribute('disabled')).toBe(false)

    moveUserByDragAndDrop('Zara', 'Whisper Booth')

    // Wait for the move to be pending and end-whisper button to become disabled
    await waitFor(() => {
      expect(endWhisperButton.hasAttribute('disabled')).toBe(true)
    })

    resolveMoveParticipant(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    await waitFor(() => {
      expect(endWhisperButton.hasAttribute('disabled')).toBe(false)
    })
  })

  it('does not auto-end whisper while a move into whisper is still reconciling topology', async () => {
    useStore.getState().reset()

    let endWhisperCalls = 0
    let resolveRoomsSync: ((value: Response) => void) | null = null
    let resolvePresenceSync: ((value: Response) => void) | null = null
    const roomsSyncPromise = new Promise<Response>((resolve) => {
      resolveRoomsSync = resolve
    })
    const presenceSyncPromise = new Promise<Response>((resolve) => {
      resolvePresenceSync = resolve
    })

    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/api/rooms/room-private/members/move') && options?.method === 'POST') {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      if (url.endsWith('/api/rooms/session/session-1')) {
        return roomsSyncPromise
      }

      if (url.endsWith('/api/presence/session-1')) {
        return presenceSyncPromise
      }

      if (url.endsWith('/api/rooms/room-private/end-whisper') && options?.method === 'POST') {
        endWhisperCalls += 1
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ message: 'Unexpected request' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <RoomSelector
        apiUrl="http://localhost:3000"
        token="jwt-token"
        sessionId={asUuid('session-1')}
        dmUserId={asUuid('user-1')}
        canManageRooms={true}
        broadcastModeEnabled={false}
        onToggleBroadcastMode={vi.fn(async () => {})}
        rooms={[
          {
            id: asUuid('room-main'),
            name: 'Main Table',
            type: RoomType.MAIN,
            memberCount: 2,
            participants: [
              {
                userId: asUuid('user-1'),
                username: 'Morgan',
                roleLabel: 'DM',
                presenceState: PresenceState.ONLINE,
              },
              {
                userId: asUuid('user-3'),
                username: 'Zara',
                roleLabel: 'PLAYER',
                presenceState: PresenceState.ONLINE,
              },
            ],
          },
          {
            id: asUuid('room-private'),
            name: 'Whisper Booth',
            type: RoomType.PRIVATE,
            memberCount: 0,
            participants: [],
          },
        ]}
        selectedRoomId={asUuid('room-main')}
        onSelectRoom={vi.fn()}
      />
    )

    moveUserByDragAndDrop('Zara', 'Whisper Booth')

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/rooms/room-private/members/move',
        expect.objectContaining({ method: 'POST' })
      )
    })

    await new Promise((resolve) => window.setTimeout(resolve, 0))
    expect(endWhisperCalls).toBe(0)

    await act(async () => {
      resolveRoomsSync?.(
        new Response(JSON.stringify({ rooms: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      resolvePresenceSync?.(
        new Response(JSON.stringify({ presence: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    })
  })

  it('does not show breakout labels and renders metadata row in the panel', () => {
    render(
      <RoomSelector
        apiUrl="http://localhost:3000"
        token="jwt-token"
        sessionId={asUuid('session-1')}
        dmUserId={asUuid('user-1')}
        canManageRooms={true}
        broadcastModeEnabled={false}
        onToggleBroadcastMode={vi.fn(async () => {})}
        rooms={[
          {
            id: asUuid('room-main'),
            name: 'Main Table',
            type: RoomType.MAIN,
            memberCount: 1,
            participants: [
              {
                userId: asUuid('user-1'),
                username: 'Morgan',
                roleLabel: 'DM',
                presenceState: PresenceState.ONLINE,
              },
            ],
          },
          {
            id: asUuid('room-group'),
            name: 'Scouts',
            type: RoomType.GROUP,
            memberCount: 1,
            participants: [
              {
                userId: asUuid('user-2'),
                username: 'Tara',
                roleLabel: 'PLAYER',
                presenceState: PresenceState.IDLE,
              },
            ],
          },
        ]}
        selectedRoomId={asUuid('room-main')}
        onSelectRoom={vi.fn()}
      />
    )

    expect(screen.queryByText('Breakout')).toBeNull()
    expect(screen.getByText('Class TBD | Level ? | Race TBD')).toBeTruthy()
    expect(screen.queryByText('IDLE')).toBeNull()
  })

  it('lights all DM voice controls in broadcast mode and selecting one disables broadcast', async () => {
    const onSelectRoom = vi.fn()
    const onToggleBroadcastMode = vi.fn(async () => {})

    render(
      <RoomSelector
        apiUrl="http://localhost:3000"
        token="jwt-token"
        sessionId={asUuid('session-1')}
        dmUserId={asUuid('user-1')}
        canManageRooms={true}
        broadcastModeEnabled={true}
        onToggleBroadcastMode={onToggleBroadcastMode}
        rooms={[
          {
            id: asUuid('room-main'),
            name: 'Main Table',
            type: RoomType.MAIN,
            memberCount: 1,
            participants: [
              {
                userId: asUuid('user-1'),
                username: 'Morgan',
                roleLabel: 'DM',
                presenceState: PresenceState.ONLINE,
              },
            ],
          },
          {
            id: asUuid('room-scouts'),
            name: 'Scouts',
            type: RoomType.GROUP,
            memberCount: 1,
            participants: [
              {
                userId: asUuid('user-2'),
                username: 'Tara',
                roleLabel: 'PLAYER',
                presenceState: PresenceState.ONLINE,
              },
            ],
          },
        ]}
        selectedRoomId={asUuid('room-main')}
        onSelectRoom={onSelectRoom}
      />
    )

    const voiceButtons = screen.getAllByRole('button', { name: /Set DM voice to/i })
    expect(voiceButtons.length).toBeGreaterThan(1)
    for (const button of voiceButtons) {
      expect(button.className).toContain('is-broadcast')
    }

    fireEvent.click(getDmVoiceButton('Scouts'))

    await waitFor(() => {
      expect(onToggleBroadcastMode).toHaveBeenCalledWith(false)
      expect(onSelectRoom).toHaveBeenCalledWith(asUuid('room-scouts'))
    })
  })

  it('restores previous DM voice target when broadcast is disabled from header', async () => {
    const onSelectRoom = vi.fn()
    const onToggleBroadcastMode = vi.fn(async () => {})

    const { rerender } = render(
      <RoomSelector
        apiUrl="http://localhost:3000"
        token="jwt-token"
        sessionId={asUuid('session-1')}
        dmUserId={asUuid('user-1')}
        canManageRooms={true}
        broadcastModeEnabled={false}
        onToggleBroadcastMode={onToggleBroadcastMode}
        rooms={[
          {
            id: asUuid('room-main'),
            name: 'Main Table',
            type: RoomType.MAIN,
            memberCount: 1,
            participants: [
              {
                userId: asUuid('user-1'),
                username: 'Morgan',
                roleLabel: 'DM',
                presenceState: PresenceState.ONLINE,
              },
            ],
          },
          {
            id: asUuid('room-scouts'),
            name: 'Scouts',
            type: RoomType.GROUP,
            memberCount: 0,
            participants: [],
          },
        ]}
        selectedRoomId={asUuid('room-scouts')}
        onSelectRoom={onSelectRoom}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Enable broadcast mode' }))

    await waitFor(() => {
      expect(onToggleBroadcastMode).toHaveBeenCalledWith(true)
    })

    rerender(
      <RoomSelector
        apiUrl="http://localhost:3000"
        token="jwt-token"
        sessionId={asUuid('session-1')}
        dmUserId={asUuid('user-1')}
        canManageRooms={true}
        broadcastModeEnabled={true}
        onToggleBroadcastMode={onToggleBroadcastMode}
        rooms={[
          {
            id: asUuid('room-main'),
            name: 'Main Table',
            type: RoomType.MAIN,
            memberCount: 1,
            participants: [
              {
                userId: asUuid('user-1'),
                username: 'Morgan',
                roleLabel: 'DM',
                presenceState: PresenceState.ONLINE,
              },
            ],
          },
          {
            id: asUuid('room-scouts'),
            name: 'Scouts',
            type: RoomType.GROUP,
            memberCount: 0,
            participants: [],
          },
        ]}
        selectedRoomId={asUuid('room-main')}
        onSelectRoom={onSelectRoom}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Disable broadcast mode' }))

    await waitFor(() => {
      expect(onToggleBroadcastMode).toHaveBeenCalledWith(false)
      expect(onSelectRoom).toHaveBeenCalledWith(asUuid('room-scouts'))
    })
  })

  it('moves a participant to another room with drag-and-drop', async () => {
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/api/rooms/room-target/members/move') && options?.method === 'POST') {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ message: 'Unexpected request' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <RoomSelector
        apiUrl="http://localhost:3000"
        token="jwt-token"
        sessionId={asUuid('session-1')}
        dmUserId={asUuid('user-1')}
        canManageRooms={true}
        broadcastModeEnabled={false}
        onToggleBroadcastMode={vi.fn(async () => {})}
        rooms={[
          {
            id: asUuid('room-main'),
            name: 'Main Table',
            type: RoomType.MAIN,
            memberCount: 1,
            participants: [
              {
                userId: asUuid('user-1'),
                username: 'Morgan',
                roleLabel: 'DM',
                presenceState: PresenceState.ONLINE,
              },
              {
                userId: asUuid('user-2'),
                username: 'Tara',
                roleLabel: 'PLAYER',
                presenceState: PresenceState.ONLINE,
              },
            ],
          },
          {
            id: asUuid('room-target'),
            name: 'Whisper Booth',
            type: RoomType.PRIVATE,
            memberCount: 0,
            participants: [],
          },
        ]}
        selectedRoomId={asUuid('room-main')}
        onSelectRoom={vi.fn()}
      />
    )

    moveUserByDragAndDrop('Tara', 'Whisper Booth')

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/rooms/room-target/members/move',
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('moves participant via drag-and-drop onto another group', async () => {
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/api/rooms/room-target/members/move') && options?.method === 'POST') {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ message: 'Unexpected request' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <RoomSelector
        apiUrl="http://localhost:3000"
        token="jwt-token"
        sessionId={asUuid('session-1')}
        dmUserId={asUuid('user-1')}
        canManageRooms={true}
        broadcastModeEnabled={false}
        onToggleBroadcastMode={vi.fn(async () => {})}
        rooms={[
          {
            id: asUuid('room-main'),
            name: 'Main Table',
            type: RoomType.MAIN,
            memberCount: 2,
            participants: [
              {
                userId: asUuid('user-1'),
                username: 'Morgan',
                roleLabel: 'DM',
                presenceState: PresenceState.ONLINE,
              },
              {
                userId: asUuid('user-2'),
                username: 'Tara',
                roleLabel: 'PLAYER',
                presenceState: PresenceState.ONLINE,
              },
            ],
          },
          {
            id: asUuid('room-target'),
            name: 'Scouts',
            type: RoomType.GROUP,
            memberCount: 0,
            participants: [],
          },
        ]}
        selectedRoomId={asUuid('room-main')}
        onSelectRoom={vi.fn()}
      />
    )

    moveUserByDragAndDrop('Tara', 'Scouts')

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/rooms/room-target/members/move',
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('applies mute from the player context menu', async () => {
    useStore.getState().reset()

    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/api/audio/dm-override/apply') && options?.method === 'POST') {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      if (url.endsWith('/api/audio/sessions/session-1/state') && !options?.method) {
        return new Response(
          JSON.stringify({
            dmOverrides: [
              {
                targetUserId: asUuid('user-2'),
                overrideType: 'MUTE',
                parameters: {},
                appliedAt: Date.now(),
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }

      return new Response(JSON.stringify({ message: 'Unexpected request' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <RoomSelector
        apiUrl="http://localhost:3000"
        token="jwt-token"
        sessionId={asUuid('session-1')}
        dmUserId={asUuid('user-1')}
        canManageRooms={true}
        broadcastModeEnabled={false}
        onToggleBroadcastMode={vi.fn(async () => {})}
        rooms={[
          {
            id: asUuid('room-main'),
            name: 'Main Table',
            type: RoomType.MAIN,
            memberCount: 2,
            participants: [
              {
                userId: asUuid('user-1'),
                username: 'Morgan',
                roleLabel: 'DM',
                presenceState: PresenceState.ONLINE,
              },
              {
                userId: asUuid('user-2'),
                username: 'Tara',
                roleLabel: 'PLAYER',
                presenceState: PresenceState.ONLINE,
                isMuted: false,
              },
            ],
          },
        ]}
        selectedRoomId={asUuid('room-main')}
        onSelectRoom={vi.fn()}
      />
    )

    fireEvent.contextMenu(getDragUserButton('Tara'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mute' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/audio/dm-override/apply',
        expect.objectContaining({ method: 'POST' })
      )
    })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/audio/sessions/session-1/state',
        expect.objectContaining({ headers: { Authorization: 'Bearer jwt-token' } })
      )
    })

    expect(
      getUserDMOverride(useStore.getState().dmOverrides, asUuid('user-2'), 'MUTE')?.overrideType
    ).toBe('MUTE')
  })

  it('removes mute from the player context menu', async () => {
    useStore.getState().reset()
    useStore.getState().setDMOverride(asUuid('user-2'), {
      userId: asUuid('user-2'),
      overrideType: 'MUTE',
      appliedAt: Date.now(),
    })

    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/api/audio/dm-override/remove') && options?.method === 'POST') {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      if (url.endsWith('/api/audio/sessions/session-1/state') && !options?.method) {
        return new Response(JSON.stringify({ dmOverrides: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ message: 'Unexpected request' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <RoomSelector
        apiUrl="http://localhost:3000"
        token="jwt-token"
        sessionId={asUuid('session-1')}
        dmUserId={asUuid('user-1')}
        canManageRooms={true}
        broadcastModeEnabled={false}
        onToggleBroadcastMode={vi.fn(async () => {})}
        rooms={[
          {
            id: asUuid('room-main'),
            name: 'Main Table',
            type: RoomType.MAIN,
            memberCount: 2,
            participants: [
              {
                userId: asUuid('user-1'),
                username: 'Morgan',
                roleLabel: 'DM',
                presenceState: PresenceState.ONLINE,
              },
              {
                userId: asUuid('user-2'),
                username: 'Tara',
                roleLabel: 'PLAYER',
                presenceState: PresenceState.ONLINE,
                isMuted: true,
              },
            ],
          },
        ]}
        selectedRoomId={asUuid('room-main')}
        onSelectRoom={vi.fn()}
      />
    )

    fireEvent.contextMenu(getDragUserButton('Tara'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Unmute' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/audio/dm-override/remove',
        expect.objectContaining({ method: 'POST' })
      )
    })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/audio/sessions/session-1/state',
        expect.objectContaining({ headers: { Authorization: 'Bearer jwt-token' } })
      )
    })

    expect(
      getUserDMOverride(useStore.getState().dmOverrides, asUuid('user-2'), 'MUTE')
    ).toBeUndefined()
  })

  it('starts takeover from the player context menu and marks it active', async () => {
    useStore.getState().reset()

    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/api/dev/mock-players/takeover/start') && options?.method === 'POST') {
        return new Response(
          JSON.stringify({
            ok: true,
            sessionId: 'session-1',
            actorUserId: 'user-1',
            assumedUserId: 'user-2',
            startedAt: Date.now(),
            assumedDisplayName: 'Tara',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }

      if (url.includes('/api/dev/mock-players/takeover/status/')) {
        return new Response(
          JSON.stringify({
            sessionId: 'session-1',
            active: false,
            assumedUserId: null,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <RoomSelector
        apiUrl="http://localhost:3000"
        token="jwt-token"
        sessionId={asUuid('session-1')}
        dmUserId={asUuid('user-1')}
        canManageRooms={true}
        broadcastModeEnabled={false}
        onToggleBroadcastMode={vi.fn(async () => {})}
        rooms={[
          {
            id: asUuid('room-main'),
            name: 'Main Table',
            type: RoomType.MAIN,
            memberCount: 2,
            participants: [
              {
                userId: asUuid('user-1'),
                username: 'Morgan',
                roleLabel: 'DM',
                presenceState: PresenceState.ONLINE,
              },
              {
                userId: asUuid('user-2'),
                username: 'Tara',
                roleLabel: 'PLAYER',
                presenceState: PresenceState.ONLINE,
              },
            ],
          },
        ]}
        selectedRoomId={asUuid('room-main')}
        onSelectRoom={vi.fn()}
      />
    )

    fireEvent.contextMenu(getDragUserButton('Tara'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Take Over Player' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/dev/mock-players/takeover/start',
        expect.objectContaining({ method: 'POST' })
      )
    })

    expect(useStore.getState().mockTakeoverUserIdBySession['session-1']).toBe('user-2')

    fireEvent.contextMenu(getDragUserButton('Tara'))
    expect(screen.getByRole('menuitem', { name: 'Take Over Player (Active)' })).toBeTruthy()
  })

  it('keeps mute available and hides distance/condition in greenroom', () => {
    render(
      <RoomSelector
        apiUrl="http://localhost:3000"
        token="jwt-token"
        sessionId={asUuid('session-1')}
        dmUserId={asUuid('user-1')}
        canManageRooms={true}
        isGreenroom={true}
        broadcastModeEnabled={false}
        onToggleBroadcastMode={vi.fn(async () => {})}
        rooms={[
          {
            id: asUuid('room-main'),
            name: 'Greenroom',
            type: RoomType.MAIN,
            memberCount: 2,
            participants: [
              {
                userId: asUuid('user-1'),
                username: 'Morgan',
                roleLabel: 'DM',
                presenceState: PresenceState.ONLINE,
              },
              {
                userId: asUuid('user-2'),
                username: 'Tara',
                roleLabel: 'PLAYER',
                presenceState: PresenceState.ONLINE,
              },
            ],
          },
        ]}
        selectedRoomId={asUuid('room-main')}
        onSelectRoom={vi.fn()}
      />
    )

    fireEvent.contextMenu(screen.getByRole('button', { name: 'Tara' }))

    expect(screen.getByRole('menuitem', { name: 'Mute' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Distance' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Condition' })).toBeNull()
  })

  it('calls DEV mock reroll endpoint from Mock Testing panel and shows disabled state while loading', async () => {
    if (!import.meta.env.DEV) {
      return
    }

    useStore.getState().reset()

    let resolveReroll: (response: Response) => void = () => undefined
    const fetchMock = vi.fn((input: string | URL) => {
      const url = String(input)

      if (url.endsWith('/api/dev/mock-players/reroll')) {
        return new Promise<Response>((resolve) => {
          resolveReroll = resolve
        })
      }

      if (url.endsWith('/api/dev/mock-players/simulation/status/session-1')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              sessionId: 'session-1',
              config: {
                speakingSimulatorEnabled: true,
                chatSimulatorEnabled: false,
                disconnectSimulatorEnabled: false,
                playerCount: 8,
              },
              isRunning: true,
              activeMockCount: 8,
              speakingNow: [],
              uptime: 1,
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        )
      }

      return Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <RoomSelector
        apiUrl="http://localhost:3000"
        token="jwt-token"
        sessionId={asUuid('session-1')}
        dmUserId={asUuid('user-1')}
        canManageRooms={true}
        broadcastModeEnabled={false}
        onToggleBroadcastMode={vi.fn(async () => {})}
        rooms={[
          {
            id: asUuid('room-main'),
            name: 'Main Table',
            type: RoomType.MAIN,
            memberCount: 1,
            participants: [
              {
                userId: asUuid('user-1'),
                username: 'Morgan',
                roleLabel: 'DM',
                presenceState: PresenceState.ONLINE,
              },
            ],
          },
        ]}
        selectedRoomId={asUuid('room-main')}
        onSelectRoom={vi.fn()}
      />
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: /Configure mock testing|Mock takeover active — open controls to return/i,
      })
    )

    const shuffleButton = await screen.findByRole('button', { name: 'Reroll mock players' })
    expect(shuffleButton.hasAttribute('disabled')).toBe(false)

    fireEvent.click(shuffleButton)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/dev/mock-players/reroll',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ sessionId: 'session-1', newPlayerCount: 8 }),
        })
      )
    })

    expect(shuffleButton.hasAttribute('disabled')).toBe(true)

    resolveReroll(
      new Response(JSON.stringify({ ok: true, rerolledCount: 4 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    await waitFor(() => {
      expect(shuffleButton.hasAttribute('disabled')).toBe(false)
    })
  })

  it('returns to real user from Mock Testing panel when takeover is active', async () => {
    if (!import.meta.env.DEV) {
      return
    }

    useStore.getState().reset()
    useStore.getState().setMockTakeoverUserId(asUuid('session-1'), asUuid('user-2'))

    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/api/dev/mock-players/simulation/status/session-1') && !options?.method) {
        return new Response(
          JSON.stringify({
            sessionId: 'session-1',
            config: {
              speakingSimulatorEnabled: true,
              chatSimulatorEnabled: false,
              disconnectSimulatorEnabled: false,
              playerCount: 8,
            },
            isRunning: true,
            activeMockCount: 8,
            speakingNow: [],
            uptime: 1,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }

      if (url.endsWith('/api/dev/mock-players/takeover/stop') && options?.method === 'POST') {
        return new Response(JSON.stringify({ ok: true, cleared: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      if (url.includes('/api/dev/mock-players/takeover/status/')) {
        return new Response(
          JSON.stringify({
            sessionId: 'session-1',
            active: true,
            assumedUserId: 'user-2',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <RoomSelector
        apiUrl="http://localhost:3000"
        token="jwt-token"
        sessionId={asUuid('session-1')}
        dmUserId={asUuid('user-1')}
        canManageRooms={true}
        broadcastModeEnabled={false}
        onToggleBroadcastMode={vi.fn(async () => {})}
        rooms={[
          {
            id: asUuid('room-main'),
            name: 'Main Table',
            type: RoomType.MAIN,
            memberCount: 1,
            participants: [
              {
                userId: asUuid('user-1'),
                username: 'Morgan',
                roleLabel: 'DM',
                presenceState: PresenceState.ONLINE,
              },
            ],
          },
        ]}
        selectedRoomId={asUuid('room-main')}
        onSelectRoom={vi.fn()}
      />
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: /Configure mock testing|Mock takeover active — open controls to return/i,
      })
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Return to My User' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/dev/mock-players/takeover/stop',
        expect.objectContaining({ method: 'POST' })
      )
    })

    expect(useStore.getState().mockTakeoverUserIdBySession['session-1']).toBeNull()
  })
})
