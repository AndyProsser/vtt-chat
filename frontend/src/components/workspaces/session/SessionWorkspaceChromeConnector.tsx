import { memo, useMemo } from 'react'
import type { ComponentProps } from 'react'
import { RoomType, type UUID } from '@shared'
import { useStore } from '@/hooks/useStore'
import { useWorkspacesAudioProjection } from '@/hooks/session/useWorkspacesAudioProjection'
import { useWorkspacesDerivedState } from '@/hooks/session/useWorkspacesDerivedState'
import { useWorkspacesGreenroomCleanup } from '@/hooks/session/useWorkspacesGreenroomCleanup'
import type { RightRailTab } from '@/types/ui'
import { isJournalNote } from '@/utils/notesPanel'
import { SessionWorkspace } from '@/components/workspaces/SessionWorkspace'
import type { Session as SessionRecord } from '@/types/session'
import type { Room as RoomRecord, SessionPresence as PresenceRecord } from '@/types/room'
import type { CampaignSummary } from '@/types/session/campaign'
import type { ApiSessionStats } from '@/types/session/workspaces'

type SessionWorkspaceProps = ComponentProps<typeof SessionWorkspace>

type SessionWorkspaceChromeConnectorProps = {
  baseProps: SessionWorkspaceProps
  campaigns: CampaignSummary[]
  selectedCampaignId: UUID | ''
  settingsCampaignSessions: SessionRecord[]
  settingsReferenceSessionId: UUID | ''
  settingsPostSessionChatDurationMinutes: number
  cooldownExtensionCounts: Record<UUID, number>
  user: {
    id: UUID
    username: string
    role: SessionWorkspaceProps['effectiveSessionRole']
    authType?: 'FULL' | 'GUEST'
  }
}

const EMPTY_NOTES_BY_ID = Object.freeze({}) as Record<
  UUID,
  { title: string; tags?: string[] | null }
>

const EMPTY_PAUSE_STATS: SessionWorkspaceProps['currentPauseStats'] = {
  cumulativePauseMs: 0,
  pauseCount: 0,
  pauseStartedAt: undefined,
}

const EMPTY_RIGHT_RAIL_INDICATORS = Object.freeze({
  notes: 0,
  journal: 0,
  history: 0,
}) as Partial<Record<RightRailTab, number>>

const EMPTY_ROOMS_BY_ID = Object.freeze({}) as Record<UUID, RoomRecord>
const EMPTY_PRESENCE_BY_USER = Object.freeze({}) as Record<UUID, PresenceRecord>
const EMPTY_SESSION_STATS: ApiSessionStats | undefined = undefined

/**
 * Isolates high-churn session workspace slices so WorkspaceInitialization doesn't
 * subscribe to note/override/pause updates that only affect SessionWorkspace.
 */
export const SessionWorkspaceChromeConnector = memo(
  function SessionWorkspaceChromeConnector({
    baseProps,
    campaigns,
    selectedCampaignId,
    settingsCampaignSessions,
    settingsReferenceSessionId,
    settingsPostSessionChatDurationMinutes,
    cooldownExtensionCounts,
    user,
  }: SessionWorkspaceChromeConnectorProps) {
    const currentSessionRoomsById = useStore((state) => {
      if (!state.currentSessionId) {
        return EMPTY_ROOMS_BY_ID
      }

      const roomsBySession = state.rooms as Record<UUID, Record<UUID, RoomRecord>>
      return roomsBySession[state.currentSessionId] ?? EMPTY_ROOMS_BY_ID
    })
    const currentSessionPresenceByUser = useStore((state) => {
      if (!state.currentSessionId) {
        return EMPTY_PRESENCE_BY_USER
      }

      const presenceBySession = state.sessionPresence as Record<UUID, Record<UUID, PresenceRecord>>
      return presenceBySession[state.currentSessionId] ?? EMPTY_PRESENCE_BY_USER
    })
    const currentSessionStats = useStore((state) => {
      if (!state.currentSessionId) {
        return EMPTY_SESSION_STATS
      }

      const statsBySession = state.sessionStatsBySessionId as Record<UUID, ApiSessionStats>
      return statsBySession[state.currentSessionId]
    })
    const currentEnvironment = useStore((state) => state.currentEnvironment)
    const roomEnvironmentNames = useStore((state) => state.roomEnvironmentNames)
    const currentPauseStats = useStore((state) => {
      if (!state.currentSessionId) {
        return EMPTY_PAUSE_STATS
      }

      return state.pauseStats[state.currentSessionId] ?? EMPTY_PAUSE_STATS
    })
    const setPrivateRoomCleanMode = useStore((state) => state.setPrivateRoomCleanMode)
    const clearEnvironment = useStore((state) => state.clearEnvironment)
    const setEnvironment = useStore((state) => state.setEnvironment)
    const isGreenroom = useStore((state) => state.isGreenroom)
    const activeTakeoverUserId = useStore((state) => {
      if (!state.currentSessionId) {
        return null
      }

      return state.mockTakeoverUserIdBySession[state.currentSessionId] ?? null
    })
    const currentRooms = useMemo<RoomRecord[]>(
      () => Object.values(currentSessionRoomsById),
      [currentSessionRoomsById]
    )
    const currentPresence = useMemo<PresenceRecord[]>(
      () => Object.values(currentSessionPresenceByUser),
      [currentSessionPresenceByUser]
    )
    const isTakeoverActive = Boolean(activeTakeoverUserId)
    const effectiveActorUserId = (activeTakeoverUserId || user.id) as UUID
    const takeoverPresence = useMemo(
      () =>
        activeTakeoverUserId
          ? currentPresence.find((presence) => presence.userId === activeTakeoverUserId) || null
          : null,
      [activeTakeoverUserId, currentPresence]
    )
    const connectedRoomId = useMemo<UUID | ''>(() => {
      const ownPresence = currentPresence.find(
        (presence) => presence.userId === effectiveActorUserId
      )
      return ownPresence?.primaryRoomId || ''
    }, [currentPresence, effectiveActorUserId])

    useWorkspacesAudioProjection({
      currentSession: baseProps.currentSession,
      currentPresence,
      effectiveActorUserId,
      currentRooms,
      setPrivateRoomCleanMode,
      connectedRoomId,
      currentEnvironment,
      clearEnvironment,
      roomEnvironmentNames,
      setEnvironment,
    })

    useWorkspacesGreenroomCleanup({
      selectedCampaignId,
      hasCurrentSession: Boolean(baseProps.currentSession),
      isGreenroom,
      currentSessionStats,
      currentPresence,
    })

    const derivedState = useWorkspacesDerivedState({
      wsState: baseProps.wsState,
      currentSession: baseProps.currentSession,
      campaigns,
      selectedCampaignId,
      settingsCampaignSessions,
      settingsReferenceSessionId,
      currentSessionStats,
      currentPresence,
      isGreenroom,
      currentRooms,
      activeTakeoverUserId,
      takeoverPresence,
      user,
      settingsPostSessionChatDurationMinutes,
      cooldownExtensionCounts,
    })

    const currentSessionNotesById = useStore((state) => {
      if (!state.currentSessionId) {
        return EMPTY_NOTES_BY_ID
      }

      const notesBySession = state.notes as Record<
        UUID,
        Record<UUID, { title: string; tags?: string[] | null }>
      >
      return notesBySession[state.currentSessionId] ?? EMPTY_NOTES_BY_ID
    })

    const rightRailIndicators = useMemo<Partial<Record<RightRailTab, number>>>(() => {
      const handoutCount = Object.values(currentSessionNotesById).filter(
        (note) => !isJournalNote(note)
      ).length
      return {
        notes: handoutCount,
        journal: 0,
        history: 0,
      }
    }, [currentSessionNotesById])

    return (
      <SessionWorkspace
        {...baseProps}
        currentPauseStats={currentPauseStats}
        rightRailIndicators={rightRailIndicators}
        connectedPlayers={derivedState.connectedPlayers}
        connectedSpectatorsCount={derivedState.connectedSpectatorsCount}
        effectiveSessionRole={derivedState.effectiveSessionRole}
        effectiveSessionUser={derivedState.effectiveSessionUser}
        canStartFromGreenroom={derivedState.canStartFromGreenroom}
        canPauseFromActive={derivedState.canPauseFromActive}
        canStopFromActive={derivedState.canStopFromActive}
        cooldownControlVisible={derivedState.cooldownControlVisible}
        canManageCooldown={Boolean(derivedState.canManageCooldown)}
        cooldownControlLockedReason={derivedState.cooldownControlLockedReason}
        canExtendCooldown={derivedState.canExtendCooldown}
        extendCooldownLockedReason={derivedState.extendCooldownLockedReason}
        canEditSessionSettings={derivedState.canEditSessionSettings}
        canEditEndedSessionName={derivedState.canEditEndedSessionName}
      />
    )
  },
  (prev, next) => prev.baseProps === next.baseProps
)

export const SESSION_WORKSPACE_CONNECTOR_PLACEHOLDERS = {
  currentPauseStats: EMPTY_PAUSE_STATS,
  rightRailIndicators: EMPTY_RIGHT_RAIL_INDICATORS,
} as const
