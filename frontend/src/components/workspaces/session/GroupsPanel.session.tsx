/**
 * Groups Panel (Session Mode)
 * Displays and manages runtime session-scoped groups during an active session.
 * This view allows the DM to move players between groups, apply environments,
 * and manage the close/delete flow.
 * Also shows players in each group (unlike editor mode).
 */

import React, { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { UUID, SessionState } from '@shared'
import { useStore } from '@/state/store'
import { useToast } from '@/hooks/useToast'
import { logger } from '@/utils/logger'
import {
  fetchSessionGroups,
  closeGroup,
  deleteGroup,
  applyGroupEnvironment,
} from '@/services/groupsPanel.service'
import SessionGroupCard from './GroupCard.session'

interface GroupsPanelSessionProps {
  sessionId: UUID
  sessionState: SessionState
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
  campaignId,
  apiUrl,
  token,
  isLoading = false,
}) => {
  const showToast = useToast()
  const [isClosing, setIsClosing] = useState<UUID | null>(null)
  const [isDeleting, setIsDeleting] = useState<UUID | null>(null)

  // Zustand selectors
  const sessionRooms = useStore(
    useShallow((state) => Object.values(state.sessionRoomsById[sessionId] || {}))
  )
  const roomMembers = useStore((state) => state.roomMembers)
  const roomEnvironments = useStore(
    useShallow((state) => state.sessionGroupEnvironments[sessionId] || {})
  )
  const setSessionGroups = useStore((state) => state.setSessionGroups)
  const setSessionGroupEnvironment = useStore((state) => state.setSessionGroupEnvironment)

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

    loadGroups()
  }, [sessionId, token, apiUrl, setSessionGroups, showToast])

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

  const isSessionActive = sessionState === 'ACTIVE' || sessionState === 'PAUSED'
  const canManageGroups = isSessionActive && sessionState !== 'PAUSED'

  // Check if group is empty
  const isGroupEmpty = (groupId: UUID): boolean => {
    const members = roomMembers[groupId] || []
    return members.length === 0
  }

  return (
    <div className="flex flex-col gap-3 h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-3 pb-2">
        <h3 className="font-semibold text-sm text-gray-200">
          Voice Groups ({sessionRooms.length})
        </h3>
        {sessionState === 'PAUSED' && (
          <p className="text-xs text-gray-500 mt-1">(Paused - groups locked during intermission)</p>
        )}
      </div>

      {/* Groups List */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {sessionRooms.length === 0 ? (
          <div className="text-center py-6 text-gray-500 text-xs">No groups in this session.</div>
        ) : (
          <div className="space-y-2">
            {sessionRooms.map((room) => {
              const members = roomMembers[room.id] || []
              const environment = roomEnvironments[room.id]
              const empty = isGroupEmpty(room.id)

              return (
                <SessionGroupCard
                  key={room.id}
                  room={room}
                  members={members}
                  environment={environment}
                  isEmpty={empty}
                  canManage={canManageGroups}
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

      {/* Session State Hint */}
      {!isSessionActive && (
        <div className="px-4 py-2 text-xs text-gray-500 border-t border-gray-700">
          Start a session to manage groups.
        </div>
      )}
    </div>
  )
}

export default GroupsPanelSession
