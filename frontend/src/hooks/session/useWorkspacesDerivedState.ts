import { useMemo } from 'react'
import { PresenceState, Role, SessionState, type UUID } from '@shared'
import { useSessionLeaveWarning } from '@/hooks/session/useSessionLeaveWarning'
import { resolveMembershipRole, type CampaignSummary } from '@/types/session/campaign'
import type { Session as SessionRecord } from '@/types/session'
import type { SessionPresence as PresenceRecord, Room as RoomRecord } from '@/types/room'
import type { ApiSessionStats } from '@/types/session/workspaces'
import { isGreenRoom, toValidPostSessionDurationMinutes } from '@/utils/session/workspaces'

type UseWorkspacesDerivedStateParams = {
  wsState: 'connected' | 'connecting' | 'disconnected' | 'reconnecting'
  currentSession: SessionRecord | null
  campaigns: CampaignSummary[]
  selectedCampaignId: UUID | ''
  settingsCampaignSessions: SessionRecord[]
  settingsReferenceSessionId: UUID | ''
  currentSessionStats: ApiSessionStats | undefined
  currentPresence: PresenceRecord[]
  isGreenroom: boolean
  currentRooms: RoomRecord[]
  activeTakeoverUserId: UUID | null
  takeoverPresence: PresenceRecord | null
  user: {
    id: UUID
    username: string
    role: Role
    authType?: 'FULL' | 'GUEST'
  }
  settingsPostSessionChatDurationMinutes: number
  cooldownExtensionCounts: Record<UUID, number>
}

/**
 * Computes workspace shell-derived session/lobby state from store snapshots and runtime context
 * so index composition stays thin and declarative.
 */
export function useWorkspacesDerivedState(params: UseWorkspacesDerivedStateParams) {
  const {
    currentSession,
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
  } = params

  const hasSessionSelected = currentSession !== null

  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId)
  const settingsReferenceSession = settingsCampaignSessions.find(
    (session) => session.id === settingsReferenceSessionId
  )

  const settingsCampaignTotalDurationMs = useMemo(
    () =>
      settingsCampaignSessions.reduce((total, session) => {
        if (!session.startedAt || !session.endedAt) {
          return total
        }

        return total + Math.max(0, session.endedAt - session.startedAt)
      }, 0),
    [settingsCampaignSessions]
  )

  const connectedSpectatorsCount =
    currentSessionStats?.connectedSpectators ?? selectedCampaign?.connectedSpectatorsRounded ?? 0

  const greenroomRosterCount = useMemo(() => {
    if (!currentSession || !isGreenroom) {
      return undefined
    }

    const greenroom = currentRooms.find((room) => isGreenRoom(room))
    if (!greenroom) {
      return undefined
    }

    const uniqueUserIds = new Set<UUID>()
    for (const presence of currentPresence) {
      if (presence.primaryRoomId !== greenroom.id || presence.role === Role.SYSTEM) {
        continue
      }

      uniqueUserIds.add(presence.userId)
    }

    return uniqueUserIds.size
  }, [currentPresence, currentRooms, currentSession, isGreenroom])

  const liveConnectedPresenceCount = currentPresence.filter(
    (presence) => presence.state !== PresenceState.OFFLINE
  ).length
  const hasLivePresence = currentSession !== null && currentPresence.length > 0

  const connectedPlayers = isGreenroom
    ? (greenroomRosterCount ??
      (currentSessionStats
        ? currentSessionStats.connectedPlayersWithDm
        : hasLivePresence
          ? Math.max(0, liveConnectedPresenceCount - connectedSpectatorsCount)
          : selectedCampaign?.connectedPlayersRounded !== undefined ||
              selectedCampaign?.connectedPlayers
            ? Math.max(
                0,
                (selectedCampaign?.connectedPlayersRounded ??
                  selectedCampaign?.connectedPlayers ??
                  0) + (selectedCampaign?.dmOnline ? 1 : 0)
              )
            : Math.max(0, liveConnectedPresenceCount - connectedSpectatorsCount)))
    : currentSessionStats
      ? currentSessionStats.connectedPlayersWithDm
      : hasLivePresence
        ? Math.max(0, liveConnectedPresenceCount - connectedSpectatorsCount)
        : selectedCampaign?.connectedPlayersRounded !== undefined ||
            selectedCampaign?.connectedPlayers
          ? Math.max(
              0,
              (selectedCampaign?.connectedPlayersRounded ??
                selectedCampaign?.connectedPlayers ??
                0) + (selectedCampaign?.dmOnline ? 1 : 0)
            )
          : Math.max(0, liveConnectedPresenceCount - connectedSpectatorsCount)

  const membershipRole = resolveMembershipRole(selectedCampaign?.memberRole)
  const effectiveSessionRole: Role = activeTakeoverUserId
    ? Role.PLAYER
    : currentSession && currentSession.dmId === user.id
      ? Role.DM
      : membershipRole

  const dmPresence = useMemo(
    () => currentPresence.find((presence) => presence.userId === currentSession?.dmId) || null,
    [currentPresence, currentSession?.dmId]
  )

  const isDmDisconnected =
    Boolean(currentSession) &&
    currentSession?.dmId !== user.id &&
    dmPresence?.state === PresenceState.OFFLINE

  const configuredCooldownDurationMs = Math.max(
    60_000,
    toValidPostSessionDurationMinutes(settingsPostSessionChatDurationMinutes) * 60_000
  )

  const cooldownControlVisible =
    currentSession?.state === SessionState.COOLDOWN &&
    (effectiveSessionRole === Role.DM || effectiveSessionRole === Role.PLAYER)

  const canManageCooldown =
    currentSession?.state === SessionState.COOLDOWN &&
    (currentSession?.dmId === user.id || (effectiveSessionRole === Role.PLAYER && isDmDisconnected))

  const cooldownControlLockedReason =
    cooldownControlVisible && !canManageCooldown
      ? effectiveSessionRole === Role.PLAYER
        ? 'Cooldown controls unlock for players only if the DM disconnects.'
        : 'Only the DM can control cooldown.'
      : undefined

  const currentCooldownExtensionCount = currentSession
    ? (cooldownExtensionCounts[currentSession.id] ?? 0)
    : 0

  const canExtendCooldown = Boolean(canManageCooldown) && currentCooldownExtensionCount < 3
  const extendCooldownLockedReason = !canManageCooldown
    ? cooldownControlLockedReason
    : currentCooldownExtensionCount >= 3
      ? 'Cooldown extention limit reached'
      : undefined

  const takeoverDisplayName =
    takeoverPresence?.characterName || takeoverPresence?.username || user.username

  const effectiveSessionUser = useMemo(
    () =>
      effectiveSessionRole === user.role && !activeTakeoverUserId
        ? {
            ...user,
            campaignMembershipRole: selectedCampaign?.memberRole as
              | 'DM'
              | 'PLAYER'
              | 'SPECTATOR'
              | undefined,
          }
        : {
            ...user,
            id: (activeTakeoverUserId || user.id) as UUID,
            username: takeoverDisplayName,
            role: effectiveSessionRole,
            campaignMembershipRole: effectiveSessionRole as unknown as
              | 'DM'
              | 'PLAYER'
              | 'SPECTATOR',
          },
    [
      activeTakeoverUserId,
      effectiveSessionRole,
      selectedCampaign?.memberRole,
      takeoverDisplayName,
      user,
    ]
  )

  const canStartFromGreenroom =
    !activeTakeoverUserId &&
    currentSession?.dmId === user.id &&
    (currentSession?.state === SessionState.IDLE || currentSession?.state === SessionState.ENDED)
  const canPauseFromActive =
    !activeTakeoverUserId &&
    currentSession?.dmId === user.id &&
    (currentSession?.state === SessionState.ACTIVE || currentSession?.state === SessionState.PAUSED)
  const canStopFromActive =
    !activeTakeoverUserId &&
    currentSession?.dmId === user.id &&
    (currentSession?.state === SessionState.ACTIVE || currentSession?.state === SessionState.PAUSED)

  const leaveSessionWarning = useSessionLeaveWarning(effectiveSessionRole, currentSession?.state)
  const canEditSessionSettings =
    currentSession?.state === SessionState.IDLE ||
    currentSession?.state === SessionState.ACTIVE ||
    currentSession?.state === SessionState.PAUSED
  const canEditEndedSessionName =
    !activeTakeoverUserId &&
    currentSession?.dmId === user.id &&
    currentSession?.state === SessionState.ENDED

  return {
    hasSessionSelected,
    selectedCampaign,
    settingsReferenceSession,
    settingsCampaignTotalDurationMs,
    connectedSpectatorsCount,
    connectedPlayers,
    membershipRole,
    effectiveSessionRole,
    isDmDisconnected,
    configuredCooldownDurationMs,
    cooldownControlVisible,
    canManageCooldown,
    cooldownControlLockedReason,
    canExtendCooldown,
    extendCooldownLockedReason,
    effectiveSessionUser,
    canStartFromGreenroom,
    canPauseFromActive,
    canStopFromActive,
    leaveSessionWarning,
    canEditSessionSettings,
    canEditEndedSessionName,
  }
}
