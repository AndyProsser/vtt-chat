import type { ComponentProps } from 'react'
import { type Role } from '@shared'
import type { UUID } from '@shared'
import { AudioPanel } from '@/components/workspaces/session/audio/AudioPanel'
import { LeftRailPanel } from '@/components/workspaces/session/LeftRailPanel'
import type { Room as RoomRecord, RoomUser as RoomMember } from '@/types/room'

type SessionWorkspaceLeftRailProps = {
  apiUrl: string
  token: string
  sessionId: UUID
  selectedCampaignName?: string
  selectedCampaignDescription?: string
  effectiveSessionRole: Role
  sessionState: string
  sessionName: string
  sessionCount: number
  connectedPlayers: number
  connectedSpectatorsCount: number
  dmUserId: UUID
  effectiveSessionUserId: UUID
  visibleRooms: RoomRecord[]
  roomMembersByRoomId: Record<UUID, RoomMember[]>
  selectedRoomId: UUID | ''
  onSelectRoom: (roomId: UUID) => void
  broadcastModeEnabled: boolean
  onToggleBroadcastMode: ComponentProps<typeof LeftRailPanel>['onToggleBroadcastMode']
  dmAutoTargetOnFirstPlayerJoin: boolean
  dmOverrides: {
    userId: UUID
    overrideType: 'MUTE' | 'UNMUTE' | 'GAIN' | 'GATE' | 'FILTER' | 'CONDITION' | 'VOICE_OF_GOD'
    parameters?: Record<string, unknown>
    appliedAt: number
  }[]
  currentConditionName?: string
  roomEnvironmentNames: Record<UUID, string>
  sessionEndedAt?: number
  configuredCooldownDurationMs: number
}

export function SessionWorkspaceLeftRail(props: SessionWorkspaceLeftRailProps) {
  return (
    <div className="session-left-rail-stack" data-ui-component="SessionLeftRailStack">
      <LeftRailPanel
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
        rooms={props.visibleRooms.map((room) => ({
          id: room.id,
          name: room.name,
          type: room.type,
        }))}
        roomMembersByRoomId={props.roomMembersByRoomId}
        sessionEndedAt={props.sessionEndedAt}
        cooldownDurationMs={props.configuredCooldownDurationMs}
        selectedRoomId={props.selectedRoomId}
        onSelectRoom={props.onSelectRoom}
        broadcastModeEnabled={props.broadcastModeEnabled}
        onToggleBroadcastMode={props.onToggleBroadcastMode}
        dmAutoTargetOnFirstPlayerJoin={props.dmAutoTargetOnFirstPlayerJoin}
        dmOverrides={props.dmOverrides}
        currentConditionName={props.currentConditionName}
        roomEnvironmentNames={props.roomEnvironmentNames}
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
