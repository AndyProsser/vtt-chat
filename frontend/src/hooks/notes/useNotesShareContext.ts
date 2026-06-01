import { useEffect, useState } from 'react'
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
  const [shareRooms, setShareRooms] = useState<NotesShareRoom[]>([])
  const [roomMemberIdsByRoomId, setRoomMemberIdsByRoomId] = useState<Record<UUID, UUID[]>>({})

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

        let shareableRooms: NotesShareRoom[] = []
        let nextRoomMembers: Record<UUID, UUID[]> = {}

        // Read rooms from RoomSlice instead of making REST call
        if (params.sessionId) {
          const sessionRooms = useStore.getState().rooms[params.sessionId]
          if (sessionRooms) {
            shareableRooms = Object.values(sessionRooms)
              .filter((room) => room.type === RoomType.GROUP || room.type === RoomType.MAIN)
              .map((room) => ({
                id: room.id,
                name: room.name,
                type: room.type,
              }))
          }
        }

        // Build room member map from Zustand, no REST fallback needed when rooms come from store
        if (shareableRooms.length > 0) {
          const playerUserIds = new Set(playerUsers.map((player) => player.id))
          const roomMembersFromStore = useStore.getState().roomMembers

          for (const room of shareableRooms) {
            const cachedMembers = roomMembersFromStore[room.id]
            if (cachedMembers) {
              const memberIds = cachedMembers
                .map((member) => member.userId)
                .filter((memberId) => playerUserIds.has(memberId))
              nextRoomMembers[room.id] = memberIds
            } else {
              nextRoomMembers[room.id] = []
            }
          }
        }

        if (!cancelled) {
          setShareUsers(playerUsers)
          setShareRooms(shareableRooms)
          setRoomMemberIdsByRoomId(nextRoomMembers)
        }
      } catch {
        if (!cancelled) {
          setShareUsers([])
          setShareRooms([])
          setRoomMemberIdsByRoomId({})
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
