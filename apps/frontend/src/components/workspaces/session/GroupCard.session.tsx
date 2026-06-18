/**
 * Group Card (Session Mode)
 * Displays a runtime group with members, environment, and DM controls.
 * Shows the same core identity/status details surfaced by the legacy player card popper.
 */

import React, { useMemo, useState } from 'react'
import { PresenceState, RoomType, type UUID } from '@shared'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import { useTooltipLabelsPreference } from '@/hooks/useTooltipLabelsPreference'
import type { Room, RoomUser } from '@/types/room'
import { ENVIRONMENT_OPTIONS } from '@/types/groupPanel'
import { isGreenRoomName } from '@/constants/roomPresence.constants'
import { resolveEnvironmentGlyph } from '@/constants/voiceGroup.constants'
import '@/styles/components/workspaces/session/GroupsPanel.session.css'

function getDisplayName(member: RoomUser): string {
  return member.characterName || member.username || member.playerName || 'Player'
}

function getPlayerDetail(member: RoomUser): string {
  return member.playerName || member.username || getDisplayName(member)
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
  if (member.role === 'DM') {
    return 'Dungeon Master'
  }

  const values = [member.characterClass, member.characterSubclass, member.characterRace].filter(
    (value): value is string => Boolean(value)
  )

  if (typeof member.level === 'number') {
    values.push(`Lvl ${member.level}`)
  }

  return values.join(' • ')
}

function getStatEntries(member: RoomUser): Array<[string, string]> {
  if (member.role === 'DM') {
    return []
  }

  if (!member.characterStats || typeof member.characterStats !== 'object') {
    return []
  }

  const typedStats = member.characterStats as Record<string, unknown>
  const syncedStats = typedStats.stats as Record<string, unknown> | undefined
  const abilityScores = syncedStats?.abilityScores as Record<string, unknown> | undefined

  const entries: Array<[string, unknown]> = []

  function resolveStatNum(syncedVal: unknown, flatVal: unknown): number | undefined {
    const v = syncedVal !== undefined && syncedVal !== null ? syncedVal : flatVal
    const n = Number(v)
    return Number.isFinite(n) ? n : undefined
  }

  const syncedHp = syncedStats?.hp as { current?: number; max?: number } | undefined
  const hpCurrent = resolveStatNum(syncedHp?.current, typedStats.hpCurrent)
  const hpMax = resolveStatNum(syncedHp?.max, typedStats.hpMax)
  if (hpCurrent !== undefined && hpMax !== undefined) {
    entries.push(['HP', `${hpCurrent}/${hpMax}`])
  }

  const ac = resolveStatNum(syncedStats?.ac, typedStats.ac)
  if (ac !== undefined) entries.push(['AC', ac])

  const initiative = resolveStatNum(syncedStats?.initiative, typedStats.initiative)
  if (initiative !== undefined) {
    entries.push(['INIT', `${initiative >= 0 ? '+' : ''}${initiative}`])
  }

  const pp = resolveStatNum(syncedStats?.passivePerception, typedStats.passivePerception)
  if (pp !== undefined) entries.push(['PP', pp])

  const speed = resolveStatNum(syncedStats?.speed, typedStats.speed)
  if (speed !== undefined) entries.push(['SPD', `${speed}ft`])

  const ABILITY_MAP: Array<[string, string, string]> = [
    ['STR', 'str', 'strength'],
    ['DEX', 'dex', 'dexterity'],
    ['CON', 'con', 'constitution'],
    ['INT', 'int', 'intelligence'],
    ['WIS', 'wis', 'wisdom'],
    ['CHA', 'cha', 'charisma'],
  ]
  for (const [label, extKey, flatKey] of ABILITY_MAP) {
    const value = abilityScores?.[extKey] ?? typedStats[flatKey]
    if (value !== null && value !== undefined) entries.push([label, value])
  }

  return entries.map(([key, value]) => [key, String(value)])
}

interface SessionGroupCardProps {
  room: Room
  members: RoomUser[]
  environment?: string
  isEmpty: boolean
  canManage: boolean
  isGreenroom: boolean
  isGreenRoomCard: boolean
  isClosing?: boolean
  isDeleting?: boolean
  onClose: () => void
  onDelete: () => void
  onSetEnvironment: (env: string) => void
  onMoveMember?: (targetUserId: UUID, targetRoomId: UUID) => void
  isApplyingEnvironment?: boolean
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
  isGreenroom,
  isGreenRoomCard,
  isClosing = false,
  isDeleting = false,
  onClose,
  onDelete,
  onSetEnvironment,
  onMoveMember,
  isApplyingEnvironment = false,
}) => {
  const { tooltipLabelsEnabled } = useTooltipLabelsPreference()
  const isWhisper = room.type === RoomType.PRIVATE
  const isMain = room.type === RoomType.MAIN
  const isGreenRoom = isGreenRoomCard || isGreenRoomName(room.name)
  const canChangeEnvironment = canManage && !isWhisper && !isGreenRoom && !isApplyingEnvironment
  const canDrainOrDelete = canManage && !isMain && !isGreenRoom
  const showDrainOrDeleteAction = canDrainOrDelete && (!isWhisper || !isEmpty)
  const actionIcon = isWhisper || !isEmpty ? 'reply' : 'delete'
  const actionLabel = isWhisper || !isEmpty ? 'End whisper and return to Main' : 'Delete group'
  const [showEnvironmentPicker, setShowEnvironmentPicker] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(isGreenroom && isGreenRoom)
  const memberCount = members.filter((member) => member.role !== 'SPECTATOR').length
  const environmentGlyph = resolveEnvironmentGlyph(environment || 'Default')
  const memberCards = useMemo(
    () =>
      members.map((member) => ({
        member,
        roleLabel: getRoleLabel(member),
        metaLine: getMetaLine(member),
        statEntries: getStatEntries(member),
        presenceDotState: getPresenceDotState(member.presenceState),
      })),
    [members]
  )

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault()
    const data = event.dataTransfer.getData('text/plain')
    if (!data) return
    try {
      const parsed = JSON.parse(data)
      const targetUserId = parsed?.targetUserId
      if (!canManage) return
      if (targetUserId && onMoveMember) {
        onMoveMember(targetUserId as UUID, room.id as UUID)
      }
    } catch {
      // ignore
    }
  }

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault()
  }

  return (
    <article
      className="session-groups-room-card"
      data-ui-component="SessionGroupCard"
      onDragOver={canManage ? handleDragOver : undefined}
      onDrop={canManage ? handleDrop : undefined}
    >
      <header className="session-groups-room-card__header">
        <div className="session-groups-room-card__header-copy">
          <h4 className="session-groups-room-card__title">{room.name}</h4>
          <p className="session-groups-room-card__subtitle">
            {memberCount} {memberCount === 1 ? 'player' : 'players'}
          </p>
          {!isWhisper ? (
            <p className="session-groups-room-card__environment">
              Environment: {environment || 'Default'}
              {isApplyingEnvironment ? (
                <span className="session-groups-room-card__spinner" aria-hidden="true" />
              ) : null}
            </p>
          ) : null}
        </div>

        <div className="session-groups-room-card__actions">
          {tooltipLabelsEnabled ? (
            <TooltipProvider delayDuration={120}>
              {isGreenroom && isGreenRoom ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="session-groups-room-card__icon-button"
                      aria-label={
                        isCollapsed ? 'Expand Green Room players' : 'Collapse Green Room players'
                      }
                      onClick={() => setIsCollapsed((current) => !current)}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        {isCollapsed ? 'keyboard_arrow_down' : 'keyboard_arrow_up'}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{isCollapsed ? 'Show players' : 'Hide players'}</TooltipContent>
                </Tooltip>
              ) : null}
              {canChangeEnvironment ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="session-groups-room-card__icon-button"
                      aria-label="Change environment"
                      onClick={() => setShowEnvironmentPicker((current) => !current)}
                      disabled={isApplyingEnvironment}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        {environmentGlyph}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Set environment</TooltipContent>
                </Tooltip>
              ) : null}
              {showDrainOrDeleteAction ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className={`session-groups-room-card__icon-button ${actionIcon === 'delete' ? 'session-groups-room-card__icon-button--danger' : ''}`}
                      aria-label={actionLabel}
                      disabled={isClosing || isDeleting}
                      onClick={() => {
                        if (!isWhisper && isEmpty) {
                          onDelete()
                          return
                        }
                        onClose()
                      }}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        {actionIcon}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{actionLabel}</TooltipContent>
                </Tooltip>
              ) : null}
            </TooltipProvider>
          ) : (
            <>
              {isGreenroom && isGreenRoom ? (
                <button
                  type="button"
                  className="session-groups-room-card__icon-button"
                  aria-label={
                    isCollapsed ? 'Expand Green Room players' : 'Collapse Green Room players'
                  }
                  onClick={() => setIsCollapsed((current) => !current)}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    {isCollapsed ? 'keyboard_arrow_down' : 'keyboard_arrow_up'}
                  </span>
                </button>
              ) : null}
              {canChangeEnvironment ? (
                <button
                  type="button"
                  className="session-groups-room-card__icon-button"
                  aria-label="Change environment"
                  onClick={() => setShowEnvironmentPicker((current) => !current)}
                  disabled={isApplyingEnvironment}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    {environmentGlyph}
                  </span>
                </button>
              ) : null}
              {showDrainOrDeleteAction ? (
                <button
                  type="button"
                  className={`session-groups-room-card__icon-button ${actionIcon === 'delete' ? 'session-groups-room-card__icon-button--danger' : ''}`}
                  aria-label={actionLabel}
                  disabled={isClosing || isDeleting}
                  onClick={() => {
                    if (!isWhisper && isEmpty) {
                      onDelete()
                      return
                    }
                    onClose()
                  }}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    {actionIcon}
                  </span>
                </button>
              ) : null}
            </>
          )}
        </div>
      </header>

      {showEnvironmentPicker && canChangeEnvironment ? (
        <div className="session-groups-room-card__environment-picker">
          {ENVIRONMENT_OPTIONS.map((option) => {
            const isSelected = (environment || 'Default').toLowerCase() === option.toLowerCase()
            return (
              <button
                key={option}
                type="button"
                className={isSelected ? 'is-active' : ''}
                onClick={() => {
                  if (isApplyingEnvironment) return
                  onSetEnvironment(option)
                  setShowEnvironmentPicker(false)
                }}
                disabled={isApplyingEnvironment}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  {resolveEnvironmentGlyph(option)}
                </span>
                <span>{option}</span>
              </button>
            )
          })}
        </div>
      ) : null}

      {!isCollapsed && memberCards.length > 0 ? (
        <div className="session-groups-room-card__members">
          {memberCards.map(({ member, roleLabel, metaLine, statEntries, presenceDotState }) => (
            <div
              key={member.userId}
              className={`session-groups-member-card session-groups-member-card--${presenceDotState}`}
              data-ui-component="SessionGroupMemberCard"
              draggable={canManage && member.role !== 'DM'}
              onDragStart={(e) => {
                try {
                  e.dataTransfer.setData(
                    'text/plain',
                    JSON.stringify({ targetUserId: member.userId })
                  )
                  e.dataTransfer.effectAllowed = 'move'
                } catch {
                  // ignore
                }
              }}
            >
              <span
                className={`session-groups-member-card__avatar session-groups-member-card__avatar--${presenceDotState}`}
                aria-hidden="true"
              >
                {member.avatarUrl ? (
                  <img src={member.avatarUrl} alt="" />
                ) : (
                  getDisplayName(member).charAt(0).toUpperCase()
                )}
              </span>
              <div className="session-groups-member-card__body">
                <div className="session-groups-member-card__info">
                  <span className="session-groups-member-card__char-name">
                    {getDisplayName(member)}
                  </span>
                  {getPlayerDetail(member) !== getDisplayName(member) ? (
                    <span className="session-groups-member-card__player-name">
                      {getPlayerDetail(member)}
                    </span>
                  ) : null}
                  <span className="session-groups-member-card__meta">{metaLine}</span>
                </div>
                <div className="session-groups-member-card__aside">
                  <span
                    className={`session-groups-member-card__role-pill session-groups-member-card__role-pill--${roleLabel.toLowerCase()}`}
                  >
                    {roleLabel}
                  </span>
                  {statEntries.length > 0 ? (
                    <div className="session-groups-member-card__stats" aria-label="Ability scores">
                      {statEntries.map(([key, value]) => (
                        <span key={key} className="session-groups-member-card__stat">
                          <strong>{value}</strong>
                          <span>{key}</span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="session-groups-member-card__stats session-groups-member-card__stats--empty" />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  )
}

export default SessionGroupCard
