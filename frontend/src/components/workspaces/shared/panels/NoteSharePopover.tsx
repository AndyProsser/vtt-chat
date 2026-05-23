import { useMemo } from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { NoteVisibility, type UUID } from '@shared'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import type { NotesShareRoom, NotesShareUser } from './useNotesShareContext'

type ShareAudienceMode = 'NONE' | 'EVERYONE' | 'LIMITED'

interface NoteSharePopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  visibility: NoteVisibility
  allowedUsers: UUID[]
  shareUsers: NotesShareUser[]
  shareRooms: NotesShareRoom[]
  roomMemberIdsByRoomId: Record<UUID, UUID[]>
  onSetVisibility: (visibility: NoteVisibility) => void
  onSetAllowedUsers: (nextUsers: UUID[]) => void
  trigger: React.ReactNode
  triggerTooltip: string
}

function toAudienceMode(visibility: NoteVisibility): ShareAudienceMode {
  if (visibility === NoteVisibility.DM_ONLY) {
    return 'NONE'
  }

  if (visibility === NoteVisibility.PLAYERS_VISIBLE) {
    return 'EVERYONE'
  }

  return 'LIMITED'
}

export function NoteSharePopover(props: NoteSharePopoverProps) {
  const selectedUsers = useMemo(() => new Set(props.allowedUsers), [props.allowedUsers])

  const playersById = useMemo(() => {
    return new Map(props.shareUsers.map((player) => [player.id, player]))
  }, [props.shareUsers])

  const groupedPlayerIds = useMemo(() => {
    const groupedIds = new Set<UUID>()
    for (const ids of Object.values(props.roomMemberIdsByRoomId)) {
      for (const userId of ids) {
        groupedIds.add(userId)
      }
    }
    return groupedIds
  }, [props.roomMemberIdsByRoomId])

  const roomGroups = useMemo(() => {
    return props.shareRooms
      .map((room) => {
        const memberIds = props.roomMemberIdsByRoomId[room.id] || []
        const members = memberIds.map((memberId) => playersById.get(memberId)).filter(Boolean)
        return {
          id: room.id,
          name: room.name,
          members: members as NotesShareUser[],
        }
      })
      .filter((room) => room.members.length > 0)
  }, [playersById, props.roomMemberIdsByRoomId, props.shareRooms])

  const offlineGroupMembers = useMemo(() => {
    const seen = new Set<UUID>()
    return props.shareUsers.filter((player) => {
      if (seen.has(player.id)) {
        return false
      }

      const include =
        !groupedPlayerIds.has(player.id) ||
        player.status === 'OFFLINE' ||
        player.status === 'NOT_HERE'

      if (include) {
        seen.add(player.id)
      }

      return include
    })
  }, [groupedPlayerIds, props.shareUsers])

  const audienceMode = toAudienceMode(props.visibility)

  const setAudienceMode = (mode: ShareAudienceMode) => {
    if (mode === 'NONE') {
      props.onSetVisibility(NoteVisibility.DM_ONLY)
      props.onSetAllowedUsers([])
      return
    }

    if (mode === 'EVERYONE') {
      props.onSetVisibility(NoteVisibility.PLAYERS_VISIBLE)
      props.onSetAllowedUsers([])
      return
    }

    props.onSetVisibility(NoteVisibility.CUSTOM)
  }

  const togglePlayer = (userId: UUID) => {
    const next = new Set(selectedUsers)
    if (next.has(userId)) {
      next.delete(userId)
    } else {
      next.add(userId)
    }

    props.onSetAllowedUsers(Array.from(next))
  }

  const toggleGroup = (playerIds: UUID[]) => {
    const next = new Set(selectedUsers)
    const allSelected = playerIds.every((playerId) => next.has(playerId))

    if (allSelected) {
      for (const playerId of playerIds) {
        next.delete(playerId)
      }
    } else {
      for (const playerId of playerIds) {
        next.add(playerId)
      }
    }

    props.onSetAllowedUsers(Array.from(next))
  }

  const renderPlayerCard = (player: NotesShareUser) => {
    const isSelected = selectedUsers.has(player.id)
    return (
      <button
        key={player.id}
        type="button"
        onClick={() => togglePlayer(player.id)}
        className={`notes-share-popover__player ${isSelected ? 'is-selected' : ''}`}
      >
        <span className="notes-share-popover__player-avatar" aria-hidden="true">
          {player.avatarUrl ? <img src={player.avatarUrl} alt="" /> : player.username.slice(0, 1)}
        </span>
        <span className="notes-share-popover__player-copy">
          <span className="notes-share-popover__player-name">{player.username}</span>
          <span className="notes-share-popover__player-character">
            {player.characterName || 'No character'}
          </span>
        </span>
      </button>
    )
  }

  return (
    <PopoverPrimitive.Root open={props.open} onOpenChange={props.onOpenChange}>
      <TooltipProvider delayDuration={140}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverPrimitive.Trigger asChild>{props.trigger}</PopoverPrimitive.Trigger>
          </TooltipTrigger>
          <TooltipContent side="top">{props.triggerTooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="bottom"
          align="end"
          sideOffset={8}
          className="notes-share-popover"
        >
          <div className="notes-share-popover__header">Share Handout</div>

          <div className="notes-share-popover__modes" role="radiogroup" aria-label="Share audience">
            <button
              type="button"
              role="radio"
              aria-checked={audienceMode === 'NONE'}
              onClick={() => setAudienceMode('NONE')}
              className={`notes-share-popover__mode ${audienceMode === 'NONE' ? 'is-selected' : ''}`}
            >
              None
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={audienceMode === 'EVERYONE'}
              onClick={() => setAudienceMode('EVERYONE')}
              className={`notes-share-popover__mode ${audienceMode === 'EVERYONE' ? 'is-selected' : ''}`}
            >
              Everyone
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={audienceMode === 'LIMITED'}
              onClick={() => setAudienceMode('LIMITED')}
              className={`notes-share-popover__mode ${audienceMode === 'LIMITED' ? 'is-selected' : ''}`}
            >
              Limited
            </button>
          </div>

          {audienceMode === 'LIMITED' ? (
            <div className="notes-share-popover__groups">
              {roomGroups.map((group) => {
                const groupIds = group.members.map((member) => member.id)
                const groupSelected = groupIds.every((memberId) => selectedUsers.has(memberId))

                return (
                  <section key={group.id} className="notes-share-popover__group">
                    <button
                      type="button"
                      onClick={() => toggleGroup(groupIds)}
                      className={`notes-share-popover__group-title ${groupSelected ? 'is-selected' : ''}`}
                    >
                      {group.name}
                    </button>
                    <div className="notes-share-popover__players">
                      {group.members.map(renderPlayerCard)}
                    </div>
                  </section>
                )
              })}

              {offlineGroupMembers.length > 0 ? (
                <section className="notes-share-popover__group">
                  <button
                    type="button"
                    onClick={() => toggleGroup(offlineGroupMembers.map((member) => member.id))}
                    className={`notes-share-popover__group-title ${offlineGroupMembers.every((member) => selectedUsers.has(member.id)) ? 'is-selected' : ''}`}
                  >
                    Offline
                  </button>
                  <div className="notes-share-popover__players">
                    {offlineGroupMembers.map(renderPlayerCard)}
                  </div>
                </section>
              ) : null}
            </div>
          ) : null}

          <PopoverPrimitive.Arrow className="notes-share-popover__arrow" />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
