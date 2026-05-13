import type { Role, SessionState, UUID } from '@shared'
import { PresenceState, RoomType } from '@shared'
import { isGreenroomSessionState } from '@shared'
import type { RoomUser } from '@/types/room'
import { useStore } from '@/state/store'
import { getUserDMOverride, type AudioDMOverridesByUser } from '@/utils/audioOverrides'
import { isGreenRoomName, ROOM_ROLE_LABELS } from '../../constants/roomPresence.constants'
import { LeftRailSummary } from './LeftRailSummary'
import { GroupsPanel } from '../rooms/GroupsPanel'

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
  dmAutoTargetOnFirstPlayerJoin: boolean
  dmOverrides: AudioDMOverridesByUser
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
  dmAutoTargetOnFirstPlayerJoin,
  dmOverrides,
  currentConditionName,
  roomEnvironmentNames,
}: SessionLeftRailPanelProps) {
  const device = useStore((state) => state.device)
  const pttActive = useStore((state) => state.pttActive)
  const liveKitSpeakingUsers = useStore((state) => state.livekitSpeakingBySession[sessionId])
  const userMuteState = useStore((state) => state.userMuteState[sessionId] || {})

  const isGreenroom = isGreenroomSessionState(sessionState)
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
        // DM can see all rooms in greenroom for management
        if (role === 'DM') {
          return true
        }
        // Players see only the green room
        return hasNamedGreenRoom ? isGreenRoomName(room.name) : room.id === selectedRoomId
      }

      if (role === 'DM') {
        return true
      }

      // Players see MAIN room always; other rooms only when they have members
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
        <GroupsPanel
          apiUrl={apiUrl}
          token={token}
          sessionId={sessionId}
          dmUserId={dmUserId}
          isGreenroom={isGreenroom}
          headerModeCopy={greenroomHeaderCopy}
          canManageRooms={role === 'DM'}
          broadcastModeEnabled={broadcastModeEnabled}
          onToggleBroadcastMode={onToggleBroadcastMode}
          dmAutoTargetOnFirstPlayerJoin={dmAutoTargetOnFirstPlayerJoin}
          rooms={visibleRooms.map((room) => ({
            id: room.id,
            name: room.name,
            type: room.type,
            memberCount: (roomMembersByRoomId[room.id] || []).length,
            environmentName: roomEnvironmentNames?.[room.id],
            participants: (roomMembersByRoomId[room.id] || []).map((member) => {
              const isSelf = member.userId === currentUserId
              const muteOverride = getUserDMOverride(dmOverrides, member.userId, 'MUTE')
              const distanceOverride = getUserDMOverride(dmOverrides, member.userId, 'DISTANCE')
              const conditionOverride =
                getUserDMOverride(dmOverrides, member.userId, 'CONDITION') ||
                getUserDMOverride(dmOverrides, member.userId, 'FILTER')
              const overrideMuted = !isGreenroom && Boolean(muteOverride)
              const overrideCondition =
                typeof conditionOverride?.parameters?.conditionName === 'string'
                  ? String(conditionOverride.parameters.conditionName)
                  : typeof conditionOverride?.parameters?.presetName === 'string'
                    ? String(conditionOverride.parameters.presetName)
                    : undefined
              const overrideDistance =
                typeof distanceOverride?.parameters?.presetName === 'string'
                  ? String(distanceOverride.parameters.presetName)
                  : undefined

              // Combine mute states: user can be muted by themselves OR by the DM
              const userOwnMuted = userMuteState[member.userId] ?? false
              const dmMuted = overrideMuted
              const isMutedCombined = userOwnMuted || dmMuted

              // Speaking indicator: only show as speaking if NOT muted, AND (LiveKit says speaking OR presence says speaking)
              const isActivelySpeaking =
                room.type === RoomType.PRIVATE
                  ? false
                  : (Boolean(liveKitSpeakingUsers?.[member.userId]) ||
                      member.presenceState === PresenceState.SPEAKING) &&
                    !isMutedCombined

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
                isMuted: isSelf ? localUserMuted || isMutedCombined : isMutedCombined,
                isSpeaking: isActivelySpeaking,
                distanceLabel: isGreenroom ? undefined : overrideDistance,
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
