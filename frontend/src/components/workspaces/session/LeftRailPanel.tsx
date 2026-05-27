import { useEffect, useMemo, useState } from 'react'
import type { Role, SessionState, UUID } from '@shared'
import { PresenceState, RoomType } from '@shared'
import { isGreenroomSessionState } from '@shared'
import type { RoomUser } from '@/types/room'
import { useStore } from '@/state/store'
import { useShallow } from 'zustand/shallow'
import { getUserDMOverride, type AudioDMOverridesByUser } from '@/utils/audioOverrides'
import { isGreenRoomName, ROOM_ROLE_LABELS } from '@/constants/roomPresence.constants'
import { LeftRailSummary } from './LeftRailSummary'
import { GroupsPanel } from '@/components/workspaces/session/rooms/GroupsPanel'

// Stable empty objects to avoid creating new references on every render
const EMPTY_USER_MUTE_MAP: Record<UUID, boolean> = {}
const EMPTY_SPEAKING_MAP: Record<UUID, true> = {}
const EMPTY_ROOM_MEMBERS: RoomUser[] = []

interface LeftRailPanelProps {
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
  sessionEndedAt?: number
  cooldownDurationMs?: number
  selectedRoomId: UUID | ''
  onSelectRoom: (roomId: UUID) => void
  broadcastModeEnabled: boolean
  onToggleBroadcastMode: (enabled: boolean) => Promise<void>
  dmAutoTargetOnFirstPlayerJoin: boolean
  dmOverrides: AudioDMOverridesByUser
  currentConditionName?: string
  roomEnvironmentNames?: Record<UUID, string>
  onOpenInfoPanel?: () => void
}

export function LeftRailPanel({
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
  sessionEndedAt,
  cooldownDurationMs,
  selectedRoomId,
  onSelectRoom,
  broadcastModeEnabled,
  onToggleBroadcastMode,
  dmAutoTargetOnFirstPlayerJoin,
  dmOverrides,
  currentConditionName,
  roomEnvironmentNames,
  onOpenInfoPanel,
}: LeftRailPanelProps) {
  const device = useStore((state) => state.device)
  const pttActive = useStore((state) => state.pttActive)
  // Unified speaking map: merges WS-presence (mock) speakers and LiveKit real speakers.
  // useShallow provides stable output — only triggers re-render when actual speaker set changes.
  const allSpeakingUsers = useStore(
    useShallow((state) => ({
      ...(state.presenceLkSpeakingBySession[sessionId] ?? EMPTY_SPEAKING_MAP),
      ...(state.presenceSpeakingBySession[sessionId] ?? EMPTY_SPEAKING_MAP),
    }))
  )
  const userMuteState = useStore((state) => state.userMuteState[sessionId] ?? EMPTY_USER_MUTE_MAP)

  const isGreenroom = isGreenroomSessionState(sessionState)
  const [cooldownNowMs, setCooldownNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (sessionState !== 'COOLDOWN') {
      return
    }

    const intervalId = window.setInterval(() => {
      setCooldownNowMs(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [sessionState])

  const cooldownWindowMs = Number.isFinite(cooldownDurationMs) ? Number(cooldownDurationMs) : 0
  const isEndedCooldownActive = useMemo(() => {
    if (sessionState !== 'COOLDOWN') {
      return false
    }

    const endedAtMs = Number.isFinite(sessionEndedAt) ? Number(sessionEndedAt) : NaN
    if (!Number.isFinite(endedAtMs) || cooldownWindowMs <= 0) {
      return true
    }

    return cooldownNowMs < endedAtMs + cooldownWindowMs
  }, [cooldownNowMs, cooldownWindowMs, sessionEndedAt, sessionState])

  const greenroomHeaderCopy = isGreenroom && role !== 'DM' ? 'Current Group Only' : undefined

  const localUserMuted = device.pttEnabled ? !pttActive : !device.microphoneOn

  // Include current user in speaking list if they're transmitting audio
  // LiveKit's activeSpeakers might not include the local participant (publisher),
  // so we detect this locally from whether the user has their mic on with active VAD.
  const isCurrentUserSpeaking = !localUserMuted && device.isSpeaking

  const allSpeakingUsersWithLocal = useMemo(() => {
    const speaking: Record<UUID, true> = { ...allSpeakingUsers }
    if (isCurrentUserSpeaking) {
      speaking[currentUserId] = true
    } else {
      delete speaking[currentUserId]
    }
    return speaking
  }, [allSpeakingUsers, isCurrentUserSpeaking, currentUserId])

  const hasNamedGreenRoom = rooms.some((room) => isGreenRoomName(room.name))

  const visibleRooms = useMemo(
    () =>
      [...rooms]
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
          const memberCount = (roomMembersByRoomId[room.id] || EMPTY_ROOM_MEMBERS).length
          return room.type === RoomType.MAIN || memberCount > 0 || room.id === selectedRoomId
        }),
    [hasNamedGreenRoom, isGreenroom, role, roomMembersByRoomId, rooms, selectedRoomId]
  )

  const groupPanelRooms = useMemo(() => {
    return visibleRooms.map((room) => ({
      id: room.id,
      name: room.name,
      type: room.type,
      memberCount: (roomMembersByRoomId[room.id] || EMPTY_ROOM_MEMBERS).length,
      environmentName: roomEnvironmentNames?.[room.id],
      participants: (roomMembersByRoomId[room.id] || EMPTY_ROOM_MEMBERS)
        .map((member) => {
          const isSpectator = member.role === 'SPECTATOR'
          const canShowSpectatorInRoom =
            isGreenRoomName(room.name) && sessionState === 'COOLDOWN' && isEndedCooldownActive

          if (isSpectator && !canShowSpectatorInRoom) {
            return null
          }

          const isSelf = member.userId === currentUserId
          const muteOverride = getUserDMOverride(dmOverrides, member.userId, 'MUTE')
          const distanceOverride = getUserDMOverride(dmOverrides, member.userId, 'DISTANCE')
          const conditionOverride =
            getUserDMOverride(dmOverrides, member.userId, 'CONDITION') ||
            getUserDMOverride(dmOverrides, member.userId, 'FILTER')
          const overrideMuted = Boolean(muteOverride)
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

          const userOwnMuted = userMuteState[member.userId] ?? false
          const dmMuted = overrideMuted
          const isMutedCombined = userOwnMuted || dmMuted
          const isActivelySpeaking =
            room.type === RoomType.PRIVATE
              ? false
              : Boolean(allSpeakingUsersWithLocal[member.userId]) && !isMutedCombined

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
              member.userId === dmUserId
                ? ROOM_ROLE_LABELS.dm
                : member.role === 'SPECTATOR'
                  ? ROOM_ROLE_LABELS.spectator
                  : ROOM_ROLE_LABELS.player,
            presenceState: member.presenceState,
            ghost: member.ghost,
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
        })
        .filter((participant): participant is NonNullable<typeof participant> =>
          Boolean(participant)
        ),
    }))
  }, [
    allSpeakingUsersWithLocal,
    currentConditionName,
    currentUserId,
    dmOverrides,
    dmUserId,
    isEndedCooldownActive,
    isGreenroom,
    localUserMuted,
    roomEnvironmentNames,
    roomMembersByRoomId,
    sessionState,
    userMuteState,
    visibleRooms,
  ])

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
          onOpenInfoPanel={onOpenInfoPanel}
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
          rooms={groupPanelRooms}
          selectedRoomId={selectedRoomId}
          onSelectRoom={onSelectRoom}
        />
      </section>
    </>
  )
}
