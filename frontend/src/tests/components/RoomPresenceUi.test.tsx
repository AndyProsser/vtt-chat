import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { PresenceState, RoomType } from '@shared'
import type { UUID } from '@shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AvatarOverlay } from '../../components/rooms/AvatarOverlay'
import { RoomSelector } from '../../components/rooms/RoomSelector'

const asUuid = (value: string) => value as UUID

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
        isSpeaking
        isMuted
      />
    )

    expect(screen.getByText('Aria')).toBeTruthy()
    expect(screen.getByText('PLAYER')).toBeTruthy()
    expect(screen.getByText('Wizard | Level 7 | Elf')).toBeTruthy()
    expect(screen.getByLabelText('Muted microphone')).toBeTruthy()
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
                isSpeaking: false,
              },
              {
                userId: asUuid('user-2'),
                username: 'Tara',
                roleLabel: 'PLAYER',
                presenceState: PresenceState.SPEAKING,
                isMuted: true,
                isSpeaking: true,
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

    expect(screen.getAllByRole('button', { name: /Change group environment/i }).length).toBe(2)
    expect(screen.getAllByText('Whisper Booth').length).toBeGreaterThan(0)
    expect(screen.getByText('Main Group')).toBeTruthy()
    expect(screen.getByText('Other Groups')).toBeTruthy()
    expect(screen.getByText('Morgan')).toBeTruthy()
    expect(screen.getByText('Tara')).toBeTruthy()
    expect(screen.getByText('Rogue | Level 5 | Halfling')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Select group Whisper Booth/i }))
    expect(onSelectRoom).toHaveBeenCalledWith(asUuid('room-2'))
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

  it('shows optimistic group immediately while create request is pending', async () => {
    let resolveFetch: ((value: Response) => void) | null = null
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
        onSelectRoom={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Create Group/i }))
    fireEvent.change(screen.getByPlaceholderText('Scouts'), { target: { value: 'In Jail' } })
    const createDialog = screen.getByRole('dialog', { name: /Create group/i })
    fireEvent.click(within(createDialog).getByRole('button', { name: /Create Group/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Select group In Jail/i })).toBeTruthy()
    })

    resolveFetch?.(
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
        'http://localhost:3000/api/v1/rooms',
        expect.objectContaining({ method: 'POST' })
      )
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

    fireEvent.click(screen.getByRole('button', { name: /Create Group/i }))
    fireEvent.change(screen.getByPlaceholderText('Scouts'), { target: { value: 'Scouts' } })
    const createDialog = screen.getByRole('dialog', { name: /Create group/i })
    fireEvent.click(within(createDialog).getByRole('button', { name: /Create Group/i }))

    await waitFor(() => {
      expect(screen.getAllByText('Only DM can create rooms').length).toBe(2)
    })
  })

  it('uses segmented buttons for create-group type selection', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            room: {
              id: 'room-private',
              name: 'Whisper Cell',
              type: RoomType.PRIVATE,
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

    fireEvent.click(screen.getByRole('button', { name: /Create Group/i }))
    const createDialog = screen.getByRole('dialog', { name: /Create group/i })
    fireEvent.change(screen.getByPlaceholderText('Scouts'), { target: { value: 'Whisper Cell' } })
    fireEvent.click(within(createDialog).getByRole('button', { name: 'Private' }))
    fireEvent.click(within(createDialog).getByRole('button', { name: /Create Group/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/rooms',
        expect.objectContaining({
          body: JSON.stringify({
            sessionId: 'session-1',
            name: 'Whisper Cell',
            type: RoomType.PRIVATE,
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

    fireEvent.click(screen.getByRole('button', { name: /Create Group/i }))
    expect(screen.getByRole('dialog', { name: /Create group/i })).toBeTruthy()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: /Create group/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Create Group/i }))
    expect(screen.getByRole('dialog', { name: /Create group/i })).toBeTruthy()

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

  it('closes an empty non-main group via API and removes it from the list', async () => {
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/api/v1/rooms/room-private') && options?.method === 'DELETE') {
        return new Response(JSON.stringify({ ok: true, deletedRoomId: 'room-private' }), {
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
        onSelectRoom={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Close group Whisper Booth/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/rooms/room-private',
        expect.objectContaining({ method: 'DELETE' })
      )
    })

    await waitFor(() => {
      expect(screen.queryByText('Whisper Booth')).toBeNull()
    })
  })

  it('shows close-group API error and keeps group visible when request fails', async () => {
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/api/v1/rooms/room-private') && options?.method === 'DELETE') {
        return new Response(JSON.stringify({ message: 'Failed to close group' }), {
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
            memberCount: 0,
            participants: [],
          },
        ]}
        selectedRoomId={asUuid('room-main')}
        onSelectRoom={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Close group Whisper Booth/i }))

    await waitFor(() => {
      expect(screen.getByText('Failed to close group')).toBeTruthy()
    })

    expect(screen.getAllByText('Whisper Booth').length).toBeGreaterThan(0)
  })

  it('disables create-group controls in greenroom and shows DM in participant list', () => {
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
        ]}
        selectedRoomId={asUuid('room-main')}
        onSelectRoom={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: /Create Group/i }).hasAttribute('disabled')).toBe(
      true
    )
    expect(screen.queryByRole('button', { name: /Create new group/i })).toBeNull()
    expect(screen.queryByLabelText('Dungeon Master voice controls')).toBeNull()
    expect(screen.queryByRole('button', { name: /Drag Tara/i })).toBeNull()
    expect(screen.getByRole('button', { name: 'Tara' })).toBeTruthy()
    expect(screen.getByText('Morgan')).toBeTruthy()
    expect(screen.getByText('Tara')).toBeTruthy()
  })

  it('allows closing a non-main room even when members are present', async () => {
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/api/v1/rooms/room-private') && options?.method === 'DELETE') {
        return new Response(JSON.stringify({ ok: true, deletedRoomId: 'room-private' }), {
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

    const closeButton = screen.getByRole('button', { name: /Close group Whisper Booth/i })
    expect(closeButton.hasAttribute('disabled')).toBe(false)

    fireEvent.click(closeButton)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/rooms/room-private',
        expect.objectContaining({ method: 'DELETE' })
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

  it('opens radial menu and moves a participant to another room', async () => {
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/api/v1/rooms/room-target/members/move') && options?.method === 'POST') {
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

    fireEvent.contextMenu(screen.getByRole('button', { name: /Drag Tara/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move' }))
    fireEvent.click(screen.getByRole('button', { name: 'Whisper Booth' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/rooms/room-target/members/move',
        expect.objectContaining({ method: 'POST' })
      )
    })
  })
})
