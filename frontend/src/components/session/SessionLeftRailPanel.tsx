import type { Role, SessionState, UUID } from '@shared'
import { PresenceState, RoomType } from '@shared'
import type { AudioDMOverride } from '@/types/audio'
import type { RoomUser } from '@/types/room'
import { LeftRailSummary } from './LeftRailSummary'
import { RoomSelector } from '../rooms/RoomSelector'

interface SessionLeftRailPanelProps {
  apiUrl: string
  token: string
  sessionId: UUID
  role: Role
  username: string
  sessionName: string
  sessionState: SessionState
  sessionCount: number
  roomCount: number
  presenceCount: number
  dmUserId: UUID
  currentUserId: UUID
  rooms: Array<{ id: UUID; name: string; type: RoomType }>
  roomMembersByRoomId: Record<UUID, RoomUser[]>
  selectedRoomId: UUID | ''
  onSelectRoom: (roomId: UUID) => void
  broadcastModeEnabled: boolean
  onToggleBroadcastMode: (enabled: boolean) => Promise<void>
  dmOverrides: Map<UUID, AudioDMOverride>
  currentConditionName?: string
  roomVoiceStatus?: 'connected' | 'connecting' | 'disconnected'
}

export function SessionLeftRailPanel({
  apiUrl,
  token,
  sessionId,
  role,
  username,
  sessionName,
  sessionState,
  sessionCount,
  roomCount,
  presenceCount,
  dmUserId,
  currentUserId,
  rooms,
  roomMembersByRoomId,
  selectedRoomId,
  onSelectRoom,
  broadcastModeEnabled,
  onToggleBroadcastMode,
  dmOverrides,
  currentConditionName,
  roomVoiceStatus,
}: SessionLeftRailPanelProps) {
  const isGreenroom = sessionState === 'IDLE'
  const greenroomHeaderCopy = isGreenroom && role !== 'DM' ? 'Current Channel Only' : undefined

  const visibleRooms = [...rooms]
    .sort((left, right) => {
      if (left.type === RoomType.MAIN && right.type !== RoomType.MAIN) return -1
      if (right.type === RoomType.MAIN && left.type !== RoomType.MAIN) return 1
      return left.name.localeCompare(right.name)
    })
    .filter((room) => {
      if (role === 'DM') {
        return true
      }

      if (isGreenroom) {
        return room.id === selectedRoomId
      }

      const memberCount = (roomMembersByRoomId[room.id] || []).length
      return room.type === RoomType.MAIN || memberCount > 0 || room.id === selectedRoomId
    })

  return (
    <div className="session-left-rail" data-testid="session-left-rail">
      <LeftRailSummary
        role={role}
        username={username}
        sessionName={sessionName}
        sessionState={sessionState}
        sessionCount={sessionCount}
        roomCount={roomCount}
        presenceCount={presenceCount}
      />
      <RoomSelector
        apiUrl={apiUrl}
        token={token}
        sessionId={sessionId}
        dmUserId={dmUserId}
        headerModeCopy={greenroomHeaderCopy}
        canManageRooms={role === 'DM'}
        broadcastModeEnabled={broadcastModeEnabled}
        voiceConnectionStatus={roomVoiceStatus}
        onToggleBroadcastMode={onToggleBroadcastMode}
        rooms={visibleRooms.map((room) => ({
          id: room.id,
          name: room.name,
          type: room.type,
          memberCount: (roomMembersByRoomId[room.id] || []).length,
          participants: (roomMembersByRoomId[room.id] || []).map((member) => {
            const dmOverride = dmOverrides.get(member.userId)

            return {
              userId: member.userId,
              username: member.username || member.userId,
              avatarUrl: member.avatarUrl,
              characterName: member.characterName,
              playerName: member.playerName,
              characterClass: member.characterClass,
              characterSubclass: member.characterSubclass,
              characterRace: member.characterRace,
              level: member.level,
              characterStats: member.characterStats,
              roleLabel: member.userId === dmUserId ? ('DM' as const) : ('PLAYER' as const),
              presenceState: member.presenceState,
              isMuted: dmOverride?.overrideType === 'MUTE',
              isSpeaking: member.presenceState === PresenceState.SPEAKING,
              condition:
                currentConditionName && member.userId === currentUserId
                  ? currentConditionName
                  : undefined,
            }
          }),
        }))}
        selectedRoomId={selectedRoomId}
        onSelectRoom={onSelectRoom}
      />
    </div>
  )
}
