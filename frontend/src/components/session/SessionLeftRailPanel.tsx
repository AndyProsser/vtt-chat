import type { Role, SessionState, UUID } from '@shared'
import { PresenceState, RoomType } from '@shared'
import type { AudioDMOverride } from '@/types/audio'
import type { RoomUser } from '@/types/room'
import { useStore } from '@/state/store'
import { isGreenRoomName, ROOM_ROLE_LABELS } from '../../constants/roomPresence.constants'
import { LeftRailSummary } from './LeftRailSummary'
import { RoomSelector } from '../rooms/RoomSelector'

interface SessionLeftRailPanelProps {
  apiUrl: string
  token: string
  sessionId: UUID
  campaignName: string
  campaignDescription?: string | null
  role: Role
  sessionName: string
  sessionState: SessionState
  sessionCount: number
  connectedPlayersCount: number
  connectedSpectatorsCount?: number
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
  roomEnvironmentNames?: Record<UUID, string>
}

export function SessionLeftRailPanel({
  apiUrl,
  token,
  sessionId,
  campaignName,
  campaignDescription,
  role,
  sessionName,
  sessionState,
  sessionCount,
  connectedPlayersCount,
  connectedSpectatorsCount,
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
  roomEnvironmentNames,
}: SessionLeftRailPanelProps) {
  const device = useStore((state) => state.device)
  const pttActive = useStore((state) => state.pttActive)

  const isGreenroom = sessionState === 'IDLE' || sessionState === 'ENDED'
  const greenroomHeaderCopy = isGreenroom && role !== 'DM' ? 'Current Group Only' : undefined

  const localUserMuted = device.pttEnabled ? !pttActive : !device.microphoneOn

  const hasNamedGreenRoom = rooms.some((room) => isGreenRoomName(room.name))

  const visibleRooms = [...rooms]
    .sort((left, right) => {
      if (left.type === RoomType.MAIN && right.type !== RoomType.MAIN) return -1
      if (right.type === RoomType.MAIN && left.type !== RoomType.MAIN) return 1
      return left.name.localeCompare(right.name)
    })
    .filter((room) => {
      if (isGreenroom) {
        return hasNamedGreenRoom ? isGreenRoomName(room.name) : room.id === selectedRoomId
      }

      if (role === 'DM') {
        return true
      }

      const memberCount = (roomMembersByRoomId[room.id] || []).length
      return room.type === RoomType.MAIN || memberCount > 0 || room.id === selectedRoomId
    })

  return (
    <>
      <section
        className="session-left-rail-card session-left-rail-card--info"
        data-testid="session-left-rail"
      >
        <LeftRailSummary
          campaignName={campaignName}
          campaignDescription={campaignDescription}
          sessionName={sessionName}
          sessionCount={sessionCount}
          connectedPlayersCount={connectedPlayersCount}
          connectedSpectatorsCount={connectedSpectatorsCount}
        />
      </section>

      <section
        className="session-left-rail-card session-left-rail-card--channels"
        aria-label="Voice groups"
      >
        <RoomSelector
          apiUrl={apiUrl}
          token={token}
          sessionId={sessionId}
          dmUserId={dmUserId}
          isGreenroom={isGreenroom}
          headerModeCopy={greenroomHeaderCopy}
          canManageRooms={role === 'DM'}
          broadcastModeEnabled={broadcastModeEnabled}
          onToggleBroadcastMode={onToggleBroadcastMode}
          rooms={visibleRooms.map((room) => ({
            id: room.id,
            name: room.name,
            type: room.type,
            memberCount: (roomMembersByRoomId[room.id] || []).length,
            environmentName: isGreenroom ? undefined : roomEnvironmentNames?.[room.id],
            participants: (roomMembersByRoomId[room.id] || []).map((member) => {
              const dmOverride = dmOverrides.get(member.userId)
              const overrideMuted = !isGreenroom && dmOverride?.overrideType === 'MUTE'
              const isSelf = member.userId === currentUserId
              const overrideCondition =
                dmOverride?.overrideType === 'CONDITION'
                  ? String(dmOverride.parameters?.conditionName || '')
                  : undefined

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
                roleLabel:
                  member.userId === dmUserId ? ROOM_ROLE_LABELS.dm : ROOM_ROLE_LABELS.player,
                presenceState: member.presenceState,
                isMuted: isSelf ? localUserMuted || overrideMuted : overrideMuted,
                isSpeaking: member.presenceState === PresenceState.SPEAKING,
                condition: isGreenroom
                  ? undefined
                  : overrideCondition ||
                    (currentConditionName && member.userId === currentUserId
                      ? currentConditionName
                      : undefined),
              }
            }),
          }))}
          selectedRoomId={selectedRoomId}
          onSelectRoom={onSelectRoom}
        />
      </section>
    </>
  )
}
