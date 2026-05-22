/**
 * Group Card (Session Mode)
 * Displays a runtime group with members, environment, and DM controls.
 * Shows the same core identity/status details surfaced by the legacy player card popper.
 */

import React from 'react'
import { PresenceState, RoomType } from '@shared'
import type { Room, RoomUser } from '@/types/room'
import { ENVIRONMENT_OPTIONS } from '@/types/groupPanel'
import { GroupMemberProfileCard } from './rooms/GroupMemberProfileCard'

function getDisplayName(member: RoomUser): string {
  return member.characterName || member.username || member.playerName || 'Player'
}

function getRoleLabel(member: RoomUser): 'DM' | 'PLAYER' | 'SPECTATOR' {
  if (member.role === 'DM') {
    return 'DM'
  }

  if (member.role === 'SPECTATOR') {
    return 'SPECTATOR'
  }

  return 'PLAYER'
}

function getPresenceDotState(presenceState: RoomUser['presenceState']): 'online' | 'offline' {
  return presenceState === PresenceState.OFFLINE || presenceState === PresenceState.IDLE
    ? 'offline'
    : 'online'
}

function getMetaLine(member: RoomUser): string {
  const values = [member.characterClass, member.characterSubclass, member.characterRace].filter(
    (value): value is string => Boolean(value)
  )

  if (typeof member.level === 'number') {
    values.push(`Lvl ${member.level}`)
  }

  return values.join(' • ')
}

function getStatEntries(member: RoomUser): Array<[string, string]> {
  if (!member.characterStats || typeof member.characterStats !== 'object') {
    return []
  }

  return Object.entries(member.characterStats)
    .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
    .slice(0, 4)
    .map(([key, value]) => [key.toUpperCase(), String(value)])
}

function getPresenceIcon(presenceState: RoomUser['presenceState']): string {
  if (presenceState === PresenceState.SPEAKING) {
    return 'graphic_eq'
  }

  if (presenceState === PresenceState.OFFLINE || presenceState === PresenceState.IDLE) {
    return 'radio_button_unchecked'
  }

  return 'circle'
}

function getPresenceLabel(presenceState: RoomUser['presenceState']): string {
  return String(presenceState)
}

interface SessionGroupCardProps {
  room: Room
  members: RoomUser[]
  environment?: string
  isEmpty: boolean
  canManage: boolean
  isClosing?: boolean
  isDeleting?: boolean
  onClose: () => void
  onDelete: () => void
  onSetEnvironment: (env: string) => void
}

/**
 * Session-mode group card.
 * Shows group name, member list, environment, and action buttons.
 */
const SessionGroupCard: React.FC<SessionGroupCardProps> = ({
  room,
  members,
  environment,
  isEmpty,
  canManage,
  isClosing = false,
  isDeleting = false,
  onClose,
  onDelete,
  onSetEnvironment,
}) => {
  const isWhisper = room.type === RoomType.PRIVATE
  const isMain = room.type === RoomType.MAIN

  return (
    <div
      className="bg-gray-800 border border-gray-700 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow"
      data-ui-component="SessionGroupCard"
    >
      {/* Header: Group Name & Actions */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <h4 className="font-semibold text-sm text-gray-100">{room.name}</h4>
          <p className="text-xs text-gray-500">
            {members.length} {members.length === 1 ? 'player' : 'players'}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-1">
          {canManage && !isMain && !isEmpty && (
            <button
              onClick={onClose}
              disabled={isClosing || isDeleting}
              title="Close group and move all members to MAIN"
              className="px-2 py-1 text-xs bg-amber-600/20 text-amber-400 rounded hover:bg-amber-600/30 disabled:opacity-50"
            >
              Close
            </button>
          )}

          {canManage && !isMain && isEmpty && (
            <button
              onClick={onDelete}
              disabled={isDeleting}
              title="Permanently delete this group"
              className="px-2 py-1 text-xs bg-red-600/20 text-red-400 rounded hover:bg-red-600/30 disabled:opacity-50"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Environment Display */}
      {!isWhisper && (
        <div className="mb-3 rounded bg-gray-700/50 p-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-gray-400">Environment</p>
              <p className="font-medium text-gray-200">{environment || 'Default'}</p>
            </div>
            {canManage ? (
              <select
                aria-label={`Set environment for ${room.name}`}
                className="rounded border border-gray-600 bg-gray-800 px-2 py-1 text-xs text-gray-200"
                value={environment || 'Default'}
                onChange={(event) => onSetEnvironment(event.target.value)}
              >
                {ENVIRONMENT_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </div>
      )}

      {/* Members List */}
      {members.length > 0 && (
        <div className="mb-2">
          <p className="text-xs text-gray-400 mb-1">Players:</p>
          <div className="space-y-2">
            {members.map((member) => {
              const roleLabel = getRoleLabel(member)
              const presenceDotState = getPresenceDotState(member.presenceState)
              const metaLine = getMetaLine(member)
              const statEntries = getStatEntries(member)

              return (
                <div
                  key={member.userId}
                  className="rounded border border-gray-600 bg-gray-700/60 px-3 py-2"
                  data-ui-component="SessionGroupMemberCard"
                >
                  <GroupMemberProfileCard
                    member={{
                      ...member,
                      roleLabel,
                    }}
                    metaLine={metaLine}
                    statEntries={statEntries}
                    environmentName={environment || 'Default'}
                    presenceLabel={getPresenceLabel(member.presenceState)}
                    presenceDotState={presenceDotState}
                    presenceIconName={getPresenceIcon(member.presenceState)}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Empty State Message */}
      {isEmpty && !isMain && (
        <div className="mb-2 p-2 bg-gray-700/30 rounded border border-gray-600 text-xs text-gray-400">
          Group is empty. Delete to remove permanently.
        </div>
      )}
    </div>
  )
}

export default SessionGroupCard
