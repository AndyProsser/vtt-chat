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
    if (!sessionRooms) {
      return []
    }

    const seen = new Map<UUID, NotesShareUser>()
    for (const room of Object.values(sessionRooms)) {
      const members = roomMembers[room.id] || []
      for (const member of members) {
        if (member.userId === params.currentUserId) {
          continue
        }
        if (member.role !== Role.PLAYER) {
          continue
        }
        if (member.username.startsWith('dev_mock_')) {
          continue
        }

        if (!seen.has(member.userId)) {
          seen.set(member.userId, {
            id: member.userId,
            username: member.username,
            role: member.role,
            avatarUrl: member.avatarUrl || null,
            characterName: member.characterName || null,
            status: 'HERE',
          })
        }
      }
    }

    return Array.from(seen.values())
  }, [params.currentUserId, roomMembers, sessionRooms])

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
