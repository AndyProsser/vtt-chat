/**
 * Groups Panel (Session Mode)
 * Displays and manages runtime session-scoped groups during an active session.
 * This view allows the DM to move players between groups, apply environments,
 * and manage the close/delete flow.
 * Also shows players in each group (unlike editor mode).
 */

import React, { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  PresenceState,
  Role,
  RoomType,
  SessionState,
  isGreenroomSessionState,
  type UUID,
} from '@shared'
import { Icon } from '@/components/ui/Icon'
import { useStore } from '@/state/store'
import { useToast } from '@/hooks/useToast'
import { logger } from '@/utils/logger'
import type { RoomUser } from '@/types/room'
import {
  createSessionGroup,
  fetchSessionGroups,
  closeGroup,
  deleteGroup,
  applyGroupEnvironment,
} from '@/services/groupsPanel.service'
import { moveRoomMember } from '@/services/groupsPanel.service'
import { optimisticMoveMember, optimisticApplyEnvironment } from '@/services/groupsPanel.client'
import { isGreenRoomName } from '@/constants/roomPresence.constants'
import '@/styles/components/workspaces/session/GroupsPanel.session.css'
import SessionGroupCard from './GroupCard.session'

const EMPTY_ROOM_MEMBERS: RoomUser[] = []

function compareMembers(left: RoomUser, right: RoomUser): number {
  if (left.role === Role.DM && right.role !== Role.DM) return -1
  if (right.role === Role.DM && left.role !== Role.DM) return 1
  return (left.characterName || left.playerName || left.username).localeCompare(
    right.characterName || right.playerName || right.username
  )
}

function sortMembersIfNeeded(members: RoomUser[]): RoomUser[] {
  if (members.length < 2) {
    return members
  }

  const sorted = [...members].sort(compareMembers)
  for (let index = 0; index < sorted.length; index += 1) {
    if (sorted[index] !== members[index]) {
      return sorted
    }
  }

  return members
}

interface GroupsPanelSessionProps {
  sessionId: UUID
  sessionState: SessionState
  effectiveSessionRole: Role
  campaignId: UUID
  apiUrl: string
  token: string
  isLoading?: boolean
}

/**
 * Session-mode Groups Panel.
 * Shows runtime groups with players, environments, and DM room management.
 */
export const GroupsPanelSession: React.FC<GroupsPanelSessionProps> = ({
  sessionId,
  sessionState,
  effectiveSessionRole,
  campaignId,
  apiUrl,
  token,
  isLoading = false,
}) => {
  const showToast = useToast()
  const [isCreating, setIsCreating] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [isClosing, setIsClosing] = useState<UUID | null>(null)
  const [isDeleting, setIsDeleting] = useState<UUID | null>(null)

  const liveSessionRooms = useStore(
    useShallow((state) => Object.values(state.rooms[sessionId] || {}))
  )
  const fallbackSessionRooms = useStore(
    useShallow((state) => Object.values(state.sessionRoomsById[sessionId] || {}))
  )
  const roomMembers = useStore((state) => state.roomMembers)
  const currentUser = useStore((state) => state.currentUser)
  // Narrow subscription: only the DM's own presence entry. Ghost flips for other users
  // preserve the per-user object reference in the spread, so this stays stable.
  const dmSelfPresence = useStore((state) => {
    const uid = state.currentUser?.id
    return uid ? (state.sessionPresence[sessionId]?.[uid] ?? null) : null
  })
  const roomEnvironmentNames = useStore(useShallow((state) => state.roomEnvironmentNames))
  const fallbackRoomEnvironments = useStore(
    useShallow((state) => state.sessionGroupEnvironments[sessionId] || {})
  )
  const dmVoiceTargetGroupId = useStore((state) => state.dmVoiceTargetGroupId)
  const setSessionGroups = useStore((state) => state.setSessionGroups)
  const setSessionGroupEnvironment = useStore((state) => state.setSessionGroupEnvironment)
  const clearSessionGroupEnvironment = useStore((state) => state.clearSessionGroupEnvironment)
  const setDmVoiceTarget = useStore((state) => (state as any).setDmVoiceTarget)
  const addRoomMember = useStore((state) => (state as any).addRoomMember)
  const removeRoomMember = useStore((state) => (state as any).removeRoomMember)

  const sessionRooms = liveSessionRooms.length > 0 ? liveSessionRooms : fallbackSessionRooms
  const isGreenroom = isGreenroomSessionState(sessionState)
  const canManageGroups = effectiveSessionRole === Role.DM
  const canCreateGroups = canManageGroups
  const shouldHideGreenRoom =
    sessionState === SessionState.ACTIVE ||
    sessionState === SessionState.PAUSED ||
    sessionState === SessionState.COOLDOWN
  const shouldDetachDmFromRooms =
    sessionState === SessionState.ACTIVE ||
    sessionState === SessionState.PAUSED ||
    sessionState === SessionState.COOLDOWN

  const dmMember = useMemo(() => {
    for (const room of sessionRooms) {
      const members = roomMembers[room.id] || EMPTY_ROOM_MEMBERS
      const foundDm = members.find((member) => member.role === Role.DM)
      if (foundDm) {
        return foundDm
      }
    }

    return null
  }, [roomMembers, sessionRooms])

  const dmFallback = useMemo(() => {
    if ((!canManageGroups && currentUser?.role !== Role.DM) || !currentUser) {
      return null
    }

    const selfPresence = dmSelfPresence
    const availableRoomIds = new Set(sessionRooms.map((room) => room.id))
    const greenRoom = sessionRooms.find((room) => isGreenRoomName(room.name))
    const mainRoom = sessionRooms.find((room) => room.type === RoomType.MAIN)

    const targetRoomIdCandidates = [
      dmVoiceTargetGroupId,
      selfPresence?.primaryRoomId,
      greenRoom?.id,
      mainRoom?.id,
      sessionRooms[0]?.id,
    ]
    const targetRoomId =
      targetRoomIdCandidates.find((candidate): candidate is UUID =>
        Boolean(candidate && availableRoomIds.has(candidate))
      ) || null

    if (!targetRoomId) {
      return null
    }

    const fallbackDmMember: RoomUser = {
      userId: currentUser.id,
      username: currentUser.username,
      role: Role.DM,
      playerName: currentUser.username,
      characterName: currentUser.displayName || currentUser.username,
      avatarUrl: selfPresence?.avatarUrl ?? null,
      characterClass: selfPresence?.characterClass ?? null,
      characterSubclass: selfPresence?.characterSubclass ?? null,
      characterRace: selfPresence?.characterRace ?? null,
      level: selfPresence?.level ?? null,
      characterStats: selfPresence?.characterStats ?? null,
      presenceState: selfPresence?.state ?? PresenceState.ONLINE,
      ghost: selfPresence?.ghost,
      previousGroupId: selfPresence?.previousGroupId,
      joinedAt: selfPresence?.lastSeenAt ?? 0,
    }

    return {
      member: fallbackDmMember,
      targetRoomId,
    }
  }, [canManageGroups, currentUser, dmVoiceTargetGroupId, dmSelfPresence, sessionRooms])

  const membersByRoomId = useMemo(() => {
    const next: Record<UUID, (typeof roomMembers)[UUID]> = {}
    const resolvedDmMember = dmMember || dmFallback?.member || null
    const resolvedDmTargetRoomId = dmVoiceTargetGroupId || dmFallback?.targetRoomId || null

    for (const room of sessionRooms) {
      next[room.id] = roomMembers[room.id] || EMPTY_ROOM_MEMBERS
    }

    if (
      canManageGroups &&
      resolvedDmMember &&
      resolvedDmTargetRoomId &&
      next[resolvedDmTargetRoomId] &&
      !shouldDetachDmFromRooms
    ) {
      for (const roomId of Object.keys(next) as UUID[]) {
        const members = next[roomId]
        if (!members.some((member) => member.userId === resolvedDmMember.userId)) {
          continue
        }

        next[roomId] = members.filter((member) => member.userId !== resolvedDmMember.userId)
      }

      next[resolvedDmTargetRoomId] = [resolvedDmMember, ...(next[resolvedDmTargetRoomId] || [])]
    }

    for (const roomId of Object.keys(next) as UUID[]) {
      next[roomId] = sortMembersIfNeeded(next[roomId])
    }

    return next
  }, [
    canManageGroups,
    dmFallback,
    dmMember,
    dmVoiceTargetGroupId,
    roomMembers,
    sessionRooms,
    shouldDetachDmFromRooms,
  ])

  const nonDmCountsByRoomId = useMemo(() => {
    const counts: Record<UUID, number> = {}
    for (const room of sessionRooms) {
      const members = membersByRoomId[room.id] || EMPTY_ROOM_MEMBERS
      let count = 0
      for (const member of members) {
        if (member.role !== Role.DM) {
          count += 1
        }
      }
      counts[room.id] = count
    }
    return counts
  }, [membersByRoomId, sessionRooms])

  const whisperRoom = useMemo(() => {
    return sessionRooms.find((room) => room.type === RoomType.PRIVATE) || null
  }, [sessionRooms])

  const visibleRooms = useMemo(() => {
    return sessionRooms
      .filter((room) => (shouldHideGreenRoom ? !isGreenRoomName(room.name) : true))
      .filter((room) => room.type !== RoomType.PRIVATE)
      .filter((room) => {
        if (canManageGroups) {
          return true
        }

        const visiblePlayers = (membersByRoomId[room.id] || []).filter(
          (member) => member.role !== Role.DM && member.role !== Role.SPECTATOR
        )
        return visiblePlayers.length > 0
      })
      .sort((left, right) => {
        const leftIsGreenRoom = isGreenRoomName(left.name)
        const rightIsGreenRoom = isGreenRoomName(right.name)

        if (leftIsGreenRoom && !rightIsGreenRoom) return -1
        if (rightIsGreenRoom && !leftIsGreenRoom) return 1
        if (left.type === RoomType.MAIN && right.type !== RoomType.MAIN) return -1
        if (right.type === RoomType.MAIN && left.type !== RoomType.MAIN) return 1
        return left.name.localeCompare(right.name)
      })
  }, [canManageGroups, membersByRoomId, sessionRooms, shouldHideGreenRoom])

  const detachedDmMember = useMemo(() => {
    if (!canManageGroups || !shouldDetachDmFromRooms) {
      return null
    }

    return dmMember || dmFallback?.member || null
  }, [canManageGroups, dmFallback, dmMember, shouldDetachDmFromRooms])

  const detachedDmVoiceTargetRoomName = useMemo(() => {
    if (!detachedDmMember) {
      return null
    }

    const targetRoomId = dmVoiceTargetGroupId || dmFallback?.targetRoomId || null
    if (!targetRoomId) {
      return 'Main'
    }

    return sessionRooms.find((room) => room.id === targetRoomId)?.name || 'Main'
  }, [detachedDmMember, dmFallback, dmVoiceTargetGroupId, sessionRooms])

  // Load session groups on mount
  useEffect(() => {
    if (sessionRooms.length > 0) {
      return
    }

    const loadGroups = async () => {
      try {
        const rooms = await fetchSessionGroups(sessionId, token, apiUrl)
        setSessionGroups(sessionId, rooms)
      } catch (err) {
        logger.error('GroupsPanelSession', 'Failed to load session groups', err)
        showToast({ message: 'Failed to load groups. Please try again.', variant: 'error' })
      }
    }

    void loadGroups()
  }, [apiUrl, sessionId, sessionRooms.length, setSessionGroups, showToast, token])

  const handleCreateGroup = async () => {
    const trimmedName = newGroupName.trim()
    if (!trimmedName) {
      showToast({ message: 'Enter a group name', variant: 'error' })
      return
    }

    const reserved = new Set(['MAIN', 'WHISPER', 'GREENROOM'])
    if (reserved.has(trimmedName.toUpperCase())) {
      showToast({ message: `"${trimmedName}" is a reserved room name`, variant: 'error' })
      return
    }

    try {
      setIsCreating(true)
      const room = await createSessionGroup(sessionId, trimmedName, token, apiUrl)
      setSessionGroups(sessionId, [...sessionRooms, room])
      setNewGroupName('')
    } catch (err) {
      logger.error('GroupsPanelSession', 'Failed to create group', err)
      const errorMsg = err instanceof Error ? err.message : 'Failed to create group'
      showToast({ message: errorMsg, variant: 'error' })
    } finally {
      setIsCreating(false)
    }
  }

  const handleCloseGroup = async (groupId: UUID) => {
    try {
      setIsClosing(groupId)
      await closeGroup(sessionId, groupId, token, apiUrl)

      setIsClosing(null)
    } catch (err) {
      logger.error('GroupsPanelSession', 'Failed to close group', err)
      const errorMsg = err instanceof Error ? err.message : 'Failed to close group'
      showToast({ message: errorMsg, variant: 'error' })
      setIsClosing(null)
    }
  }

  const handleDeleteGroup = async (groupId: UUID) => {
    try {
      setIsDeleting(groupId)
      await deleteGroup(sessionId, groupId, false, token, apiUrl)

      setSessionGroups(
        sessionId,
        sessionRooms.filter((room) => room.id !== groupId)
      )

      setIsDeleting(null)
    } catch (err) {
      logger.error('GroupsPanelSession', 'Failed to delete group', err)
      const errorMsg = err instanceof Error ? err.message : 'Failed to delete group'
      showToast({ message: errorMsg, variant: 'error' })
      setIsDeleting(null)
    }
  }

  const [applyingEnvironments, setApplyingEnvironments] = useState<UUID[]>([])

  const handleSetEnvironment = async (groupId: UUID, environmentName: string) => {
    try {
      await optimisticApplyEnvironment({
        sessionId,
        groupId,
        environmentName,
        setSessionGroupEnvironment,
        clearSessionGroupEnvironment,
        applyGroupEnvironmentFn: applyGroupEnvironment,
        token,
        apiUrl,
        showToast,
        setApplying: (updater) => setApplyingEnvironments(updater as any),
        getPrevEnv: () => roomEnvironmentNames[groupId] || fallbackRoomEnvironments[groupId],
      })
    } catch (err) {
      logger.error('GroupsPanelSession', 'Failed to set environment', err)
    }
  }

  const handleMoveMember = async (targetUserId: UUID, targetRoomId: UUID) => {
    try {
      await optimisticMoveMember({
        sessionId,
        targetUserId,
        targetRoomId,
        addRoomMember: addRoomMember as any,
        removeRoomMember: removeRoomMember as any,
        setSessionGroups,
        fetchSessionGroupsFn: fetchSessionGroups,
        moveRoomMemberFn: moveRoomMember,
        setDmVoiceTarget: setDmVoiceTarget as any,
        token,
        apiUrl,
        showToast,
      })
    } catch (err) {
      logger.error('GroupsPanelSession', 'Failed to move member', err)
    }
  }

  return (
    <section className="session-groups-panel" aria-label="Groups panel">
      <header className="session-groups-panel__header">
        <div className="session-groups-panel__header-info">
          <h3 className="session-groups-panel__title">
            <Icon name="rooms" />
            Groups
          </h3>
        </div>
        {canCreateGroups ? (
          <div className="session-groups-panel__create-row">
            <input
              type="text"
              value={newGroupName}
              onChange={(event) => setNewGroupName(event.target.value)}
              placeholder="New group name"
              className="session-groups-panel__create-input"
              disabled={isCreating}
            />
            <button
              type="button"
              className="session-groups-panel__create-button"
              onClick={() => {
                void handleCreateGroup()
              }}
              disabled={isCreating || !newGroupName.trim()}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                group_add
              </span>
            </button>
          </div>
        ) : null}
      </header>

      <div className="session-groups-panel__body">
        {visibleRooms.length === 0 ? (
          <div className="session-groups-panel__empty">No groups available.</div>
        ) : (
          <div className="session-groups-panel__list">
            {detachedDmMember ? (
              <article
                className="session-groups-dm-detached"
                data-ui-component="SessionGroupsDetachedDM"
              >
                <div className="session-groups-dm-detached__header">Dungeon Master</div>
                <div className="session-groups-dm-detached__name">
                  {detachedDmMember.characterName || detachedDmMember.username}
                </div>
                <div className="session-groups-dm-detached__target">
                  Voice target: <strong>{detachedDmVoiceTargetRoomName || 'Main'}</strong>
                </div>
              </article>
            ) : null}
            {visibleRooms.map((room) => {
              const members = membersByRoomId[room.id] || []
              const environment = roomEnvironmentNames[room.id] || fallbackRoomEnvironments[room.id]
              const empty = (nonDmCountsByRoomId[room.id] ?? 0) === 0

              return (
                <SessionGroupCard
                  key={room.id}
                  room={room}
                  members={members}
                  environment={environment}
                  isEmpty={empty}
                  canManage={canManageGroups}
                  isGreenroom={isGreenroom}
                  isGreenRoomCard={isGreenRoomName(room.name)}
                  isClosing={isClosing === room.id}
                  isDeleting={isDeleting === room.id}
                  onClose={() => handleCloseGroup(room.id)}
                  onDelete={() => handleDeleteGroup(room.id)}
                  onSetEnvironment={(env) => handleSetEnvironment(room.id, env)}
                  onMoveMember={handleMoveMember}
                  isApplyingEnvironment={applyingEnvironments.includes(room.id)}
                />
              )
            })}
          </div>
        )}
      </div>

      {whisperRoom ? (
        <div className="session-groups-panel__footer">
          <SessionGroupCard
            room={whisperRoom}
            members={membersByRoomId[whisperRoom.id] || []}
            environment={
              roomEnvironmentNames[whisperRoom.id] || fallbackRoomEnvironments[whisperRoom.id]
            }
            isEmpty={(nonDmCountsByRoomId[whisperRoom.id] ?? 0) === 0}
            canManage={canManageGroups}
            isGreenroom={isGreenroom}
            isGreenRoomCard={false}
            isClosing={isClosing === whisperRoom.id}
            isDeleting={isDeleting === whisperRoom.id}
            onClose={() => handleCloseGroup(whisperRoom.id)}
            onDelete={() => handleDeleteGroup(whisperRoom.id)}
            onSetEnvironment={(env) => handleSetEnvironment(whisperRoom.id, env)}
            onMoveMember={handleMoveMember}
            isApplyingEnvironment={applyingEnvironments.includes(whisperRoom.id)}
          />
        </div>
      ) : null}
    </section>
  )
}

export default GroupsPanelSession
