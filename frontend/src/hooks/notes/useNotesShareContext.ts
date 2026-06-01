import { useEffect, useMemo, useState } from 'react'
import { Role, RoomType, type UUID } from '@shared'
import { useStore } from '@/hooks/useStore'
import type {
  NotesShareRoom,
  NotesShareUser,
  PartyPresenceMember,
  PartyPresenceResponse,
} from '@/types/notesShare'

interface UseNotesShareContextParams {
  apiUrl: string
  token: string
  campaignId: UUID
  sessionId?: UUID | null
  currentUserId: UUID
}

export function useNotesShareContext(params: UseNotesShareContextParams) {
  const [shareUsers, setShareUsers] = useState<NotesShareUser[]>([])
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

  useEffect(() => {
    let cancelled = false

    const loadShareContext = async () => {
      try {
        const partyRes = await fetch(
          `${params.apiUrl}/api/campaigns/${params.campaignId}/party-presence`,
          {
            headers: { Authorization: `Bearer ${params.token}` },
          }
        )

        if (!partyRes.ok) {
          return
        }

        const membersData = (await partyRes.json()) as PartyPresenceResponse
        const users: PartyPresenceMember[] = Array.isArray(membersData.members)
          ? membersData.members
          : []
        const playerUsers: NotesShareUser[] = users
          .filter(
            (candidate) =>
              candidate.userId !== params.currentUserId &&
              candidate.role === Role.PLAYER &&
              !candidate.username.startsWith('dev_mock_')
          )
          .map((candidate) => ({
            id: candidate.userId,
            username: candidate.username,
            role: candidate.role,
            avatarUrl: candidate.avatarUrl || null,
            characterName: candidate.characterName || null,
            status: candidate.status,
          }))

        if (!cancelled) {
          setShareUsers(playerUsers)
        }
      } catch {
        if (!cancelled) {
          setShareUsers([])
        }
      }
    }

    void loadShareContext()
    return () => {
      cancelled = true
    }
  }, [params.apiUrl, params.campaignId, params.currentUserId, params.sessionId, params.token])

  return {
    shareUsers,
    shareRooms,
    roomMemberIdsByRoomId,
  }
}
