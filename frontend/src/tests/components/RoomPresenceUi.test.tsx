import { fireEvent, render, screen } from '@testing-library/react'
import { PresenceState, RoomType } from '@shared'
import type { UUID } from '@shared'
import { describe, expect, it, vi } from 'vitest'
import { AvatarOverlay } from '../../components/rooms/AvatarOverlay'
import { RoomSelector } from '../../components/rooms/RoomSelector'

const asUuid = (value: string) => value as UUID

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
    expect(screen.getByText('Morgan')).toBeTruthy()
    expect(screen.getByText('Tara')).toBeTruthy()
    expect(screen.getByText('Underwater')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Select room Whisper Booth/i }))
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

    expect(screen.getByText('No rooms available.')).toBeTruthy()
    expect(screen.queryByText('No members in this room.')).toBeNull()
  })
})
