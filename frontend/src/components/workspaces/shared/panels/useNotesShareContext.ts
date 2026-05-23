import { useEffect, useState } from 'react'
import { Role, RoomType, type UUID } from '@shared'

export interface NotesShareUser {
  id: UUID
  username: string
  role: Role | string
  avatarUrl?: string | null
  characterName?: string | null
  status?: 'HERE' | 'AWAY' | 'LOBBY' | 'NOT_HERE' | 'OFFLINE'
}

export interface NotesShareRoom {
  id: UUID
  name: string
  type: RoomType
}

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
        const [partyRes, roomsRes] = await Promise.all([
          fetch(`${params.apiUrl}/api/campaigns/${params.campaignId}/party-presence`, {
            headers: { Authorization: `Bearer ${params.token}` },
          }),
          params.sessionId
            ? fetch(`${params.apiUrl}/api/rooms/session/${params.sessionId}`, {
                headers: { Authorization: `Bearer ${params.token}` },
              })
            : Promise.resolve(null),
        ])

        if (!partyRes.ok) {
          return
        }

        const membersData = await partyRes.json()
        const users = Array.isArray(membersData.members) ? membersData.members : []
        const playerUsers = users
          .filter(
            (candidate: {
              userId: UUID
              username: string
              role: Role | string
              avatarUrl?: string | null
              characterName?: string | null
              status?: 'HERE' | 'AWAY' | 'LOBBY' | 'NOT_HERE' | 'OFFLINE'
            }) => candidate.userId !== params.currentUserId && candidate.role === Role.PLAYER
          )
          .map(
            (candidate: {
              userId: UUID
              username: string
              role: Role | string
              avatarUrl?: string | null
              characterName?: string | null
              status?: 'HERE' | 'AWAY' | 'LOBBY' | 'NOT_HERE' | 'OFFLINE'
            }) => ({
              id: candidate.userId,
              username: candidate.username,
              role: candidate.role,
              avatarUrl: candidate.avatarUrl || null,
              characterName: candidate.characterName || null,
              status: candidate.status,
            })
          )

        let shareableRooms: NotesShareRoom[] = []
        let nextRoomMembers: Record<UUID, UUID[]> = {}

        if (roomsRes && roomsRes.ok) {
          const roomsData = await roomsRes.json()
          const rooms = Array.isArray(roomsData.rooms) ? roomsData.rooms : []
          shareableRooms = rooms.filter(
            (room: NotesShareRoom) => room.type === RoomType.GROUP || room.type === RoomType.MAIN
          )

          const roomMemberEntries = await Promise.all(
            shareableRooms.map(async (room) => {
              try {
                const roomMembersRes = await fetch(
                  `${params.apiUrl}/api/rooms/${room.id}/members`,
                  {
                    headers: { Authorization: `Bearer ${params.token}` },
                  }
                )

                if (!roomMembersRes.ok) {
                  return [room.id, []] as const
                }

                const roomMembersData = await roomMembersRes.json()
                const memberIds = Array.isArray(roomMembersData.members)
                  ? roomMembersData.members.filter((memberId): memberId is UUID =>
                      playerUsers.some((player) => player.id === memberId)
                    )
                  : []

                return [room.id, memberIds] as const
              } catch {
                return [room.id, []] as const
              }
            })
          )

          nextRoomMembers = Object.fromEntries(roomMemberEntries)
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
