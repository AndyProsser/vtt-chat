/**
 * Groups Panel (Session Mode)
 * Displays and manages runtime session-scoped groups during an active session.
 * This view allows the DM to move players between groups, apply environments,
 * and manage the close/delete flow.
 * Also shows players in each group (unlike editor mode).
 */

import React, { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Role, RoomType, isGreenroomSessionState, type UUID, type SessionState } from '@shared'
import { useStore } from '@/state/store'
import { useToast } from '@/hooks/useToast'
import { logger } from '@/utils/logger'
import {
  createSessionGroup,
  fetchSessionGroups,
  closeGroup,
  deleteGroup,
  applyGroupEnvironment,
} from '@/services/groupsPanel.service'
import { isGreenRoomName } from '@/constants/roomPresence.constants'
import '@/styles/components/workspaces/session/GroupsPanel.session.css'
import SessionGroupCard from './GroupCard.session'

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
 * Shows runtime groups with players, environments, drag/drop, close/delete.
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
  const roomEnvironmentNames = useStore(useShallow((state) => state.roomEnvironmentNames))
  const fallbackRoomEnvironments = useStore(
    useShallow((state) => state.sessionGroupEnvironments[sessionId] || {})
  )
  const dmVoiceTargetGroupId = useStore((state) => state.dmVoiceTargetGroupId)
  const setSessionGroups = useStore((state) => state.setSessionGroups)
  const setSessionGroupEnvironment = useStore((state) => state.setSessionGroupEnvironment)

  const sessionRooms = liveSessionRooms.length > 0 ? liveSessionRooms : fallbackSessionRooms
  const isGreenroom = isGreenroomSessionState(sessionState)
  const canManageGroups = effectiveSessionRole === Role.DM
  const canCreateGroups = canManageGroups && isGreenroom

  const dmMember = useMemo(
    () =>
      Object.values(roomMembers)
        .flat()
        .find((member) => member.role === Role.DM) || null,
    [roomMembers]
  )

  const membersByRoomId = useMemo(() => {
    const next: Record<UUID, (typeof roomMembers)[UUID]> = {}

    for (const room of sessionRooms) {
      next[room.id] = [...(roomMembers[room.id] || [])]
    }

    if (canManageGroups && dmMember && dmVoiceTargetGroupId && next[dmVoiceTargetGroupId]) {
      for (const roomId of Object.keys(next) as UUID[]) {
        next[roomId] = next[roomId].filter((member) => member.userId !== dmMember.userId)
      }

      next[dmVoiceTargetGroupId] = [dmMember, ...(next[dmVoiceTargetGroupId] || [])]
    }

    return next
  }, [canManageGroups, dmMember, dmVoiceTargetGroupId, roomMembers, sessionRooms])

  const visibleRooms = useMemo(() => {
    return sessionRooms
      .filter((room) => (isGreenroom ? true : !isGreenRoomName(room.name)))
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
        if (left.type === RoomType.MAIN && right.type !== RoomType.MAIN) return -1
        if (right.type === RoomType.MAIN && left.type !== RoomType.MAIN) return 1
        if (left.type === RoomType.PRIVATE && right.type !== RoomType.PRIVATE) return 1
        if (right.type === RoomType.PRIVATE && left.type !== RoomType.PRIVATE) return -1
        return left.name.localeCompare(right.name)
      })
  }, [canManageGroups, isGreenroom, membersByRoomId, sessionRooms])

  // Load session groups on mount
  useEffect(() => {
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
  }, [sessionId, token, apiUrl, setSessionGroups, showToast])

  const handleCreateGroup = async () => {
    const trimmedName = newGroupName.trim()
    if (!trimmedName) {
      showToast({ message: 'Enter a group name', variant: 'error' })
      return
    }

    try {
      setIsCreating(true)
      const room = await createSessionGroup(sessionId, trimmedName, token, apiUrl)
      setSessionGroups(sessionId, [...sessionRooms, room])
      setNewGroupName('')
      showToast({ message: `Group "${trimmedName}" created`, variant: 'success' })
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
      const response = await closeGroup(sessionId, groupId, token, apiUrl)

      // WS event ROOM:CLOSED will handle state update
      // For now, just show confirmation
      showToast({
        message: `Group closed. ${response.movedUsers.length} player(s) moved to MAIN`,
        variant: 'success',
      })

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

      // WS event ROOM:DELETED will handle state update
      showToast({ message: 'Group deleted', variant: 'success' })

      setIsDeleting(null)
    } catch (err) {
      logger.error('GroupsPanelSession', 'Failed to delete group', err)
      const errorMsg = err instanceof Error ? err.message : 'Failed to delete group'
      showToast({ message: errorMsg, variant: 'error' })
      setIsDeleting(null)
    }
  }

  const handleSetEnvironment = async (groupId: UUID, environmentName: string) => {
    try {
      await applyGroupEnvironment(sessionId, groupId, environmentName, token, apiUrl)

      // Update local state; WS event AUDIO:ENVIRONMENT_SET will sync to other clients
      setSessionGroupEnvironment(sessionId, groupId, environmentName)

      showToast({ message: `Environment set to "${environmentName}"`, variant: 'success' })
    } catch (err) {
      logger.error('GroupsPanelSession', 'Failed to set environment', err)
      const errorMsg = err instanceof Error ? err.message : 'Failed to set environment'
      showToast({ message: errorMsg, variant: 'error' })
    }
  }

  const isGroupEmpty = (groupId: UUID): boolean => {
    const members = membersByRoomId[groupId] || []
    return members.filter((member) => member.role !== Role.DM).length === 0
  }

  return (
    <section className="session-groups-panel" aria-label="Groups panel">
      <header className="session-groups-panel__header">
        <div className="session-groups-panel__header-info">
          <h3 className="session-groups-panel__title">Groups</h3>
          <span className="session-groups-panel__count">{visibleRooms.length}</span>
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
              disabled={isCreating}
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
            {visibleRooms.map((room) => {
              const members = membersByRoomId[room.id] || []
              const environment = roomEnvironmentNames[room.id] || fallbackRoomEnvironments[room.id]
              const empty = isGroupEmpty(room.id)

              return (
                <SessionGroupCard
                  key={room.id}
                  room={room}
                  members={members}
                  environment={environment}
                  isEmpty={empty}
                  canManage={canManageGroups}
                  isGreenroom={isGreenroom}
                  isClosing={isClosing === room.id}
                  isDeleting={isDeleting === room.id}
                  onClose={() => handleCloseGroup(room.id)}
                  onDelete={() => handleDeleteGroup(room.id)}
                  onSetEnvironment={(env) => handleSetEnvironment(room.id, env)}
                />
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

export default GroupsPanelSession
