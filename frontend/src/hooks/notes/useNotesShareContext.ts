import { useMemo } from 'react'
import { Role, RoomType, type UUID } from '@shared'
import { useStore } from '@/hooks/useStore'
import type { NotesShareRoom, NotesShareUser } from '@/types/notesShare'

interface UseNotesShareContextParams {
  sessionId?: UUID | null
  currentUserId: UUID
}

export function useNotesShareContext(params: UseNotesShareContextParams) {
  const sessionRooms = useStore((state) =>
    params.sessionId ? state.rooms[params.sessionId] || null : null
  )
  const roomMembers = useStore((state) => state.roomMembers)
  const sessionPresenceByUser = useStore((state) =>
    params.sessionId ? state.sessionPresence[params.sessionId] || null : null
  )

  const shareRooms = useMemo<NotesShareRoom[]>(() => {
    if (!sessionRooms) {
      return []
    }

    return Object.values(sessionRooms)
      .filter((room) => room.type === RoomType.GROUP || room.type === RoomType.MAIN)
      .map((room) => ({
        id: room.id,
        name: room.name,
        type: room.type,
      }))
  }, [sessionRooms])

  const shareUsers = useMemo<NotesShareUser[]>(() => {
    if (!sessionRooms && !sessionPresenceByUser) {
      return []
    }

    const presencePlayersById = new Map<UUID, NotesShareUser>()
    const playerIds = new Set<UUID>()

    for (const presence of Object.values(sessionPresenceByUser || {})) {
      if (presence.userId === params.currentUserId) {
        continue
      }
      if (presence.role !== Role.PLAYER) {
        continue
      }

      playerIds.add(presence.userId)
      presencePlayersById.set(presence.userId, {
        id: presence.userId,
        username: presence.username,
        role: presence.role,
        playerName: presence.playerName || null,
        avatarUrl: presence.avatarUrl || null,
        characterName: presence.characterName || null,
        status: 'HERE',
      })
    }

    const seen = new Map<UUID, NotesShareUser>()
    for (const room of Object.values(sessionRooms || {})) {
      const members = roomMembers[room.id] || []
      for (const member of members) {
        if (member.userId === params.currentUserId) {
          continue
        }
        const memberIsPlayer = member.role === Role.PLAYER || playerIds.has(member.userId)
        if (!memberIsPlayer) {
          continue
        }

        if (!seen.has(member.userId)) {
          seen.set(member.userId, {
            id: member.userId,
            username: member.username,
            role: Role.PLAYER,
            playerName: member.playerName || null,
            avatarUrl: member.avatarUrl || null,
            characterName: member.characterName || null,
            status: 'HERE',
          })
        }
      }
    }

    // Include known player presence records even when they are temporarily not in roomMembers.
    presencePlayersById.forEach((user, userId) => {
      if (!seen.has(userId)) {
        seen.set(userId, user)
      }
    })

    return Array.from(seen.values())
  }, [params.currentUserId, roomMembers, sessionPresenceByUser, sessionRooms])

  const roomMemberIdsByRoomId = useMemo<Record<UUID, UUID[]>>(() => {
    if (shareRooms.length === 0) {
      return {}
    }

    const playerUserIds = new Set(shareUsers.map((player) => player.id))
    const result: Record<UUID, UUID[]> = {}

    for (const room of shareRooms) {
      const roomMembersForRoom = roomMembers[room.id] || []
      result[room.id] = roomMembersForRoom
        .map((member) => member.userId)
        .filter((memberId) => playerUserIds.has(memberId))
    }

    return result
  }, [roomMembers, shareRooms, shareUsers])

  return {
    shareUsers,
    shareRooms,
    roomMemberIdsByRoomId,
  }
}
