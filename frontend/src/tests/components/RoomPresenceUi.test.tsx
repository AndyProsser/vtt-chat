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
  it('renders speaking, muted, and condition badges', () => {
    render(
      <AvatarOverlay
        username="Aria"
        roleLabel="PLAYER"
        presenceState={PresenceState.SPEAKING}
        isSpeaking
        isMuted
        condition="Silenced"
      />
    )

    expect(screen.getByText('Aria')).toBeTruthy()
    expect(screen.getByText('PLAYER')).toBeTruthy()
    expect(screen.getByText('SPEAKING')).toBeTruthy()
    expect(screen.getByText('Speaking')).toBeTruthy()
    expect(screen.getByText('Muted')).toBeTruthy()
    expect(screen.getByText('Silenced')).toBeTruthy()
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

    expect(screen.getByText('Tavern')).toBeTruthy()
    expect(screen.getByText('Whisper Booth')).toBeTruthy()
    expect(screen.getByText('Main Group')).toBeTruthy()
    expect(screen.getByText('Other Groups')).toBeTruthy()
    expect(screen.getByText('Morgan')).toBeTruthy()
    expect(screen.getByText('Tara')).toBeTruthy()
    expect(screen.getByText('Underwater')).toBeTruthy()

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
      expect(screen.getByText('In Jail')).toBeTruthy()
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
    const fetchMock = vi.fn(async () =>
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
})
