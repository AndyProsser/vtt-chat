import { useEffect, useMemo, useRef } from 'react'
import type { Role, SessionState, UUID } from '@shared'
import { PresenceState, RoomType } from '@shared'
import { isGreenroomSessionState } from '@shared'
import type { RoomUser } from '@/types/room'
import { useStore } from '@/state/store'
import { getUserDMOverride, type AudioDMOverridesByUser } from '@/utils/audioOverrides'
import { isGreenRoomName, ROOM_ROLE_LABELS } from '../../constants/roomPresence.constants'
import { LeftRailSummary } from './LeftRailSummary'
import { GroupsPanel } from '../rooms/GroupsPanel'

// Stable empty object to avoid creating new references on every render
const EMPTY_USER_MUTE_MAP: Record<UUID, boolean> = {}
const DEV_MOCK_USERNAME_PREFIX = 'dev_mock_'

function pickRandomUsers(userIds: UUID[], maxCount: number): UUID[] {
  if (userIds.length === 0 || maxCount <= 0) {
    return []
  }

  const shuffled = [...userIds]
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = shuffled[i]
    shuffled[i] = shuffled[j]
    shuffled[j] = tmp
  }

  return shuffled.slice(0, Math.min(maxCount, shuffled.length))
}

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
  const setLiveKitSpeakingUsers = useStore((state) => state.setLiveKitSpeakingUsers)
  const userMuteState = useStore((state) => state.userMuteState[sessionId] ?? EMPTY_USER_MUTE_MAP)
  const previousMockSpeakingKeyRef = useRef<string>('')

  const isGreenroom = isGreenroomSessionState(sessionState)

  const mockUserIds = useMemo(() => {
    const ids = new Set<UUID>()

    for (const members of Object.values(roomMembersByRoomId)) {
      for (const member of members) {
        if (member.username?.startsWith(DEV_MOCK_USERNAME_PREFIX)) {
          ids.add(member.userId)
        }
      }
    }

    return Array.from(ids)
  }, [roomMembersByRoomId])

  useEffect(() => {
    const simulateMockSpeakingInDev =
      import.meta.env.DEV && import.meta.env.VITE_DEV_SIMULATE_MOCK_SPEAKING !== '0'

    if (!simulateMockSpeakingInDev || mockUserIds.length === 0) {
      return
    }

    const mockUserSet = new Set(mockUserIds)

    const applyTick = () => {
      const currentSpeakingBySession = useStore.getState().livekitSpeakingBySession[sessionId] || {}
      const nonMockSpeaking = Object.keys(currentSpeakingBySession).filter(
        (userId) => !mockUserSet.has(userId as UUID)
      ) as UUID[]

      const eligibleMocks = mockUserIds.filter((userId) => {
        const userMuted = userMuteState[userId] ?? false
        const dmMuted = !isGreenroom && Boolean(getUserDMOverride(dmOverrides, userId, 'MUTE'))
        return !userMuted && !dmMuted
      })

      const shouldSpeakThisTick = Math.random() > 0.35
      const randomSpeakerCount = shouldSpeakThisTick
        ? Math.max(1, Math.min(3, Math.floor(Math.random() * 3) + 1))
        : 0

      const randomMockSpeaking = pickRandomUsers(eligibleMocks, randomSpeakerCount)
      const nextSpeaking = [...nonMockSpeaking, ...randomMockSpeaking]
      const nextMockKey = randomMockSpeaking.slice().sort().join(',')

      if (nextMockKey === previousMockSpeakingKeyRef.current) {
        return
      }

      previousMockSpeakingKeyRef.current = nextMockKey
      setLiveKitSpeakingUsers(sessionId, nextSpeaking)
    }

    applyTick()
    const intervalId = window.setInterval(applyTick, 1400)

    return () => {
      window.clearInterval(intervalId)
      previousMockSpeakingKeyRef.current = ''
    }
  }, [dmOverrides, isGreenroom, mockUserIds, sessionId, setLiveKitSpeakingUsers, userMuteState])

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
        aria-label="Groups"
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
