import { memo, useMemo, type ComponentProps } from 'react'
import { type Role } from '@shared'
import type { UUID } from '@shared'
import { AudioPanel } from '@/components/workspaces/session/audio/AudioPanel'
import { LeftRailPanel } from '@/components/workspaces/session/LeftRailPanel'
import { useStore } from '@/hooks/useStore'
import { getVisibleRoomsForSessionState } from '@/utils/session/workspaces'
import type { Room as RoomRecord, RoomUser as RoomMember } from '@/types/room'

const EMPTY_ROOMS_BY_ID = Object.freeze({}) as Record<UUID, RoomRecord>

type SessionWorkspaceLeftRailProps = {
  apiUrl: string
  token: string
  sessionId: UUID
  selectedCampaignName?: string
  selectedCampaignDescription?: string | null
  effectiveSessionRole: Role
  sessionState: ComponentProps<typeof LeftRailPanel>['sessionState']
  sessionName: string
  sessionCount: number
  connectedPlayers: number
  connectedSpectatorsCount: number
  dmUserId: UUID
  effectiveSessionUserId: UUID
  selectedRoomId: UUID | ''
  onSelectRoom: (roomId: UUID) => void
  onToggleBroadcastMode: ComponentProps<typeof LeftRailPanel>['onToggleBroadcastMode']
  dmAutoTargetOnFirstPlayerJoin: boolean
  sessionEndedAt?: number
  configuredCooldownDurationMs: number
  onOpenInfoPanel?: () => void
}

function SessionWorkspaceLeftRailComponent(props: SessionWorkspaceLeftRailProps) {
  const currentSessionRoomsById = useStore((state) => {
    const roomsBySession = state.rooms as Record<UUID, Record<UUID, RoomRecord>>
    return roomsBySession[props.sessionId] ?? EMPTY_ROOMS_BY_ID
  })
  const roomMembersByRoomId = useStore((state) => state.roomMembers) as Record<UUID, RoomMember[]>
  const roomEnvironmentNames = useStore((state) => state.roomEnvironmentNames)
  const dmOverrides = useStore((state) => state.dmOverrides)
  const broadcastModeEnabled = useStore((state) => state.broadcastModeEnabled)
  const currentConditionName = useStore((state) => state.currentCondition?.name)
  const visibleRooms = useMemo(
    () =>
      getVisibleRoomsForSessionState(Object.values(currentSessionRoomsById), props.sessionState),
    [currentSessionRoomsById, props.sessionState]
  )
  const rooms = useMemo(
    () =>
      visibleRooms.map((room) => ({
        id: room.id,
        name: room.name,
        type: room.type,
      })),
    [visibleRooms]
  )

  return (
    <div className="session-left-rail-stack" data-ui-component="SessionLeftRailStack">
      <LeftRailPanel
        onOpenInfoPanel={props.onOpenInfoPanel}
        apiUrl={props.apiUrl}
        token={props.token}
        sessionId={props.sessionId}
        campaignName={props.selectedCampaignName || 'Campaign'}
        campaignDescription={props.selectedCampaignDescription}
        role={props.effectiveSessionRole}
        sessionName={props.sessionName}
        sessionState={props.sessionState}
        sessionCount={props.sessionCount}
        connectedPlayersCount={props.connectedPlayers}
        connectedSpectatorsCount={props.connectedSpectatorsCount}
        dmUserId={props.dmUserId}
        currentUserId={props.effectiveSessionUserId}
        rooms={rooms}
        roomMembersByRoomId={roomMembersByRoomId}
        sessionEndedAt={props.sessionEndedAt}
        cooldownDurationMs={props.configuredCooldownDurationMs}
        selectedRoomId={props.selectedRoomId}
        onSelectRoom={props.onSelectRoom}
        broadcastModeEnabled={broadcastModeEnabled}
        onToggleBroadcastMode={props.onToggleBroadcastMode}
        dmAutoTargetOnFirstPlayerJoin={props.dmAutoTargetOnFirstPlayerJoin}
        dmOverrides={dmOverrides}
        currentConditionName={currentConditionName}
        roomEnvironmentNames={roomEnvironmentNames}
      />
      {props.selectedRoomId ? (
        <aside
          className="session-left-rail-card session-left-rail-card--audio"
          aria-label="Voice panel"
        >
          <AudioPanel
            sessionId={props.sessionId}
            roomId={props.selectedRoomId}
            role={props.effectiveSessionRole}
          />
        </aside>
      ) : null}
    </div>
  )
}

export const SessionWorkspaceLeftRail = memo(SessionWorkspaceLeftRailComponent)
